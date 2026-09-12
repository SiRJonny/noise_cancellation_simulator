# 2D Noise Cancellation Simulator

A small, interactive, client-side visualization of active noise cancellation. Place noise
sources and cancellation nodes on a canvas and watch the sound waves superpose.

- **Red** = compression (+).
- **Green** = rarefaction (−).
- **Black / background** = where they overlap and cancel (destructive interference ≈ silence).

No build step and no server-side code — just open `index.html`, or host the folder as a
GitHub Pages site.

## Run locally

A Python virtual environment is **not required** — this is a static site with zero Python
dependencies. To serve it locally, use Python's built-in HTTP server:

```bash
# from this folder
python -m http.server 8000
```

Then open <http://localhost:8000>.

(If you prefer a venv for consistency, create one with `python -m venv venv` and then use
`venv\Scripts\python.exe -m http.server 8000` on Windows, or
`venv/bin/python -m http.server 8000` on macOS/Linux — but it is not needed.)

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. Repository **Settings → Pages** → **Source: Deploy from a branch** → select `main` and
   `/ (root)`.
3. The site is served from `index.html`. The included `.nojekyll` keeps Pages from processing
   the markdown files, so the folder is served as-is.

## Controls

| Control | What it does |
| --- | --- |
| **Noise Source** | Click the canvas to add a source that periodically emits wavefronts. |
| **Cancel Node** | Click the canvas to add a node that emits an opposite-sign wavefront when a wavefront touches it. |
| **Alternating polarity** | When on (default), each noise source alternates +1 (red) and −1 (green) pulses; the canceller always emits the opposite sign. |
| **Wall** | Toggle a fixed vertical wall with a gap across the middle. |
| **Move** | Drag any object to reposition it. |
| **Delete** | Click an object to remove it. |
| **Pause / Play** | Freeze or resume the simulation (Space bar). |
| **Speed** | Multiply the propagation / emission speed. |
| **Frequency** | Sound frequency in Hz (default 500 Hz); sets the wavelength. |
| **Gap size** | Height of the opening in the wall, in meters (default 1 m). |
| **Line width** | Thickness of the wavefront rings (px). |
| **Cancel strength** | Amplitude of the anti-noise wave (0–1); below 1 gives partial cancellation. |
| **Clear** | Remove all objects (sources and nodes) and waves. |
| **Reset waves** | Remove all waves only, keeping the sources, nodes and wall. |

## Files

- `index.html` — page structure
- `styles.css` — styling
- `app.js` — simulation (pressure field, wave propagation, interaction)
- `physics-summary.md` — the physics: sound propagation in open air and why the model is (mostly) correct
- `.nojekyll` — keeps GitHub Pages serving the folder as-is
