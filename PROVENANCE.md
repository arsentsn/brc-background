# Provenance

Where this effect came from, what is original, and what deliberately is not
included.

## What this is

`index.html` is a from-scratch WebGL implementation of an **iterated
sine/cosine domain-warp** background: a full-screen fragment shader that warps
a coordinate through repeated sine/cosine iterations, collapses the result
through a cosine, and uses it as the coordinate into a long colour ramp.

The algorithm and its constants were determined by studying the main-menu
background shader of **Bomb Rush Cyberfunk** (Team Reptile), a commercial game,
using RenderDoc frame captures and shader disassembly
([OVERVIEW.md](OVERVIEW.md), [docs/TOOLING.md](docs/TOOLING.md)). This project
is **not affiliated with, endorsed by, or approved by Team Reptile**; their
trademark is used only to describe what was studied.

## What is original, and what is not

| | Status |
|---|---|
| GLSL implementation, WebGL page, UI, ramp builder; research tooling in `scripts/`; invented colour presets | Original work, MIT licensed |
| The shader's **numeric constants** and iteration count | Read out of the game's compiled shader; retained — they *are* the algorithm |
| The **multi-band ramp layout** | Read from the game's colour atlas; retained as structural parameterisation, exposed as `SEGS` |
| The two original materials' **band colours** | Included as presets: a handful of values about as thin as content gets, and the point of a reconstruction |
| The ramps' **verbatim byte layout** | **Not included** — the ramp is rebuilt from the stops by this project's own code |
| Shader disassembly, texture dumps, frame captures, rendered output | **Not included.** See below |

The line drawn here: the algorithm, its parameters, and the handful of colours
that identify the look are *how the effect works*, and reproducing them is the
point of a reconstruction. What is not included is the asset itself: the PNG
and the verbatim ramp it encodes. Naming a few colours is not shipping a copy
of the file.

An earlier revision excluded the original colours entirely — an over-correction
that made the project worse at its purpose while protecting nothing, since
colour values are not themselves protectable.

## What is not in this repository, by design

The raw capture material stays in a separate workspace on the maintainer's
machine; `scripts/check-provenance.sh` runs in CI on every push and fails if
any of it ever appears:

- **RenderDoc captures** of the running game, and everything read out of them:
  shader disassembly, constant-buffer values, pixel traces.
- **The game's colour atlas**, dumped and as source asset with importer
  metadata, plus the verbatim ramps transcribed from it.
- **Captured frames of rendered output**, used as comparison targets.
- **UI pixels and audio:** screen overlays, UI-atlas sprites, menu sounds and
  music, the font extracted from the bundle — game assets rather than data
  transcribed from them. **This one category ships**, on the terms below.

The *code* drawing those screens ([docs/SCREENS.md](docs/SCREENS.md)) is
original work in `views/`: geometry, timings and behaviour read out of prefabs
and decompiled classes, the same class of datum as the shader constants. The
assets those screens draw ship too, in `assets/` — deliberate, since keeping
their pixels outside the tree meant the reconstruction showed nothing anywhere
but the maintainer's machine. These are the game's, not ours: a non-commercial
fan recreation of one screen, published for nothing; no substitute for the
game. If the rights holder objects, an issue suffices — it comes straight back
out, and `views/menuview.js` falls back to a rebuilt chrome, so removing
`assets/` degrades rather than breaks. The raw reverse-engineering material
stays excluded regardless.

**The typeface:** `assets/menu/induction.ttf` is the game's own copy, named
`Induction Edit` — a Fontself-built derivative adding true lowercase to Raymond
Larabie's unicase original. It ships with `assets/`; the underlying design is
[**CC0 / public domain**](https://creativecommons.org/publicdomain/zero/1.0/),
so there is no licence to carry. Drop `assets/` and text falls back to
monospace via the `font-family` chains.

Nothing game-derived is inlined as a `data:` URI either — that would be game
pixels committed by another route, however convenient for CSS masking from
`file://`.

A clone contains everything the page needs; every ramp is rebuilt at runtime
from colour stops, so deleting `assets/` still leaves a working page. Only the
close-comparison verification scripts want the raw capture data, and they say
so plainly when it is absent.

## For contributors and maintainers

If you are considering vendoring this component into a library granting
commercial-use rights to third parties, weigh that yourself: the algorithm is a
reimplementation of a shader in *Bomb Rush Cyberfunk*, as several widely-
distributed "Balatro background" components are of that game's shader. A real
consideration, not a settled question, and your call.

## Reproducing the comparison claims (maintainer only)

These claims reproduce only on a machine holding the reference data above; the
scripts expect the workspace beside the repository and then need no arguments:

```sh
node scripts/verify.js            # reference-pixel checks
node scripts/render.js            # CPU replica frame, written into the workspace
```

Anywhere else, point them at it via `BRC_WORKSPACE`, or per-file variables
(`BRC_REFERENCE` / `BRC_PICK` / `BRC_OUT`; `BRC_DUMP`, `BRC_CAPTURE`, `BRC_EID`
for the RenderDoc scripts — see [docs/TOOLING.md](docs/TOOLING.md)). When data
is absent each script names the path it wanted and exits rather than reporting
a false pass; under qrenderdoc's `--python` they need `BRC_DUMP` or
`BRC_WORKSPACE` set, since no `__file__` exists to resolve. No script writes
game-derived output into the repository or contains a machine-specific path.
