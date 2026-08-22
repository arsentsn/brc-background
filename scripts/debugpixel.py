import os, traceback
# Where this writes. Game-derived output never lands in the repository, so it goes to
# BRC_DUMP, or to "dump" inside the workspace BRC_WORKSPACE names, or to the workspace
# beside the repository, which is what scripts/verify.js resolves too. That last one needs
# __file__, and qrenderdoc's --python context defines none, so under qrenderdoc one of the
# two variables has to be set (docs/TOOLING.md).
_HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else None
_WS = os.environ.get("BRC_WORKSPACE") or (
    os.path.join(_HERE, "..", "..", "brc-thing") if _HERE else None)
DUMP = os.environ.get("BRC_DUMP") or (os.path.join(_WS, "dump") if _WS else None)
if not DUMP:
    raise SystemExit("set BRC_DUMP or BRC_WORKSPACE (see PROVENANCE.md)")
OUT = os.path.join(DUMP, "debugpixel.txt")
def run():
    import renderdoc as rd  # type: ignore[import-not-found]  # qrenderdoc injects it
    f = open(OUT, "w")
    def p(*a): f.write(" ".join(str(x) for x in a)+"\n"); f.flush()
    cap = rd.OpenCaptureFile(); cap.OpenFile(os.environ["BRC_CAPTURE"], '', None)
    _, ctl = cap.OpenCapture(rd.ReplayOptions(), None)
    ctl.SetFrameEvent(171, True)
    X, Y = 1400, 300
    p("DebugPixel at", X, Y)

    trace = None
    try:
        inp = rd.DebugPixelInputs()
        p("DebugPixelInputs fields:", [a for a in dir(inp) if not a.startswith("_")])
        trace = ctl.DebugPixel(X, Y, inp)
    except Exception as e:
        p("DebugPixel err", e)
    if trace is None or getattr(trace,"debugger",None) is None:
        p("no debugger"); return

    # initial inputs (SV_Position etc.)
    try:
        for v in trace.inputs:
            p("INPUT", v.name, list(v.value.f32v[:4]))
    except Exception as e: p("inputs err", e)

    # walk states
    def valstr(sv):
        try: return "%s=%s" % (sv.name, [round(x,5) for x in list(sv.value.f32v[:4])])
        except Exception: return sv.name
    states=[]
    while True:
        b = ctl.ContinueDebug(trace.debugger)
        if not b: break
        states += b
        if len(states) > 4000: break
    p("total states:", len(states))
    for s in states:
        chg = []
        for c in getattr(s,"changes",[]):
            try:
                a = c.after
                chg.append(valstr(a))
            except Exception: pass
        p("inst %-4s | %s" % (getattr(s,"nextInstruction","?"), " ; ".join(chg)))
    try: ctl.FreeTrace(trace)
    except Exception: pass
    ctl.Shutdown(); cap.Shutdown()
try: run()
except Exception:
    open(OUT,"a").write("\nFATAL\n"+traceback.format_exc())
finally:
    os._exit(0)
