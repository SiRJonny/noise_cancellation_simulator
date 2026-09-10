# Sound propagation in open air & the theory behind this simulator

## Short answer

**Yes — the proposed model is "mostly correct" as a simplified schematic of active noise
cancellation (ANC) in open air.** It captures the two ideas that actually matter:
superposition and destructive interference.

- A **noise source** (red) emits pressure waves. In a 2D top-down view these are expanding
  **circular wavefronts** — the standard way to draw a point source.
- A **cancellation node** (green) is a secondary source that, when the noise wavefront reaches
  it, emits an **inverted (anti-phase) copy**. This is a "Huygens secondary source".
- Where red and green overlap, the two waves **superpose**: a compression (+1) plus an inverted
  rarefaction (−1) sums to ≈ 0, i.e. **destructive interference** — so that region is drawn
  **light grey** (≈ silence).

## How sound travels in open air

- Sound is a **longitudinal pressure wave**: air molecules move back and forth *along* the
  direction of travel, producing alternating **compressions** (higher pressure) and
  **rarefactions** (lower pressure). *(Phys LibreTexts; Stanford CCRMA acoustics notes.)*
- A small source in free space radiates **spherical** wavefronts in 3D; a 2D "top-down" slice
  of that sphere is a set of **concentric circles**, exactly like ripples on a pond.
  *(Phys LibreTexts, "Multi-Dimensional Waves".)*
- Waves obey the **superposition principle**: where two waves meet, the pressures simply add,
  and each wave then continues on unaffected. *(ProSoundWeb.)*
- Far from the source the curvature flattens and the wavefront approximates a **plane wave**.
  *(Stanford CCRMA.)*

## Active noise cancellation

- ANC works by **destructive interference**: a speaker emits a wave with the **same amplitude
  but inverted phase (anti-phase, 180° out of phase)**. If the incoming noise is `+A`, the
  anti-noise is `−A`, and `+A + (−A) = 0`. *(Wikipedia — Active noise control; SmartBuyLabs.)*
- The "cancellation node" in this simulator is that anti-noise source: when the noise wavefront
  arrives, it emits an inverted wavefront. That "emit when touched" behavior is a concrete
  example of the **Huygens(–Fresnel) principle**, where every point on a wavefront acts as a
  source of new wavelets. *(Wikipedia — Huygens–Fresnel principle.)*

## Why the model is "mostly correct" (and its simplifications)

Captured correctly:

1. Circular (2D) propagation from a point source.
2. **Superposition** — red and green pressures are added together in the field.
3. **Anti-phase cancellation** — red = compression, green = rarefaction, overlap = net zero.
4. **Secondary (Huygens) source** — a node only emits once a wavefront reaches it.

Simplifications / caveats:

1. **Pulses vs. continuous waves.** Real sources emit continuous sinusoids (alternating
   compressions and rarefactions). Here each "circle" is a single pulse (one crest) for clarity.
2. **Perfect global cancellation is not real.** In open air the anti-wave matches the noise only
   in certain regions; elsewhere they can be misaligned or **constructively interfere** (make it
   louder). ANC in 3D is typically local — a "quiet zone" — not silence everywhere.
   *(Wikipedia — Active noise control.)*
3. **Amplitude matching is assumed.** Real cancellation needs the anti-noise to match the noise's
   amplitude and phase *at the listener*, which real ANC does adaptively with microphones and DSP.
   This simulator simply gives both waves equal amplitude.
4. **No spreading loss, reflections, diffraction, or absorption.** Real open-air sound spreads
   out (amplitude falls with distance), reflects off surfaces, and is absorbed by air. These are
   ignored here to keep the picture clean. Wavefronts are drawn at a **constant thickness** — a
   real pulse keeps its shape in non-dispersive air; what actually spreads is its energy over a
   larger circle (so amplitude drops), which this lossless model omits.
5. **2D vs. 3D.** Sound is 3D; this is a 2D slice (like a pond ripple), which is the standard
   visualization but only a slice of the real spherical field.

## Sources

- [8.3: Multi-Dimensional Waves — Physics LibreTexts](https://phys.libretexts.org/Courses/University_of_California_Davis/UCD:_Physics_7C_-_General_Physics/8:_Waves/8.3:_Multi-Dimensional_Waves)
- [Active noise control — Wikipedia](https://en.wikipedia.org/wiki/Active_noise_control)
- [Huygens–Fresnel principle — Wikipedia](https://en.wikipedia.org/wiki/Huygens%E2%80%93Fresnel_principle)
- [1 Acoustics: the study of sound waves — Stanford CCRMA](https://ccrma.stanford.edu/~jay/subpages/Lectures/Lecture1-Acoustics.pdf)
- [Sound Wave Propagation: The Bigger Picture Of What We Hear — ProSoundWeb](https://www.prosoundweb.com/sound-wave-propagation-the-bigger-picture-of-what-we-hear/)
- [How Noise Cancellation Actually Works — SmartBuyLabs](https://smartbuylabs.com/how-noise-cancellation-works/)
