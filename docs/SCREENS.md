# The reconstructed screens

Two of the game's menu screens reproduce over the live marble — the **central menu** and
the **slate menu** (SELECT YOUR SLATE) — each with its intro animation. Source behind
`views/menuview.css` / `views/menuview.js`. The *code* is original; the *pixels* are the
game's (screenshot-derived overlays, atlas sprites, font, audio). Each tier probes for
its own art first, so missing assets degrade to rebuilt flat-colour chrome rather than
break. See [PROVENANCE.md](../PROVENANCE.md).

---

## Central menu

UI pixels (marble window punched out per-pixel), font, and hover/press behaviour from
decompiled button code sit over the marble. The panel's **HUD** row switches it — `off` /
`central menu` / `slate menu` — since the marble stays fullscreen and only UI comes and
goes. A `music` toggle runs the track; "options" opens the control panel above the
overlay, fully live, so the marble can be retuned inside the menu.

Both controls live INSIDE that panel, so anything moving or restyling it pulls them out
from under the click using them — hence the view toggle never moved it, and it stopped
changing skin entirely (below). The HUD being an **image**, first paint holds on
`body.booting` until `mv_overlay` decodes, the font loads and intro art arrives
(backstop timer included); otherwise a refresh flashes bare field and re-lays out as the
real font lands.

**Buttons** (decompiled): hover whitens an item over a **fat orange backdrop** — an SVG
blur+threshold+offset dilation of the glyphs (`#hlbackdrop`), not text-shadow stacks;
the last character extends twice, animated ("start game" → "start gameee"); press blinks
rapidly. Hover plays selection-move sound, press confirm. Music deliberately isn't tied
to the view — looping from load until its toggle stops it (first `play()` fails silently
pre-interaction, retried on pointer/key events).

### The options window wears the menu's skin, everywhere

A cream drawer off the top edge in the dead space left of the marble, sliding on the same
OutQuad curve. Height was once pinned fixed — one constant governing a viewport-scaled
screen, dead space on tall displays, spurious scroll on short; now it sizes to its
controls bounded by the viewport, scrolling only when genuinely shorter. Colours are the
menu's three: cream page, paler panel, orange interactive elements.

Skin used to be conditional (cream with HUD up, dark otherwise). Reversed on use: the
swap restyled in-window controls mid-click, and screen switches changed the thing being
held twice. One window, one appearance — dark theme removed outright, since a skin
nothing selects is a skin nobody maintains. `#panel` carries geometry and entrance;
`color-scheme:dark` flips for that subtree alone.

### Dragging

Docked at first, then draggable by header; dragged, it rounds all corners and fades
rather than sliding off an edge meaningless from mid-screen. Double-click re-docks.
Position clamps so part of the header stays onscreen (re-clamped on resize) and is NOT
persisted — reload starts docked, no session may shift a documented comparison URL.
Arming uses a timer, not `transitionend`, which never fires under headless virtual time.

---

## Central menu intro animation

Source: **`MainMenuUINew.prefab`** — many `DOTweenAnimation`s, all eased **OutQuad**.
Panels *Move* from offscreen marker rects (`useTargetAsV3` at empty `*SlideIn` markers
under `MainMenuAnimation`); others *Fade* from alpha 0. Markers convert to CSS
percentages against a reference-resolution viewport. Order: band slides from the left,
left slab rises from below; right slab drops from above; both marble windows slide in;
art/title/items fade in; version text pops briefly last.

Three things matter:

- **OutQuad maps onto a simple `cubic-bezier`**, close to `y = 2t - t²`; JS windows use
  `t*(2-t)` likewise.
- **Windows are moving MASKS over a fixed field, not moving marble**: the sprites carry
  the swirl material whose pattern is `fragCoord`-based, hence screen-anchored — sliding
  reveals another part of a stationary field. The canvas lifts above the intro layers,
  masked by sprite alphas; only mask position animates.
- **Mask must be an SVG `<mask>`, not CSS `mask-image`**, which Chrome fetches under CORS
  and silently drops from `file://`. Inlining sprites as data URIs would bake game pixels
  into tracked source, so hrefs come from JS — positions too, since SVG geometry takes no
  `vw`/`vh`.

### The exit

Leaving cuts, as the game does: the prefab has no outro. For a while the exit played the
same timeline backwards — authentic markers/curves, invented only sequencing (reversal is
DOTween's own trick; reversed OutQuad is InQuad, natural for leaving), ending with cream
dissolving off the fullscreen marble because teardown over the unmoving background read
as a blink. It stayed the project's only invented motion, and a flourish where the game
has none reads as one however well built — gone now. For the record: it ran as
`animation-direction:reverse` over the same `@keyframes` plus `outQuad(1 - u)` for JS
windows, with the corner tag keyed to actual `#menuview` visibility rather than
`state.hud`.

Intro plays at startup and every switch back; skipped whenever `?t=` freezes the clock,
so verification renders the final layout. **`?intro=<seconds>`** freezes mid-flight via
negative `animation-delay` (`--ivt`) plus paused play state; **`?outro=<seconds>`** parks
a frozen exit frame likewise. Intro sprites are a separate asset tier: missing ones leave
the screen arriving in its final state.

---

## Slate menu (the chapter-select screen)

Where "start game" leads, reproduced the same way, every slot shown **blank slate**
(`SAVESLOT_EMPTY_SLOT`). `?screen=slate` boots straight in; "start game" opens it after
the press blink (`UIManager.ShowSlotsMenu`) and "back" returns by replaying the central
entrance — why no invented exit is needed. Music never breaks across the switch (one
shared scene). The marble here is the splash material at true field scale: fitting
against the reference screenshot gives a wide-field denominator consistent with these
draws reading `cb1[6].x` at full width, making `_Scalar6` a real scale-up, not draw-rect
compensation. That scale rides the `slatemenu` preset; the splash rect has neither
equivalent nor preset. Phase is a fixed constant ([OVERVIEW.md](../OVERVIEW.md)).

**From `SaveSlotMenuUI.prefab` + decompiled `SaveSlotMenu` / `SelectEnlargeButton`:**
text is the same font slightly larger, scaling the central menu's vh size proportionally,
with scaled hover-backdrop twin `#hlbackdrop2` INSIDE `#slateview` (SVG filters don't
render from `display:none` subtrees, and `#menuview` hides here). Initial colour prefab
orange; first hover-exit sets its barely different `deselectedColor`. Slots have
`extendLastCharacter` OFF; **back alone extends ×2**, blinking slower. Back plays cancel
sfx (`HandlePressedBackButton`), slots/X's confirm. X's are `SelectEnlargeButton`s —
highlight swap + centre enlargement on hover; clicking confirms without deleting, since
the handler checks `IsSaveSlotOccupied` and slots are blank. Dot-matrix numbers are
static prefab text, not save data; slot 3's X sits fractionally left per its real anchor.

**Intro:** all OutQuad — bar slides from RIGHT across most of the width, right slab from
BELOW, left from ABOVE, windows a beat later as JS-driven `#winmask2` masks over the
screen-anchored field, then fades (icon, titles, numbers, slots, X's, back) over flat
cream `BackgroundImage`. `?intro=<s>` freezes like the central menu; replays each entry.

**Verification** (headless renders vs screenshots): full frame agrees closely at fitted
phase, window marble more so (remainder = band-edge rounding), mismatches confined to
intentionally re-rendered text/X regions. Text boxes line up; X boxes match including
enlarged hover; borders agree within the rows' own variance; end-swap seamless.
`?hl=sv_slot1,...` dispatches real mouseenter events for `--screenshot`.
