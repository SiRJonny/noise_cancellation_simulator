(() => {
  'use strict';

  // ---- Tunables ---------------------------------------------------------
  const CELL = 4;                // simulation grid cell size (CSS px)
  const BASE_WAVE_SPEED = 130;   // visual propagation speed (CSS px / second)
  const SPEED_OF_SOUND = 343;    // m/s (real-world speed of sound)
  const PX_PER_METER = 100;      // display scale: 1 m = 100 px

  // ---- Colors (RGB) -----------------------------------------------------
  const BG = [0, 0, 0];          // background (also = fully-cancelled region)
  const RED = [150, 50, 50];     // noise  = compression (+)
  const GREEN = [35, 110, 65];   // anti-noise = rarefaction / inverted (−)

  // ---- DOM --------------------------------------------------------------
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('canvas-wrap');
  const hint = document.getElementById('hint');
  const playBtn = document.getElementById('btn-play');
  const clearBtn = document.getElementById('btn-clear');
  const speedInput = document.getElementById('speed');
  const speedVal = document.getElementById('speed-val');
  const freqInput = document.getElementById('freq');
  const freqVal = document.getElementById('freq-val');
  const widthInput = document.getElementById('linewidth');
  const widthVal = document.getElementById('linewidth-val');
  const strengthInput = document.getElementById('strength');
  const strengthVal = document.getElementById('strength-val');
  const alternateInput = document.getElementById('alternate');
  const wallInput = document.getElementById('wall');
  const gapInput = document.getElementById('gap');
  const gapVal = document.getElementById('gap-val');
  const modeButtons = Array.from(document.querySelectorAll('.mode'));

  // ---- State ------------------------------------------------------------
  let sources = [];   // { x, y, timer, sign }
  let nodes = [];     // { x, y }
  let waves = [];     // { x, y, r, type: 'noise' | 'anti', amp, triggered:Set }
  let mode = 'noise';
  let running = true;
  let speed = 0.5;
  let frequency = 500;   // Hz (real-world sound frequency)
  let lineWidth = 30;      // full stroke width in px (3× the old ~10 px)
  let nodeStrength = 1;    // 0..1 amplitude of anti-noise waves
  let alternate = true;    // noise source emits alternating +1 / −1 pulses
  let wallEnabled = true;  // vertical wall with a gap across the middle
  let gapMeters = 1;       // gap opening height in meters

  let cssW = 0, cssH = 0, dpr = 1;
  let wallX = 0;   // x position of the wall (set to cssW / 2 on resize)
  let gridW = 0, gridH = 0;
  let field = null;   // signed pressure field (+ = compression, − = rarefaction)
  let offscreen = null, offCtx = null, imageData = null;

  let drag = null;    // { type, index }
  let initialized = false;

  // ---- Helpers ----------------------------------------------------------
  const TAU = Math.PI * 2;

  // Wavefronts keep a constant thickness (set by the "Line width" slider).
  function halfWidth() {
    return lineWidth / 2;
  }

  // ---- Sizing -----------------------------------------------------------
  function resize() {
    const rect = wrap.getBoundingClientRect();
    cssW = Math.max(1, rect.width);
    cssH = Math.max(1, rect.height);
    dpr = window.devicePixelRatio || 1;
    wallX = cssW / 2;

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    gridW = Math.ceil(cssW / CELL);
    gridH = Math.ceil(cssH / CELL);

    field = new Float32Array(gridW * gridH);

    offscreen = document.createElement('canvas');
    offscreen.width = gridW;
    offscreen.height = gridH;
    offCtx = offscreen.getContext('2d');
    imageData = offCtx.createImageData(gridW, gridH);

    if (!initialized) {
      initialized = true;
      // Seed a small example so the page is immediately illustrative.
      sources.push({ x: cssW * 0.18, y: cssH * 0.5, timer: 0, sign: 1 });
      nodes.push({ x: cssW * 0.42, y: cssH * 0.5 });
    }
  }

  // ---- Simulation -------------------------------------------------------
  function update(dt) {
    const sdt = dt * speed;
    const wavelengthPx = SPEED_OF_SOUND * PX_PER_METER / frequency; // physical wavelength (px)
    const emitPeriod = wavelengthPx / BASE_WAVE_SPEED;              // so rings are λ apart
    const gapPx = gapMeters * PX_PER_METER;

    // 1) Emit noise wavefronts from each source (alternating polarity if enabled).
    for (const s of sources) {
      s.timer -= sdt;
      if (s.timer <= 0) {
        s.timer += emitPeriod;
        const amp = alternate ? s.sign : 1;
        if (alternate) s.sign = -s.sign;
        waves.push({ x: s.x, y: s.y, r: 0, type: 'noise', amp, triggered: new Set() });
      }
    }

    // 2) Advance every wavefront (remember the previous radius for crossing tests).
    const dr = BASE_WAVE_SPEED * sdt;
    for (const w of waves) {
      w.prevR = w.r;
      w.r += dr;
    }

    // 3) Trigger a cancellation node when the noise crest first reaches it.
    //    Launch the anti-wave in phase: give it the radius the crest has already
    //    moved past the node this frame, so it is tangent to the noise wavefront
    //    instead of running slightly ahead of it.
    const pending = [];
    for (const n of nodes) {
      for (const w of waves) {
        if (w.type !== 'noise' || w.triggered.has(n)) continue;
        const d = Math.hypot(w.x - n.x, w.y - n.y);
        if (w.prevR < d && w.r >= d) {
          w.triggered.add(n);
          pending.push({ x: n.x, y: n.y, r: w.r - d, type: 'anti', amp: -Math.sign(w.amp) * nodeStrength });
        }
      }
    }
    if (pending.length) waves.push(...pending);

    // 3b) Wall diffraction: when a wavefront first reaches the wall, re-emit a
    //     diffracted wave from the gap opening (Huygens). Narrow gap vs λ → wide
    //     semicircular spread; wide gap vs λ → narrow beam.
    if (wallEnabled) {
      const theta = Math.asin(Math.min(wavelengthPx / Math.max(gapPx, 1e-6), 1));
      const diffracted = [];
      for (const w of waves) {
        if (w.sector) continue;              // already-diffracted waves don't re-diffract
        const dWall = Math.abs(wallX - w.x);
        if (w.prevR < dWall && w.r >= dWall) {
          const dir = Math.sign(wallX - w.x);          // +1 → right, −1 → left
          const baseAng = dir > 0 ? 0 : Math.PI;
          diffracted.push({
            x: wallX, y: cssH / 2,
            r: w.r - dWall,                             // overshoot keeps it in phase
            type: w.type,
            amp: w.amp,
            triggered: (w.type === 'noise') ? new Set() : null,
            sector: [baseAng - theta, baseAng + theta]
          });
        }
      }
      if (diffracted.length) waves.push(...diffracted);
    }

    // 4) Drop wavefronts that have left the visible area.
    const maxR = Math.hypot(cssW, cssH) + 60;
    waves = waves.filter((w) => w.r <= maxR);
  }

  function stampRing(field, x, y, r, halfW, amp, sector) {
    const cx = x / CELL;
    const cy = y / CELL;
    const outer = (r + halfW) / CELL;

    const minX = Math.max(0, Math.floor(cx - outer));
    const maxX = Math.min(gridW - 1, Math.ceil(cx + outer));
    const minY = Math.max(0, Math.floor(cy - outer));
    const maxY = Math.min(gridH - 1, Math.ceil(cy + outer));

    // Wall clip: a wave cannot cross the wall; it is blocked on the opposite side.
    const side = wallEnabled ? Math.sign(x - wallX) : 0;

    for (let gy = minY; gy <= maxY; gy++) {
      const py = gy * CELL + CELL / 2;
      const row = gy * gridW;
      for (let gx = minX; gx <= maxX; gx++) {
        const px = gx * CELL + CELL / 2;
        if (side !== 0 && Math.sign(px - wallX) === -side) continue;  // blocked by wall
        if (sector) {
          const ang = Math.atan2(py - y, px - x);
          if (!angleInSector(ang, sector[0], sector[1])) continue;     // outside the beam
        }
        const dx = px - x;
        const dy = py - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const delta = d - r;
        if (delta < -halfW || delta > halfW) continue;
        const t = delta / halfW;        // -1 .. 1
        field[row + gx] += amp * (1 - t * t);   // smooth bump: peak "amp" on the crest
      }
    }
  }

  function angleInSector(ang, a0, a1) {
    let a = ang % TAU; if (a < 0) a += TAU;
    let s0 = a0 % TAU; if (s0 < 0) s0 += TAU;
    let s1 = a1 % TAU; if (s1 < 0) s1 += TAU;
    if (s0 <= s1) return a >= s0 && a <= s1;
    return a >= s0 || a <= s1;   // wraps across 0
  }

  function render() {
    // Stamp every wavefront into the single signed pressure field.
    field.fill(0);
    const halfW = halfWidth();
    for (const w of waves) {
      if (w.amp === 0) continue;   // skip silent anti-waves (strength = 0)
      stampRing(field, w.x, w.y, w.r, halfW, w.amp, w.sector);
    }

    // Convert the net pressure field into pixels.
    //   net > 0 → red,  net < 0 → green,  net = 0 → background (black).
    // Linear scale: 0 → background, 1 → base colour, 2 → "double strength" (capped).
    const data = imageData.data;
    const n = gridW * gridH;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const net = field[i];
      if (net === 0) {
        data[p] = BG[0]; data[p + 1] = BG[1]; data[p + 2] = BG[2]; data[p + 3] = 255;
        continue;
      }
      const f = Math.min(Math.abs(net), 2);
      const base = net > 0 ? RED : GREEN;
      data[p]     = Math.min(255, Math.round(f * base[0]));
      data[p + 1] = Math.min(255, Math.round(f * base[1]));
      data[p + 2] = Math.min(255, Math.round(f * base[2]));
      data[p + 3] = 255;
    }
    offCtx.putImageData(imageData, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(offscreen, 0, 0, cssW, cssH);

    drawWall();
    drawObjects();
  }

  function drawObjects() {
    for (const s of sources) drawSource(s.x, s.y);
    for (const n of nodes) drawNode(n.x, n.y);
  }

  function drawSource(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, TAU);
    ctx.fillStyle = 'rgba(255, 88, 88, 0.95)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  function drawNode(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, TAU);
    ctx.fillStyle = 'rgba(64, 205, 128, 0.95)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.stroke();
    // A minus sign = inverted / anti-phase source.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 4.5, y - 1.25, 9, 2.5);
  }

  function drawWall() {
    if (!wallEnabled) return;
    const gapPx = gapMeters * PX_PER_METER;
    const gapTop = cssH / 2 - gapPx / 2;
    const gapBottom = cssH / 2 + gapPx / 2;
    ctx.fillStyle = '#8b949e';
    if (gapTop > 0) ctx.fillRect(wallX - 2, 0, 4, gapTop);
    if (gapBottom < cssH) ctx.fillRect(wallX - 2, gapBottom, 4, cssH - gapBottom);
  }

  // ---- Interaction ------------------------------------------------------
  function canvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function hitTest(x, y) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (Math.hypot(nodes[i].x - x, nodes[i].y - y) <= 13) return { type: 'node', index: i };
    }
    for (let i = sources.length - 1; i >= 0; i--) {
      if (Math.hypot(sources[i].x - x, sources[i].y - y) <= 13) return { type: 'source', index: i };
    }
    return null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const { x, y } = canvasPos(e);

    if (mode === 'noise') {
      sources.push({ x, y, timer: 0, sign: 1 });
      return;
    }
    if (mode === 'node') {
      nodes.push({ x, y });
      return;
    }

    const hit = hitTest(x, y);
    if (!hit) return;

    if (mode === 'delete') {
      if (hit.type === 'source') sources.splice(hit.index, 1);
      else nodes.splice(hit.index, 1);
      return;
    }

    if (mode === 'move') {
      drag = hit;
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      const { x, y } = canvasPos(e);
      if (drag.type === 'source') {
        sources[drag.index].x = x;
        sources[drag.index].y = y;
      } else {
        nodes[drag.index].x = x;
        nodes[drag.index].y = y;
      }
      return;
    }

    if (mode === 'move' || mode === 'delete') {
      const { x, y } = canvasPos(e);
      canvas.style.cursor = hitTest(x, y) ? 'pointer' : 'default';
    } else {
      canvas.style.cursor = 'crosshair';
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (drag) {
      drag = null;
      canvas.releasePointerCapture(e.pointerId);
    }
  });
  canvas.addEventListener('pointercancel', () => { drag = null; });

  // ---- UI ---------------------------------------------------------------
  const HINTS = {
    noise: 'Click the canvas to place a noise source.',
    node: 'Click the canvas to place a cancellation node.',
    move: 'Drag an object to move it.',
    delete: 'Click an object to delete it.'
  };

  function setMode(next) {
    mode = next;
    for (const b of modeButtons) b.classList.toggle('active', b.dataset.mode === next);
    hint.textContent = HINTS[next];
    canvas.style.cursor = (next === 'move' || next === 'delete') ? 'default' : 'crosshair';
  }

  for (const b of modeButtons) {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  }

  playBtn.addEventListener('click', () => {
    running = !running;
    playBtn.textContent = running ? '⏸ Pause' : '▶ Play';
  });

  clearBtn.addEventListener('click', () => {
    sources = [];
    nodes = [];
    waves = [];
  });

  speedInput.addEventListener('input', () => {
    speed = parseFloat(speedInput.value);
    speedVal.textContent = speed.toFixed(2) + '×';
  });

  freqInput.addEventListener('input', () => {
    frequency = parseFloat(freqInput.value);
    freqVal.textContent = Math.round(frequency) + ' Hz';
  });

  widthInput.addEventListener('input', () => {
    lineWidth = parseFloat(widthInput.value);
    widthVal.textContent = lineWidth + ' px';
  });

  strengthInput.addEventListener('input', () => {
    nodeStrength = parseFloat(strengthInput.value);
    strengthVal.textContent = nodeStrength.toFixed(2);
  });

  alternateInput.addEventListener('change', () => {
    alternate = alternateInput.checked;
    for (const s of sources) s.sign = 1;   // restart alternation on red (+)
  });

  wallInput.addEventListener('change', () => {
    wallEnabled = wallInput.checked;
  });

  gapInput.addEventListener('input', () => {
    gapMeters = parseFloat(gapInput.value);
    gapVal.textContent = gapMeters.toFixed(2) + ' m';
  });

  window.addEventListener('resize', resize);

  // ---- Main loop --------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (running) update(dt);
    render();
    requestAnimationFrame(frame);
  }

  resize();
  setMode('noise');
  requestAnimationFrame(frame);
})();
