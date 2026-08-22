// ============================================================================
//  Reconstructed screens: the view tier (docs/SCREENS.md)
// ============================================================================
//  Loads on every build, always AFTER index.html's main script, which it builds on
//  (state, PRESETS, applyPreset, setPanel, QP, reveal) and whose first-paint gate it
//  takes over. Assets come from window.EVIDENCE; see PROVENANCE.md.
//
//  It builds in tiers, each enabling itself only when its own assets are reachable:
//
//    ART   overlay pixels, the game's font cuts, sfx/music  needs assets/
//    INTRO the 13 prefab tweens and the window masks        needs assets/  (introOK)
//    SLATE the chapter-select screen                        needs assets/  (slateOK)
//    MENU  items, hover, press, the hud toggle              always
//
//  Without the art tier the menu still works: items in monospace over the live marble,
//  white-on-orange hover, the committed press blink.
(function(){
  // Every asset path goes through ASSETS, so relocating them is a one-line change
  // to window.EVIDENCE in index.html.
  const ASSETS = (window.EVIDENCE || '') + 'menu/';
  const OVERLAY = ASSETS + 'menu_overlay.png';
  // Skipped outright rather than fired and failed when there is nothing to probe.
  let HAS_ART = false;
  if(window.WORKSPACE){
    const probe = new Image();
    probe.onload  = ()=>{ HAS_ART = true; enable(); };
    probe.onerror = ()=>enable();          // art unreachable: the menu tier alone
    probe.src = OVERLAY;
  } else enable();
  function enable(){
    state.hudReady = true;
    if(HAS_ART) document.getElementById('mv_overlay').src = OVERLAY;
    // No art: both screens rebuild their chrome from the rects and colours in the
    // stylesheet instead of the sprites (see the .recon block there).
    else { document.getElementById('menuview').classList.add('recon');
           document.getElementById('slateview').classList.add('recon');
           // the <image> halves of both masks stay href-less; these carry the shape
           ['wr_top','wr_bot','wr2_top','wr2_bot'].forEach(id=>{
             document.getElementById(id).style.display = ''; }); }
    // Two faces, both the game's: the menu items are set in its cut of Induction, the
    // options window in Forgotten Futurist. Wait for both before lifting the boot gate, or
    // the texts land in monospace and re-lay-out a frame later. That includes the window:
    // `?menu=0` boots with it already open, so the swap would land inside a --screenshot.
    // Without the art tier there is nothing to wait for: monospace applies from frame one.
    let fontReady = Promise.resolve();
    if(HAS_ART) try {
      const face = (name, file) => new FontFace(name, "url('" + ASSETS + file + "')")
            .load().then(f=>document.fonts.add(f)).catch(()=>{});
      fontReady = Promise.all([face('InductionLocal', 'induction.ttf'),
                               face('FuturistLocal', 'forgotten-futurist-rg.ttf')]);
    } catch(e){}
    // With no audio present, `sfx` is a no-op, so every call site stays unconditional.
    const A = f => HAS_ART ? new Audio(ASSETS + f) : null;
    const SFX_MOVE = A('selectionMove.ogg');
    const SFX_CONFIRM = A('confirm.ogg');
    const MUSIC = A('inthepocket.ogg');
    if(MUSIC){ MUSIC.loop = true; MUSIC.volume = 0.64; }
    const sfx = a => { if(!a) return; try { a.currentTime = 0; a.volume = 0.8; const p = a.play(); if (p) p.catch(()=>{}); } catch(e){} };
    // ---- music: its own toggle, independent of the menu view ----
    // Loops from load until the header's music icon stops it; entering or leaving the
    // menu view never touches it.
    const mb = document.getElementById('b_music');
    function setMusic(on){
      state.music = on ? 1 : 0;
      if(on){ try { const p = MUSIC.play(); if (p) p.catch(()=>{}); } catch(e){} }
      else MUSIC.pause();                        // pause, not reload: resuming continues the track
      mb.classList.toggle('on', !!on);
      mb.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    // The HUD row is meaningful on every build, so it is revealed either way; its slate
    // segment waits for the slate assets below, and the header's music icon is the only
    // control that goes away entirely when there is no track.
    document.getElementById('hudcap').style.display = '';
    document.getElementById('hudrow').style.display = '';
    if(!MUSIC) mb.style.display = 'none';
    else {
      mb.onclick = ()=>setMusic(!state.music);
      // Music is on at load, but browsers refuse sound until the page has been
      // interacted with, so this first play() normally rejects. Retried on every gesture
      // that grants activation; nothing here can turn it back off.
      const kick = ()=>{ if(state.music && MUSIC.paused) MUSIC.play().catch(()=>{}); };
      ['pointerdown','mousedown','keydown','touchstart','click'].forEach(
        t => addEventListener(t, kick, {capture:true}));
      setMusic(true);
    }
    // the highlight backdrop filter works in CSS px; retune to the vh font on resize
    const hlF = document.getElementById('hlbackdrop');
    function sizeHlFilter(){
      const s = innerHeight/1080;
      hlF.querySelector('feGaussianBlur').setAttribute('stdDeviation', 2.4*s);
      const o = hlF.querySelector('feOffset');
      o.setAttribute('dx', -2.9*s); o.setAttribute('dy', 2.3*s);
    }
    addEventListener('resize', sizeHlFilter); sizeHlFilter();
    // which of the two screens is up; the slate tier below flips it
    let screen = 'menu';
    let startGamePressed = ()=>{};       // wired by the slate tier when its assets exist
    let slateOff = ()=>{};               // teardown hook for setHud, same deal
    // The panel's HUD row: off, the central menu, the slate menu. Looked up here rather
    // than where each is wired, because wireSlate can run before the hud block below.
    const scrOff = document.getElementById('b_hud'),
          scrMenu = document.getElementById('b_scr_menu'),
          scrSlate = document.getElementById('b_scr_slate');
    let syncScreens = ()=>{};            // assigned by the hud block below
    document.querySelectorAll('.mv_item').forEach(el=>{
      const orig = el.textContent, last = orig[orig.length-1];
      let timers = [];
      // A committed press, like the game's (the prefab sets disableInputDuringDelay):
      // hover events are ignored until the blink finishes. Hiding the text stops the
      // element hit-testing, so the next mouse movement fires mouseleave, whose clear()
      // would otherwise cancel the timer that finishes the press.
      let pressing = false;
      const clear = ()=>{ timers.forEach(clearTimeout); timers = []; };
      el.addEventListener('mouseenter', ()=>{
        if(pressing) return;
        el.classList.add('hl'); sfx(SFX_MOVE);
        timers.push(setTimeout(()=>{ el.textContent = orig + last; }, 50));
        timers.push(setTimeout(()=>{ el.textContent = orig + last + last; }, 100));
      });
      el.addEventListener('mouseleave', ()=>{
        if(pressing) return;                       // the press restores its own state below
        clear(); el.classList.remove('hl'); el.textContent = orig;
        el.style.visibility = 'visible';           // never leave a button hidden mid-blink
      });
      el.addEventListener('click', ()=>{
        if(pressing) return;
        clear(); pressing = true; sfx(SFX_CONFIRM);
        el.style.visibility = 'hidden';
        [167,333,500].forEach((t,i)=>timers.push(setTimeout(()=>{ el.style.visibility = i%2 ? 'hidden' : 'visible'; }, t)));
        timers.push(setTimeout(()=>{ el.style.visibility = 'visible'; pressing = false;
          // the pointer may have left during the press; settle the hover state
          if(!el.matches(':hover')){ el.classList.remove('hl'); el.textContent = orig; }
          // in the game, "start game" opens the slate menu after the press blink
          // (UIManager.ShowSlotsMenu); wired only when the slate assets exist
          if(el.id === 'mv_start'){ el.classList.remove('hl'); el.textContent = orig; startGamePressed(); }
        }, 510));
      });
    });
    // ---- menu intro: the ~1 s DOTween timeline the game plays into the menu ------
    // An independent asset tier: if any intro sprite is missing the hud still works, it
    // just arrives in its final state. Prefab timings are in the CSS.
    const INTRO_ART = { band:'intro_band.png', slabL:'intro_slab_left.png', slabR:'intro_slab_right.png',
                        top:'intro_mask_top.png', bot:'intro_mask_bottom.png' };
    const AP = f => ASSETS + f;
    const INTRO_FREEZE = fin(QP.has('intro') ? parseFloat(QP.get('intro')) : null, null);
    const OUTRO_FREEZE = fin(QP.has('outro') ? parseFloat(QP.get('outro')) : null, null);
    // Rebuilt chrome needs no files; with the art it waits for the five sprites.
    let introOK = !HAS_ART;
    const introArt = !HAS_ART ? Promise.resolve() : Promise.all(Object.values(INTRO_ART).map(f => new Promise((res,rej)=>{
      const im = new Image(); im.onload = res; im.onerror = rej; im.src = AP(f);
    }))).then(()=>{
      document.getElementById('iv_band').src  = AP(INTRO_ART.band);
      document.getElementById('iv_slabL').src = AP(INTRO_ART.slabL);
      document.getElementById('iv_slabR').src = AP(INTRO_ART.slabR);
      document.getElementById('wm_top').setAttribute('href', AP(INTRO_ART.top));
      document.getElementById('wm_bot').setAttribute('href', AP(INTRO_ART.bot));
      // scoped: the slate view has .ivc crops of its OWN overlay
      document.querySelectorAll('#menuview .ivc img').forEach(el => { el.src = OVERLAY; });
      introOK = true;
    }).catch(()=>{});
    // Placed from JS because SVG geometry attributes take no vw/vh. Same OutQuad curve as
    // the CSS layers, recomputed from the viewport each frame so a resize stays correct.
    const outQuad = t => t*(2-t);
    // rk / ext describe the rebuilt window: rk is the sprite's corner radius as a share
    // of its height, ext says which end carries no rounding (1547x165 rounds only its
    // bottom at 45px, 613x1080 only its top at 21px). Ignored when the sprites are used.
    const WINS = [
      { el:'wm_top', w:28.4891, h:5.5157, fx:61.499,  fy:-13.0954, tx:61.4568, ty:0.0056, rk:45/165,   ext:-1 },
      { el:'wm_bot', w:28.5021, h:90.8,   fx:61.5115, fy:108.1481, tx:61.5026, ty:9.2037, rk:21/1080,  ext:+1 },
    ];
    // One rect per window, kept in step with its image. A rect rounds all four corners
    // while each sprite rounds only two, so the square end is pushed out of frame by
    // growing the rect past it, leaving the visible edge matching the sprite's.
    function placeRect(k, x, y, w, h){
      const r = document.getElementById(k.el.replace('wm', 'wr'));
      if(!r) return;
      const rad = k.rk * h;
      r.setAttribute('x', x); r.setAttribute('width', w);
      r.setAttribute('y', k.ext < 0 ? y - 2*rad : y);
      r.setAttribute('height', h + 2*rad);
      r.setAttribute('rx', rad); r.setAttribute('ry', rad);
    }
    const WIN_AT = 0.4, WIN_FOR = 0.45, INTRO_END = 1060;   // last fade ends at 1.0 s
    // Mirrored for the exit: T - (0.4 + 0.45) = 0.15, retracing the same curve backwards.
    const WIN_OUT_AT = 0.15, OUTRO_END = 1000, DISSOLVE = 260;
    const span = (t,at) => Math.min(1, Math.max(0, (t - at)/WIN_FOR));
    const winAt    = t => outQuad(span(t, WIN_AT));
    const winOutAt = t => outQuad(1 - span(t, WIN_OUT_AT));
    function placeWindows(p){
      const W = innerWidth/100, H = innerHeight/100;
      for(const k of WINS){
        const el = document.getElementById(k.el);
        const x = (k.fx + (k.tx-k.fx)*p) * W, y = (k.fy + (k.ty-k.fy)*p) * H;
        el.setAttribute('width',  k.w*W);
        el.setAttribute('height', k.h*H);
        el.setAttribute('x', x);
        el.setAttribute('y', y);
        placeRect(k, x, y, k.w*W, k.h*H);
      }
    }
    // One driver for both directions: dir +1 plays the intro, -1 the mirrored exit.
    let ivTimer = 0, ivRaf = 0, ivFrom = 0, ivDir = 1;
    const winFor = (dir, t) => dir > 0 ? winAt(t) : winOutAt(t);
    function ivStep(ts){
      placeWindows(winFor(ivDir, (ts - ivFrom)/1000));
      ivRaf = requestAnimationFrame(ivStep);
    }
    function playIv(dir, freezeT, onDone){
      resetIv();                              // also cancels any pending onDone
      const mv = document.getElementById('menuview');
      void mv.offsetWidth;                    // reflow, so re-adding the class restarts the CSS animations
      if(freezeT != null){
        document.documentElement.style.setProperty('--ivt', freezeT + 's');
        document.body.classList.add('ivfreeze');
      }
      placeWindows(freezeT != null ? winFor(dir, freezeT) : (dir > 0 ? 0 : 1));
      cv.classList.add('winmask');
      mv.classList.add(dir > 0 ? 'intro' : 'outro');
      requestFrame();                         // the marble may be still; make sure it has drawn
      if(freezeT == null){
        ivDir = dir; ivFrom = performance.now();
        ivRaf = requestAnimationFrame(ivStep);
        if(dir > 0){
          ivTimer = setTimeout(()=>{ resetIv(); if(onDone) onDone(); }, INTRO_END);
        } else {
          // two stages out: the mirrored timeline, then the cream dissolving off the
          // marble it was hiding (see .dissolve in the CSS)
          ivTimer = setTimeout(()=>{
            cancelAnimationFrame(ivRaf); ivRaf = 0;      // windows are offscreen by now
            cv.classList.remove('winmask');              // canvas back to fullscreen, behind the cream
            mv.classList.add('dissolve');
            ivTimer = setTimeout(()=>{ resetIv(); if(onDone) onDone(); }, DISSOLVE);
          }, OUTRO_END);
        }
      }
    }
    function resetIv(){
      clearTimeout(ivTimer); cancelAnimationFrame(ivRaf); ivTimer = ivRaf = 0;
      document.getElementById('menuview').classList.remove('intro','outro','dissolve');
      cv.classList.remove('winmask');
      document.body.classList.remove('ivfreeze');
      document.documentElement.style.removeProperty('--ivt');
      settleWindows();
    }
    // With the art, the overlay carries the window as a transparent hole and the mask is
    // needed only while the windows are in flight. Rebuilt, the cream is opaque over the
    // whole viewport, so the mask IS the window and must stay on while a screen is up.
    // Deferred a frame: callers tearing a screen down remove .on right after calling
    // reset, and reading the class list before that would restore the windows for a frame.
    let settleRaf = 0;
    function cancelSettle(){ cancelAnimationFrame(settleRaf); settleRaf = 0; }
    function settleWindows(){
      if(HAS_ART) return;
      cancelSettle();
      settleRaf = requestAnimationFrame(()=>{
        const mv = document.getElementById('menuview');
        // Never while a timeline owns the windows. Tested by class rather than raf handle,
        // because a frozen timeline (?intro=/?outro=) has no raf running and would
        // otherwise snap straight to its final frame.
        if(mv.classList.contains('intro') || mv.classList.contains('outro')
           || sv.classList.contains('intro') || ivRaf || svRaf) return;
        const menuOn  = mv.classList.contains('on');
        const slateOn = sv.classList.contains('on');
        cv.classList.toggle('winmask',  menuOn && !slateOn);
        cv.classList.toggle('winmask2', slateOn);
        if(slateOn) placeWindows2(1); else if(menuOn) placeWindows(1);
      });
    }
    addEventListener('resize', settleWindows);

    // ---- slate view: the slate menu (chapter select), a third tier ----
    // Enabled only when its own asset set is present; without it "start game" just blinks.
    // Source: SaveSlotMenuUI.prefab plus decompiled SaveSlotMenu /
    // SelectEnlargeButton / TextMeshProMenuButton (docs/SCREENS.md). The marble behind it
    // is the splash material at field scale 0.78, which the slatemenu preset carries.
    const SLATE_ART = { overlay:'slate_overlay.png', bar:'slate_bar.png',
                        slabL:'slate_slab_left.png', slabR:'slate_slab_right.png',
                        xDef:'slate_cross_default.png', xHi:'slate_cross_hi.png',
                        top:'slate_mask_top.png', bot:'slate_mask_bottom.png' };
    const SFX_CANCEL = A('cancel.ogg');   // back plays CANCEL, not confirm (SaveSlotMenu.HandlePressedBackButton)
    let slateOK = false;
    const sv = document.getElementById('slateview');
    const slateArt = !HAS_ART ? Promise.resolve() : Promise.all(Object.values(SLATE_ART).map(f => new Promise((res,rej)=>{
      const im = new Image(); im.onload = res; im.onerror = rej; im.src = AP(f);
    }))).then(()=>{
      document.getElementById('sv_overlay').src = AP(SLATE_ART.overlay);
      document.getElementById('sv_bar').src     = AP(SLATE_ART.bar);
      document.getElementById('sv_slabR').src   = AP(SLATE_ART.slabR);
      document.getElementById('sv_slabL').src   = AP(SLATE_ART.slabL);
      document.getElementById('wm2_top').setAttribute('href', AP(SLATE_ART.top));
      document.getElementById('wm2_bot').setAttribute('href', AP(SLATE_ART.bot));
      document.querySelectorAll('#slateview .ivc img').forEach(el => { el.src = AP(SLATE_ART.overlay); });
      document.querySelectorAll('.sv_x img').forEach(el => { el.src = AP(SLATE_ART.xDef); });
      wireSlate();
      slateOK = true;
    }).catch(()=>{});
    // Rebuilt, the slate screen needs no files either, so it wires up at once.
    if(!HAS_ART){ wireSlate(); slateOK = true; }
    // The slate windows, JS-driven like the menu's. Prefab: both tween 0.4 -> 0.85 s,
    // bottom rises +967.7px, top drops -130.6px; values are the prefab rects as vw/vh
    // percentages. Identical sprite dimensions to the menu's pair, so identical rk / ext.
    const WINS2 = [
      { el:'wm2_top', w:30.1136, h:9.4,     fx:10.3573, fy:-12.0926, tx:10.4016, ty:0,       rk:45/165,  ext:-1 },
      { el:'wm2_bot', w:30.0095, h:86.0803, fx:10.4109, fy:103.5173, tx:10.4016, ty:13.9198, rk:21/1080, ext:+1 },
    ];
    function placeWindows2(p){
      const W = innerWidth/100, H = innerHeight/100;
      for(const k of WINS2){
        const el = document.getElementById(k.el);
        const x = (k.fx + (k.tx-k.fx)*p) * W, y = (k.fy + (k.ty-k.fy)*p) * H;
        el.setAttribute('width',  k.w*W);
        el.setAttribute('height', k.h*H);
        el.setAttribute('x', x);
        el.setAttribute('y', y);
        placeRect(k, x, y, k.w*W, k.h*H);
      }
    }
    let svTimer = 0, svRaf = 0, svFrom = 0;
    function svStep(ts){
      placeWindows2(winAt((ts - svFrom)/1000));
      svRaf = requestAnimationFrame(svStep);
    }
    // No exit: the game leaves this screen by replaying the central menu's own entrance,
    // which is what showMenu(true) does below.
    function playSv(freezeT){
      resetSv();
      void sv.offsetWidth;
      if(freezeT != null){
        document.documentElement.style.setProperty('--ivt', freezeT + 's');
        document.body.classList.add('ivfreeze');
      }
      placeWindows2(freezeT != null ? winAt(freezeT) : 0);
      cv.classList.add('winmask2');
      sv.classList.add('intro');
      requestFrame();
      if(freezeT == null){
        svFrom = performance.now();
        svRaf = requestAnimationFrame(svStep);
        svTimer = setTimeout(resetSv, INTRO_END);   // same 1.06s envelope as the menu's
      }
    }
    function resetSv(){
      clearTimeout(svTimer); cancelAnimationFrame(svRaf); svTimer = svRaf = 0;
      sv.classList.remove('intro');
      cv.classList.remove('winmask2');
      document.body.classList.remove('ivfreeze');
      document.documentElement.style.removeProperty('--ivt');
      settleWindows();
    }
    slateOff = ()=>{ resetSv(); sv.classList.remove('on'); screen = 'menu'; };
    // Each screen loads its own swirl, but only while one of the two the game shipped is
    // what is selected: those two ARE the screens' materials, so keeping them in step is
    // keeping the screen honest. Anything else selected is the user's look, their own preset
    // or the working copy that any hand edit forks, and then the row changes the chrome and
    // nothing else. An explicit ?preset= stays authoritative either way. Not gated on the
    // freeze, since ?t= is a reproduction tool and should still get the screen's material.
    function screenPreset(name){
      if(PRESETS[QP.get('preset')]) return;
      if((PRESETS[state.preset] || {}).origin !== 'game') return;
      applyPreset(name); onChange();
    }
    function showSlate(animate){
      screen = 'slate';
      resetIv();
      document.getElementById('menuview').classList.remove('on');
      screenPreset('slatemenu');
      sv.classList.add('on');
      if(animate && state.tFreeze === null) playSv(INTRO_FREEZE); else resetSv();
      syncTag(); syncScreens();
    }
    function showMenu(animate){
      slateOff();
      screenPreset('menu');
      if(state.hud){
        document.getElementById('menuview').classList.add('on');
        // the game replays the menu's DOTween entrance every time the menu re-activates
        if(animate && introOK && state.tFreeze === null) playIv(1, INTRO_FREEZE); else resetIv();
      }
      syncTag(); syncScreens();
    }
    function wireSlate(){
      startGamePressed = ()=>{ if(state.hud) showSlate(true); };
      // The row's third segment exists only here: a build whose slate assets are missing
      // has no second screen to offer, and the remaining two fill the row.
      scrSlate.style.display = '';
      scrSlate.onclick = ()=>{
        if(!state.hud){ setHud(1, false); showSlate(true); }
        else if(screen !== 'slate') showSlate(true);
      };
      syncScreens();
      // the menu's hover-backdrop filter params, scaled by the slate text's 41/38
      const hlF2 = document.getElementById('hlbackdrop2');
      function sizeHlFilter2(){
        const s = innerHeight/1080 * (41/38);
        hlF2.querySelector('feGaussianBlur').setAttribute('stdDeviation', 2.4*s);
        const o = hlF2.querySelector('feOffset');
        o.setAttribute('dx', -2.9*s); o.setAttribute('dy', 2.3*s);
      }
      addEventListener('resize', sizeHlFilter2); sizeHlFilter2();
      // Slots and back are the menu's TextMeshProMenuButton with three prefab
      // differences: no last-character extension on slots (back alone extends x2 to
      // "backkk"), the press blink is 0.45s / 9 blinks, a 50ms toggle against the menu's
      // 167ms, and back plays the cancel sfx then returns to the central menu.
      document.querySelectorAll('.sv_item').forEach(el=>{
        const orig = el.textContent, last = orig[orig.length-1];
        const extend = el.id === 'sv_back';
        let timers = [];
        let pressing = false;                  // committed press, same reasoning as .mv_item's
        const clear = ()=>{ timers.forEach(clearTimeout); timers = []; };
        el.addEventListener('mouseenter', ()=>{
          if(pressing) return;
          el.classList.add('hl');
          el.style.color = '';                 // let .hl's white win over the inline deselect colour
          sfx(SFX_MOVE);
          if(extend){
            timers.push(setTimeout(()=>{ el.textContent = orig + last; }, 50));
            timers.push(setTimeout(()=>{ el.textContent = orig + last + last; }, 100));
          }
        });
        el.addEventListener('mouseleave', ()=>{
          if(pressing) return;
          clear(); el.classList.remove('hl'); el.textContent = orig;
          el.style.color = 'rgb(254,137,0)';   // DeselectText -> deselectedColor
          el.style.visibility = 'visible';
        });
        el.addEventListener('click', ()=>{
          if(pressing) return;
          clear(); pressing = true;
          sfx(el.id === 'sv_back' ? SFX_CANCEL : SFX_CONFIRM);
          el.style.visibility = 'hidden';
          for(let i=1; i<=9; i++) timers.push(setTimeout(()=>{ el.style.visibility = i%2 ? 'visible' : 'hidden'; }, i*50));
          timers.push(setTimeout(()=>{ el.style.visibility = 'visible'; pressing = false;
            if(!el.matches(':hover')){ el.classList.remove('hl'); el.textContent = orig;
                                       el.style.color = 'rgb(254,137,0)'; }
            if(el.id === 'sv_back'){ el.classList.remove('hl'); el.textContent = orig; showMenu(true); }
          }, 460));
        });
      });
      // X's: SelectEnlargeButton, a sprite swap and enlarge 42->48 around the centre on
      // hover with the selectionMove sound. Click is the confirm sound and nothing else,
      // because every slot is blank and the game's handler checks IsSaveSlotOccupied
      // before offering deletion.
      document.querySelectorAll('.sv_x').forEach(el=>{
        const img = el.querySelector('img');
        // with sprites the swap is the highlight; rebuilt, .hl alone carries it
        el.addEventListener('mouseenter', ()=>{ el.classList.add('hl');
          if(HAS_ART) img.src = AP(SLATE_ART.xHi); sfx(SFX_MOVE); });
        el.addEventListener('mouseleave', ()=>{ el.classList.remove('hl');
          if(HAS_ART) img.src = AP(SLATE_ART.xDef); });
        el.addEventListener('click', ()=>sfx(SFX_CONFIRM));
      });
    }

    // The HUD row, whose `off` segment is the hud toggle. The options window itself does not
    // change with the screen (see the CSS).
    function setHud(on, playNow){
      state.hud = on ? 1 : 0;
      const mv = document.getElementById('menuview');
      // Turning the hud on always lands on the central menu, as the game does. A slate screen
      // is torn down first, and the menu's exit is skipped in that case because the menu
      // layers were not on screen to begin with.
      const fromSlate = screen === 'slate';
      slateOff();
      // Entering replays the menu's own entrance, like the game. Leaving cuts: the prefab
      // carries no outro, and running the entrance backwards on the way out was invented
      // motion, a flourish where the game has none. Never animates under ?t= either, so
      // frozen frames keep the final layout.
      const animate = playNow && introOK && state.tFreeze === null && !fromSlate;
      if(on){
        screenPreset('menu');
        mv.classList.add('on');
        if(animate) playIv(1, INTRO_FREEZE); else resetIv();
      } else {
        resetIv(); mv.classList.remove('on');
      }
      syncTag();
      syncScreens();
      // Deliberately does not touch the panel: the row lives inside it, so closing it here
      // would move the controls mid-click.
    }
    // `off` lights when there is no chrome instead of sitting dark, and clicking the lit
    // segment does nothing, which makes `central menu` the way back in from `off`.
    // aria-checked, not aria-pressed: three pressed-states that happen to agree announce as
    // three independent toggles, when this is one setting with three values. The tabindex
    // roves with it, so the row is a single tab stop and the arrows move within it.
    syncScreens = ()=>{
      const at = !state.hud ? 'off' : screen;
      [[scrOff,'off'], [scrMenu,'menu'], [scrSlate,'slate']].forEach(([el,k])=>{
        const on = at === k;
        el.classList.toggle('on', on);
        el.setAttribute('aria-checked', on ? 'true' : 'false');
        el.tabIndex = on ? 0 : -1;
      });
    };
    scrOff.onclick = ()=>{ if(state.hud) setHud(0, true); };
    // With the hud off, picking a screen turns it on and lands there in one click.
    scrMenu.onclick = ()=>{
      if(!state.hud) setHud(1, true);
      else if(screen !== 'menu') showMenu(true);
    };
    // Arrows walk the row and pick as they go, which is what a radio group does. Only the
    // segments actually on screen take part, so a build without the slate assets has two.
    // stopPropagation because the page's own left/right step the warp's phase.
    document.getElementById('hudrow').addEventListener('keydown', e=>{
      const step = { ArrowLeft:-1, ArrowUp:-1, ArrowRight:1, ArrowDown:1 }[e.key];
      if(!step) return;
      const segs = [scrOff, scrMenu, scrSlate].filter(el => el.style.display !== 'none');
      const i = segs.indexOf(document.activeElement);
      if(i < 0) return;
      e.preventDefault(); e.stopPropagation();
      const next = segs[(i + step + segs.length) % segs.length];
      next.focus(); next.click();
    });
    syncScreens();
    document.getElementById('mv_options').addEventListener('click', ()=>setPanel(!panelOpen));
    // The menu screen is the default view; ?menu=0 opts out to the plain marble. Parking
    // the panel is part of boot, not of entering the menu, so the first sight of the page
    // is the unobstructed screen and "options" reveals the controls.
    if(QP.get('menu') !== '0'){ setHud(1); setPanel(false);
      // Flush the closed state now, while body.booting still suppresses the panel's
      // transition. Without this reflow the browser resolves style once, in the same frame
      // as reveal() below, by which point booting is gone and the transition is live, so
      // the window slides out of a page it was never opened on.
      void document.getElementById('panel').offsetWidth; }
    // The gate lifts only once the overlay is decoded, the font is in and the intro art
    // has loaded: that set is the flash, since the marble draws on frame 1 while the rest
    // arrives a beat later. The intro starts as the page becomes visible, because starting
    // it behind the gate would play its first frames invisibly. With no art tier all of
    // these resolve immediately.
    const img = document.getElementById('mv_overlay');
    const decoded = HAS_ART && img.decode ? img.decode().catch(()=>{}) : Promise.resolve();
    const go = ()=>{
      reveal();
      // ?screen=slate boots straight into the slate menu, taking ?intro= as below
      if(state.hud && slateOK && QP.get('screen') === 'slate'){
        showSlate(state.tFreeze === null);
      }
      // ?outro=<t> parks the boot in a frozen exit frame
      else if(state.hud && introOK && state.tFreeze === null)
        playIv(OUTRO_FREEZE != null ? -1 : 1, OUTRO_FREEZE != null ? OUTRO_FREEZE : INTRO_FREEZE);
      // ?hl=sv_slot1,sv_x1,... dispatches real mouseenter events so a headless
      // --screenshot captures true hover states; click:<id> dispatches a real click,
      // which is how the committed press and the start-game transition are exercised.
      if(QP.has('hl')) QP.get('hl').split(',').forEach(id=>{
        const click = id.startsWith('click:');
        const e = document.getElementById(click ? id.slice(6) : id);
        if(e) e.dispatchEvent(new MouseEvent(click ? 'click' : 'mouseenter'));
      });
    };
    Promise.all([decoded, fontReady, introArt, slateArt]).then(go, go);
  }
})();
