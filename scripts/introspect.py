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
OUT = os.path.join(DUMP, "introspect.txt")

def run():
    import renderdoc as rd  # type: ignore[import-not-found]  # qrenderdoc injects it
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    f = open(OUT, "w")
    def p(*a): f.write(" ".join(str(x) for x in a) + "\n"); f.flush()

    cap = rd.OpenCaptureFile(); cap.OpenFile(os.environ["BRC_CAPTURE"], '', None)
    _, ctl = cap.OpenCapture(rd.ReplayOptions(), None)
    ctl.SetFrameEvent(int(os.environ.get("BRC_EID","221")), True)
    pipe = ctl.GetPipelineState()

    def show(label, obj):
        p("====", label, "type=", type(obj).__name__)
        for a in dir(obj):
            if a.startswith("_"): continue
            try:
                v = getattr(obj, a)
                if callable(v): continue
                p("   .%s = %r" % (a, v))
            except Exception as e:
                p("   .%s ERR %s" % (a, e))

    # output targets
    try:
        outs = pipe.GetOutputTargets()
        p("GetOutputTargets count:", len(outs))
        if len(outs): show("OutputTarget[0]", outs[0])
    except Exception as e:
        p("outs err", e)

    # read only resources (PS)
    try:
        ro = pipe.GetReadOnlyResources(rd.ShaderStage.Pixel)
        p("GetReadOnlyResources(PS) count:", len(ro))
        if len(ro):
            show("RO[0]", ro[0])
            # if it has nested descriptor/resources, show them
            for attr in ("descriptor","resources","resource"):
                if hasattr(ro[0], attr):
                    show("RO[0].%s"%attr, getattr(ro[0], attr))
    except Exception as e:
        p("ro err", e); p(traceback.format_exc())

    # depth target
    try:
        show("DepthTarget", pipe.GetDepthTarget())
    except Exception as e:
        p("depth err", e)

    ctl.Shutdown(); cap.Shutdown()

try: run()
except Exception:
    try:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        open(OUT,"a").write("\nFATAL\n"+traceback.format_exc())
    except Exception: pass
finally:
    os._exit(0)
