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
OUT = os.path.join(DUMP, "panels")
def run():
    import renderdoc as rd  # type: ignore[import-not-found]  # qrenderdoc injects it
    os.makedirs(OUT, exist_ok=True)
    cappath = os.environ["BRC_CAPTURE"]
    tag = os.environ["BRC_TAG"]
    cap = rd.OpenCaptureFile(); cap.OpenFile(cappath, '', None)
    _, ctl = cap.OpenCapture(rd.ReplayOptions(), None)
    ctl.SetFrameEvent(221, True)   # final composite state
    ts = rd.TextureSave()
    ts.resourceId = rd.ResourceId.Null()
    # find 402
    for t in ctl.GetTextures():
        pass
    # 402 is the composite; save it by id
    rid = None
    for t in ctl.GetTextures():
        if str(t.resourceId) == "ResourceId::402":
            rid = t.resourceId; break
    if rid is not None:
        ts.resourceId = rid; ts.mip = 0; ts.slice.sliceIndex = 0; ts.destType = rd.FileType.PNG
        ctl.SaveTexture(ts, os.path.join(OUT, "panel_%s.png" % tag))
    ctl.Shutdown(); cap.Shutdown()
try: run()
except Exception:
    open(os.path.join(OUT,"err.txt") if os.path.isdir(OUT) else os.path.join(DUMP, "panels_err.txt"),"a").write(traceback.format_exc())
finally:
    os._exit(0)
