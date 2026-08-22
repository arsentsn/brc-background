# Overview: how this project was built

The subject: the flowing liquid-marble background on the main menu of *Bomb
Rush Cyberfunk* (Team Reptile). The deliverable: [`index.html`](index.html), a
small WebGL page reproducing it, plus React ports in [`react/`](react/).
Companion docs: tooling recipes ([docs/TOOLING.md](docs/TOOLING.md)),
reconstructed screens ([docs/SCREENS.md](docs/SCREENS.md)), and what is and
isn't shipped ([PROVENANCE.md](PROVENANCE.md)).

---

## The toolkit

**RenderDoc**: "what does the GPU actually execute?" Captures pin down the
draw call (one fullscreen sprite), its shader, and every bound input — the
compiled DXBC disassembly (the algorithm itself), per-frame constant-buffer
values, and a **pixel debugger** recording every register for one stepped
pixel. That trace is what every reimplementation decision was checked against.
Driven headlessly (`qrenderdoc --python`) so extraction scripts repeat;
they're in [`scripts/`](scripts/).

**AssetRipper**: "what did the artists author?" Exports the Unity project into
readable form — material YAML, the palette texture's import settings (point,
clamp, sRGB), fonts as TTF, and the C# decompiled to source. Materials
cross-validate disassembly constants; decompiled code answers behavior
questions without guesswork.

**BepInEx**: "does the live game agree?" A small runtime mod (F10 toggle,
touches nothing on disk) hides UI and makes the background fullscreen, enabling
checks captures alone can't do: comparing the entire rendered field against
the reimplementation and measuring the real animation rate from timestamped
screenshots.

**Headless Chrome**: "does the deliverable itself match?" The shipped page
rendered at frozen clock values, compared pixel-by-pixel against the game's
render-target dumps.

## The algorithm

An iterated sine/cosine domain warp, collapsed through a cosine, used as the
coordinate into a long colour ramp:

```glsl
acc = fragCoord / uvScale;
for (i = 1; i <= N; i++) {
    acc.x += step*i + amp.x*sin(freq*i*acc.y + phase);
    acc.y += step*i + amp.y*cos(freq*i*acc.x + phase);
}
m     = cos(mixW*acc.x + (1-mixW)*acc.y) * gain + offset;
col   = ramp[fract(m)];
phase = fract(t * rate) * twoPiApprox;   // yes, an approximation of 2π
```

The accumulator grows large; the visual structure lives in the tiny
perturbations riding on top. Motion comes only from `phase`; the palette never
scrolls. What this is *not* (the hunt started in wrong places): no fluid
simulation, no feedback buffer, no compute shader, no video. One sprite draw,
one fragment shader, one 1-D gradient.

## The constants, and which of them are real

Every value was recovered from the compiled DXBC and cross-validated against
the Unity material the menu draw binds. The properties cover the phase rate,
final offset, x/y mix weight, palette row coordinate, warp amplitudes and
divisor, uv scale, and final multiplier; the iteration count and loop
multipliers are hardcoded rather than properties.

**Only five are live.** Phase rate, warp amplitudes and final multiplier are
immediate literals — those `.mat` values are dead data. Live per-material
inputs: palette row, mix weight, amplitude divisor, uv scale, colour offset;
plus the clock and draw-rect size per draw. Across every Swirl variant, only
those can differ. Other unused properties (editor-only or for other variants):
a UV multiplier and offsets, an editor scrubber, a rotation-axis split,
unit-scale scalars.

## The palette

The shader samples one horizontal atlas row at a fixed `v` coordinate with
**point** filtering and **clamp** wrapping — both from the texture's `.meta`,
since sampler state never appears in frame dumps. The row runs cream, green,
teal/cyan, black, then wraps back to cyan.

Two rules matter:

- **Take colours from the authored PNG, never from a capture tool's dump.**
  The dump converts sRGB to linear floats and re-quantizes lossily in the dark
  channels; the pixel trace proves the dumped bytes differ where it counts.
- **The authored PNG is vertically flipped** relative to D3D texel rows; each
  material samples its own row, all sharing roughly the same stop layout.

The ramp index is a **sign-preserving** fract. At game parameters that never
shows (`m` stays positive), but once scale grows enough for `m` to go negative,
the clamp sampler pins pixels to the first texel.

## Things worth knowing (the gotchas)

- **The collapse is a cosine, not a sine:** `cos` lands near a flat extremum,
  giving the game's broad calm regions; `sin` lands mid-slope, busy and wrong.
  One instruction operand is the whole difference.
- **The phase multiplier is a short-decimal approximation of 2π**, not 2π;
  reproducing the effect closely means reproducing that approximation.
- **Half the material parameters are dead** (see above) — knowing which
  matters when porting variant colour schemes.
- **Animation speed is derived, not tuned:** a component of the engine's
  `_Time` vector times the phase rate puts the loop on the order of a minute or
  two; live measurement agrees within a small tolerance. (Quirk: the clock
  pauses when the window loses focus.)
- **The colour pipeline is a round trip** (sRGB decode → linear → re-encode),
  bytes passing through untouched, so the reimplementation skips conversion.
- **The menu panel is a crop, not a drawing:** the marble is always
  fullscreen; the rounded panel is an alpha mask. The dense left half exists
  every frame; the menu just never shows it.
- **The first frame is deterministic:** the clock counts from scene load, so
  every boot shows the same starting pattern (`?t=0`).

## The menu UI, for completeness

The project also reproduces the whole central-menu screen (code in `views/`,
art in `assets/`; without `assets/` it falls back to a chrome of flat colours
and measured rects). Button behavior comes from the decompiled menu code:

- Hovering swaps the item's colour to white over a **fat orange backdrop** (an
  SDF dilation of the glyphs) and **extends its last character twice**,
  animated, in quick succession. Pressing blinks the text rapidly for a beat,
  with distinct hover/confirm sounds.
- The backdrop can't be faked with stacked text shadows; the page uses an SVG
  blur → threshold → offset filter, which *is* a rounded dilation.
- The menu opens with the control strip closed; its **options** item opens it,
  over the menu. Music loops from load, independent, stopped only by its own
  toggle.

Both screens replay the game's entrance animation, reconstructed from the
prefabs' DOTween components; details in [docs/SCREENS.md](docs/SCREENS.md).

## Verification

Every layer got its own check: the algorithm against RenderDoc pixel traces
(every iteration agreeing, worst deviation far below anything visible); the
shipped page against the game's render target at several frozen clocks, CPU
model and WebGL alike, with every miss the adjacent ramp texel at a band
boundary — fp32 rounding, not an algorithmic error; the full field against
modded fullscreen screenshots, agreeing on nearly all pixels by palette class
at the fitted phase; the animation rate against wall-clock time, within a
small tolerance over a long run; and the reconstructed screens against the
reference, matching almost everywhere and closer over the marble window alone
([docs/SCREENS.md](docs/SCREENS.md)).

The close-comparison claims reproduce only on a machine holding the captures
and transcribed reference ramps, kept outside this repository: a clone contains
the reimplementation, not the game data. `scripts/verify.js` re-runs the pixel
checks when that data is present and says so plainly when it is not.
