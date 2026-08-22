# Marble: React component

The [root effect](../README.md) packaged as a React component, in TypeScript or
JavaScript. The container styles live in the component itself, so there is no
stylesheet.

It depends on `ogl`. No game assets are involved; see [PROVENANCE.md](../PROVENANCE.md).

```
Marble.tsx        ← source of truth
Marble.jsx        ← generated (types stripped)
registry/         ← generated (shadcn registry items)
MarbleDemo.jsx    ← plain-React demo with controls
build.mjs         ← regenerates Marble.jsx and the registry items
```

Edit `Marble.tsx`, then:

```sh
node react/build.mjs
```

CI regenerates on every push and fails on drift. `build.mjs` strips types with regexes
rather than a compiler to keep tooling light; anything unrecognised fails the build
instead of being written out.

## Usage

```jsx
import Marble from './Marble';

<Marble colors={['#ffcf87', '#ff7a5c', '#b02d6e', '#150a12', '#ff9448']} />;
```

The component fills its parent, so give the parent a size.

## Props

| Prop | Type | Default | |
|---|---|---|---|
| `colors` | `string[]` | five-colour "ember" ramp | Band colours in order. Any length. |
| `bands` | `[number, number][]` | tuned five-band layout | Inclusive texel ranges in the ramp texture. Ignored unless its length matches `colors`, in which case bands are split evenly. |
| `scale` | `number` | `1` | Zoom. Larger zooms out into a denser field; smaller is broader. |
| `speed` | `number` | slow tuned default | Morph cycles per second; the default is the studied shader's rate. |
| `offset` | `number` | small constant | Offset into the ramp. Does not scroll. |
| `iterations` | `number` | tuned default | Warp iterations. |
| `amplitude` | `number` | `1` | Multiplier over the base warp amplitude. |
| `collapse` | `number` | tuned default | How the 2-D accumulator collapses to one scalar (`collapse * acc.x + (1 - collapse) * acc.y`). The default lands near a cosine extremum, keeping bands broad; near `1` lands mid-slope for much denser banding, as in the original's splash and save-slot screens. |
| `paused` | `boolean` | `false` | Freeze on the current frame. |
| `dpr` | `number` | capped device ratio | Render resolution. |
| `className` | `string` | `''` | Set on the container. |
| `style` | `CSSProperties` | | Merged **over** the container's own styles. |

Notes:

- Everything except `dpr` updates live without rebuilding the WebGL context;
  `colors`/`bands` re-upload the ramp texture in place.
- `prefers-reduced-motion: reduce` holds a static frame.
- Nothing touches `window` during render, so it renders under SSR.

## Install from a registry

The `registry/*.json` files are shadcn registry items served over HTTPS from this repo:

```sh
npx shadcn@latest add https://arsentsn.github.io/brc-background/react/registry/Marble-TS.json
```

Use `Marble-JS.json` for JavaScript.

## Dropping it into another project

Copy `Marble.tsx` (or `Marble.jsx`) and run `npm i ogl`.

## Verification

The generated `Marble.jsx` was diffed against an earlier hand-maintained
implementation and agreed apart from the intended changes plus one harmless
divergence nothing had caught. The deeper checks — headless bundle-and-render
pixel comparison against `index.html`, and `tsc --strict` — need tooling this
repository deliberately does not vendor, so they run outside it.
