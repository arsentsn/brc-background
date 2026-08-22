# Tooling recipes

How the four tools were driven, and the traps each sets — all CLI-driven, repeatable.
The captures, dumps and game data referenced are **not in this repository**; see
[PROVENANCE.md](../PROVENANCE.md) for exclusions and env vars the scripts take.

---

## RenderDoc (v1.45)

- `renderdoccmd.exe` has NO python subcommand: use `qrenderdoc.exe --python script.py`
  (bundles Python 3.6). Gotchas: `__file__`/`sys.argv` undefined → absolute paths + env
  vars (`BRC_CAPTURE`, `BRC_EID`); print() never reaches console from a GUI exe → write
  to a file; end with `os._exit(0)` in try/finally or the GUI hangs.
- v1.45's pipeline API is descriptor-based: outputs via
  `pipe.GetOutputTargets()[i].resource` (NOT `.resourceId`); read-only resources via
  `pipe.GetReadOnlyResources(stage)[i].descriptor.resource`. Pixel debug:
  `ctl.DebugPixel(x, y, rd.DebugPixelInputs())`, loop `ctl.ContinueDebug(trace.debugger)`,
  walking `state.changes[].after` per instruction.
- **Pixel History lands on the wrong draw** — the final backbuffer blit, not the effect.
  Walk events for the draw writing the composite target: empty one event earlier,
  finished marble one later. **Don't trust its sRGB texture dumps either**:
  `SaveTexture` re-quantizes linear floats, losing dark-channel precision — use the
  AssetRipper-exported PNG, minding the vertical flip.
- Scripts in [`../scripts/`](../scripts/), all `qrenderdoc --python`, all writing to
  `BRC_DUMP`:

  | script | what it does |
  |---|---|
  | `probe.py` / `actions.py` | locate marble draw + bindings; list draw calls |
  | `dumpstate.py` / `introspect.py` | pipeline-state dumps, narrow / broad |
  | `dump_all.py` | every shader and texture in the capture |
  | `dump402.py` / `dump_paint.py` | UI composite crops (panel art); chain walk |
  | `pick.py` / `timevals.py` / `debugpixel.py` | reference pixels; clock buffer (`_Time`); register trace |

## AssetRipper (`tools/assetripper/AssetRipper.GUI.Free.exe`)

- Official build has no `-i/-e`; `--headless` only hides the browser — it still runs a
  web server. Recipe: launch `--headless --port 7777`, then curl (form field `path`,
  HTTP 302 on success): `POST /LoadFolder` path=`<game install directory>` (parses +
  processes), then `POST /Export/UnityProject` path=`<export directory>`; discover more
  via `GET /openapi.json`.
- Output under `<export dir>\ExportedProject\Assets\`: readable YAML `.mat` materials
  (the source values), shaders, textures. Compiled shaders are a
  `//DummyShaderTextExporter` stub with no HLSL — values + textures are the useful part;
  the algorithm comes from RenderDoc's DXBC decode.
- **Don't port variant `.mat` values blindly**: several `_Scalar*` properties are dead,
  hardcoded as DXBC literals. Check the DXBC for immediates first.

## Headless GPU screenshot (verification)

- `chrome --headless=new --use-angle=d3d11 --hide-scrollbars --window-size=1936,1175 --virtual-time-budget=2500 --screenshot=out.png "file:///.../index.html?t=0.744"`
- **`--window-size` is the WINDOW, not the viewport** — Chrome subtracts an appreciable
  inset and pads the screenshot to full window size with stale framebuffer content below
  the viewport, so raw captures can show offscreen elements. Crop to
  `innerWidth×innerHeight` or size the window as above; the inset belongs to the Chrome
  build and has changed once already, so re-measure on browser updates using capture
  flags (`--dump-dom` reports differently):

  ```sh
  printf '%s' '<body style="font:64px monospace"><script>document.write(innerWidth+"x"+innerHeight)</script>' > probe.html
  chrome --headless=new --hide-scrollbars --window-size=1936,1175 --user-data-dir=probe-profile --screenshot=probe.png "file://$PWD/probe.html"
  ```

  Aspect ratio bites hardest: the field divisor is width-derived, so a wrong height
  silently top-crops rather than rescales — the capture still looks correct.
- Give each run its own `--user-data-dir`: Chrome delegates to any live process sharing
  one and re-runs THAT process's `--screenshot` path, rewriting the wrong file.
- **Transitions and keyframe animations don't advance under `--virtual-time-budget`** —
  captures and `setTimeout`+`getComputedStyle` land on start values (hence the
  instant-flip boot gate). Workarounds: negative `animation-delay` +
  `animation-play-state:paused` (`?intro=` / `?outro=`), or scrub via `el.getAnimations()`
  — set `currentTime`, `pause()`, read computed style. `requestAnimationFrame` *does*
  advance, which is how JS-driven masks were measured.
- PowerShell treats `?` as a variable-name character, so `"$base?t=0.744"` interpolates
  an empty variable and opens the new-tab page — build URLs with `($base + "?t=0.744")`.
- **For anything screenshots can't reach (dragging, hover-then-click), drive CDP rather
  than adding test-only URL params.** Node 22 ships a global `WebSocket`, no deps:
  launch with `--remote-debugging-port`, `GET /json/list` for the target's
  `webSocketDebuggerUrl`, then `Runtime.enable`, `Input.dispatchMouseEvent` /
  `Input.dispatchKeyEvent`, `Runtime.evaluate`, `Page.captureScreenshot`. Costs: real
  time (poll `body.booting`, wait out the intro), and true-viewport captures that may
  differ from padded `--screenshot` output at a given size. Synthetic events default to
  `bubbles:false`, never reaching a `window` listener from `document` — use
  `Input.dispatchKeyEvent`. `?hl=id,click:id` stays the cheap hover/click path in plain
  `--screenshot` runs.

## BepInEx (live-game verification)

A runtime mod hooks the menu scene — hiding UI, resizing the background fullscreen — so
the entire rendered field can be compared, including normally cropped regions, with rate
measured from timestamped screenshots. Short plugin, F10 toggle, touches nothing on disk.
Caveat invalidating naive timing runs: the game clock **pauses when unfocused**
(Unity `runInBackground=false`) — wall-clock comparisons need continuously focused runs.

## Browser quirks the shipped page works around

- **F11 fullscreen is invisible to the Fullscreen API** (no `fullscreenchange`,
  `fullscreenElement` null). What changes is `(display-mode: fullscreen)`; the panel's
  icon ORs the two, and `--start-fullscreen` reproduces F11 headlessly. F11 can't be
  released via `exitFullscreen()`, so the icon relabels rather than pretending.
- **`color-scheme:light` doesn't stop Chrome drawing a dark range groove**, and
  `accent-color` covers only fill/thumb: `appearance:none` plus a value-driven gradient
  stop is the only flat track on cream.
- **CSS `mask-image` is a CORS fetch failing silently from `file://`** (element ends up
  invisible); an `<image>` inside an SVG `<mask>` loads under image rules. See
  [SCREENS.md](SCREENS.md).
