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

# Absolute path; do NOT use __file__ (undefined in qrenderdoc --python context).
LOG = os.path.join(DUMP, "probe_out.txt")

def run():
    import renderdoc as rd  # type: ignore[import-not-found]  # qrenderdoc injects it
    out = open(LOG, "w")
    def p(*a):
        out.write(" ".join(str(x) for x in a) + "\n"); out.flush()

    def ok(res):
        m = getattr(res, "OK", None)
        if callable(m):
            return res.OK()
        try:
            return res == rd.ResultCode.Succeeded
        except Exception:
            return bool(res)

    path = os.environ.get("BRC_CAPTURE")
    p("capture:", path)
    if not path:
        p("no capture path given"); out.close(); return

    cap = rd.OpenCaptureFile()
    res = cap.OpenFile(path, '', None)
    p("OpenFile ->", repr(res), "ok=", ok(res))
    if not ok(res):
        out.close(); return
    if cap.LocalReplaySupport() != rd.ReplaySupport.Supported:
        p("this capture cannot be replayed on this machine"); out.close(); return
    res, controller = cap.OpenCapture(rd.ReplayOptions(), None)
    p("OpenCapture ->", repr(res), "ok=", ok(res))
    if not ok(res):
        out.close(); return

    sdfile = controller.GetStructuredFile()

    def walk(actions):
        for a in actions:
            if bool(a.flags & rd.ActionFlags.Drawcall):
                name = a.GetName(sdfile)
                mark = "   <== 6-index quad" if a.numIndices == 6 else ""
                p("EID %5d | idx=%-6d inst=%-3d | %s%s" % (
                    a.eventId, a.numIndices, a.numInstances, name, mark))
            walk(a.children)

    p("---- draw actions ----")
    walk(controller.GetRootActions())
    p("---- done ----")
    controller.Shutdown()
    cap.Shutdown()
    out.close()

try:
    run()
except Exception:
    try:
        with open(LOG, "a") as f:
            f.write("\nEXCEPTION:\n" + traceback.format_exc())
    except Exception:
        pass
finally:
    os._exit(0)   # hard exit so qrenderdoc's GUI never opens
