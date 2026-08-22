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
OUT = os.path.join(DUMP, "pick.txt")
def run():
    import renderdoc as rd  # type: ignore[import-not-found]  # qrenderdoc injects it
    f = open(OUT, "w")
    def p(*a): f.write(" ".join(str(x) for x in a)+"\n"); f.flush()
    cap = rd.OpenCaptureFile(); cap.OpenFile(os.environ["BRC_CAPTURE"], '', None)
    _, ctl = cap.OpenCapture(rd.ReplayOptions(), None)
    ctl.SetFrameEvent(171, True)
    r402 = None
    for t in ctl.GetTextures():
        if str(t.resourceId) == "ResourceId::402": r402 = t.resourceId; break
    pts = [(1400,150),(1400,300),(1400,450),(1400,520),(1400,600),(1400,750),(1400,900),(1300,500),(1500,520)]
    sub = rd.Subresource(0,0,0)
    for (x,y) in pts:
        try:
            v = ctl.PickPixel(r402, x, y, sub, rd.CompType.UNorm)
            fv = list(v.floatValue)[:4]
            p("(%d,%d) = [%.4f, %.4f, %.4f]" % (x,y, fv[0],fv[1],fv[2]))
        except Exception as e:
            p("(%d,%d) err %s" % (x,y,e))
    ctl.Shutdown(); cap.Shutdown()
try: run()
except Exception:
    open(OUT,"a").write("\nFATAL\n"+traceback.format_exc())
finally:
    os._exit(0)
