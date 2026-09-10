(() => {
  'use strict';

  // ---- Tunables ---------------------------------------------------------
  const CELL = 4;                // simulation grid cell size (CSS px)
  const BASE_HALF_WIDTH = 5;     // wavefront band half-thickness (px)
  const BASE_WAVE_SPEED = 130;   // propagation speed (CSS px / second)

  // ---- Colors (RGB) -----------------------------------------------------
  const BG = [13, 17, 23];
  const RED = [255, 84, 84];     // noise  = compression (+)
  const GREEN = [70, 220, 135];  // anti-noise = rarefaction / inverted (−)
  const GREY = [202, 210, 218];  // cancelled region (light grey)

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
  const modeButtons = Array.from(document.querySelectorAll('.mode'));

  // ---- State ------------------------------------------------------------
  let sources = [];   // { x, y, timer }
  let nodes = [];     // { x, y }
  let waves = [];     // { x, y, r, type: 'noise' | 'anti', triggered:Set }
  let mode = 'noise';
  let running = true;
  let speed = 0.5;
  let frequency = 2;   // pulses per second (Hz)

  let cssW = 0, cssH = 0, dpr = 1;
  let gridW = 0, gridH = 0;
  let redField = null, greenField = null;
  let offscreen = null, offCtx = null, imageData = null;

  let drag = null;    // { type, index }
  let initialized = false;

  // ---- Helpers ----------------------------------------------------------
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Wavefronts keep a constant thickness. A real pulse does not physically
  // widen as it travels in (non-dispersive) air — its energy spreads over a
  // larger circle, which lowers amplitude instead. This lossless model keeps
  // amplitude constant too, so the rings stay the same width and brightness.
  function ringHalfWidth() {
    return BASE_HALF_WIDTH;
  }

  // ---- Sizing -----------------------------------------------------------
  function resize() {
    const rect = wrap.getBoundingClientRect();
    cssW = Math.max(1, rect.width);
    cssH = Math.max(1, rect.height);
    dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    gridW = Math.ceil(cssW / CELL);
    gridH = Math.ceil(cssH / CELL);

    redField = new Float32Array(gridW * gridH);
    greenField = new Float32Array(gridW * gridH);

    offscreen = document.createElement('canvas');
    offscreen.width = gridW;
    offscreen.height = gridH;
    offCtx = offscreen.getContext('2d');
    imageData = offCtx.createImageData(gridW, gridH);

    if (!initialized) {
      initialized = true;
      // Seed a small example so the page is immediately illustrative.
      sources.push({ x: cssW * 0.18, y: cssH * 0.5, timer: 0 });
      nodes.push({ x: cssW * 0.42, y: cssH * 0.5 });
    }
  }

  // ---- Simulation -------------------------------------------------------
  function update(dt) {
    const sdt = dt * speed;

    // 1) Emit noise wavefronts from each source.
    for (const s of sources) {
      s.timer -= sdt;
      if (s.timer <= 0) {
        s.timer += 1 / frequency;
        waves.push({ x: s.x, y: s.y, r: 0, type: 'noise', triggered: new Set() });
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
    //    moved past the node this frame, so it is tangent to the red wavefront
    //    instead of running slightly ahead of it.
    const pending = [];
    for (const n of nodes) {
      for (const w of waves) {
        if (w.type !== 'noise' || w.triggered.has(n)) continue;
        const d = Math.hypot(w.x - n.x, w.y - n.y);
        if (w.prevR < d && w.r >= d) {
          w.triggered.add(n);
          pending.push({ x: n.x, y: n.y, r: w.r - d, type: 'anti' });
        }
      }
    }
    if (pending.length) waves.push(...pending);

    // 4) Drop wavefronts that have left the visible area.
    const maxR = Math.hypot(cssW, cssH) + 60;
    waves = waves.filter((w) => w.r <= maxR);
  }

  function stampRing(field, x, y, r, halfW) {
    const cx = x / CELL;
    const cy = y / CELL;
    const outer = (r + halfW) / CELL;

    const minX = Math.max(0, Math.floor(cx - outer));
    const maxX = Math.min(gridW - 1, Math.ceil(cx + outer));
    const minY = Math.max(0, Math.floor(cy - outer));
    const maxY = Math.min(gridH - 1, Math.ceil(cy + outer));

    for (let gy = minY; gy <= maxY; gy++) {
      const py = gy * CELL + CELL / 2;
      const row = gy * gridW;
      for (let gx = minX; gx <= maxX; gx++) {
        const px = gx * CELL + CELL / 2;
        const dx = px - x;
        const dy = py - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const delta = d - r;
        if (delta < -halfW || delta > halfW) continue;
        const t = delta / halfW;        // -1 .. 1
        field[row + gx] += 1 - t * t;   // smooth bump: peak 1 on the crest
      }
    }
  }

  function render() {
    // Stamp the pressure field: red waves add +pressure, green waves add −pressure.
    redField.fill(0);
    greenField.fill(0);
    for (const w of waves) {
      const halfW = ringHalfWidth(w.r);
      if (w.type === 'noise') stampRing(redField, w.x, w.y, w.r, halfW);
      else stampRing(greenField, w.x, w.y, w.r, halfW);
    }

    // Convert the field into pixels.
    const data = imageData.data;
    const EPS = 0.03;
    const n = gridW * gridH;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const red = redField[i];
      const green = greenField[i];
      const total = red + green;

      if (total <= EPS) {
        data[p] = BG[0]; data[p + 1] = BG[1]; data[p + 2] = BG[2]; data[p + 3] = 255;
        continue;
      }

      const net = red - green;
      const t = net / total; // -1 (pure green) .. 0 (cancelled) .. +1 (pure red)
      let cr, cg, cb;
      if (t >= 0) {
        const s = smoothstep(0, 1, t);
        cr = lerp(GREY[0], RED[0], s);
        cg = lerp(GREY[1], RED[1], s);
        cb = lerp(GREY[2], RED[2], s);
      } else {
        const s = smoothstep(0, 1, -t);
        cr = lerp(GREY[0], GREEN[0], s);
        cg = lerp(GREY[1], GREEN[1], s);
        cb = lerp(GREY[2], GREEN[2], s);
      }

      const a = clamp(total, 0, 1);
      data[p] = Math.round(cr * a + BG[0] * (1 - a));
      data[p + 1] = Math.round(cg * a + BG[1] * (1 - a));
      data[p + 2] = Math.round(cb * a + BG[2] * (1 - a));
      data[p + 3] = 255;
    }
    offCtx.putImageData(imageData, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(offscreen, 0, 0, cssW, cssH);

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
      sources.push({ x, y, timer: 0 });
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
    noise: 'Click the canvas to place a noise source (red).',
    node: 'Click the canvas to place a cancellation node (green).',
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
    freqVal.textContent = frequency.toFixed(1) + ' Hz';
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
