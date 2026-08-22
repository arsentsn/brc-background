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
OUT = os.path.join(DUMP, "timevals.txt")

def run():
    import renderdoc as rd  # type: ignore[import-not-found]  # qrenderdoc injects it
    f = open(OUT, "a")
    def p(*a): f.write(" ".join(str(x) for x in a) + "\n"); f.flush()

    cappath = os.environ["BRC_CAPTURE"]
    cap = rd.OpenCaptureFile(); cap.OpenFile(cappath, '', None)
    _, ctl = cap.OpenCapture(rd.ReplayOptions(), None)
    ctl.SetFrameEvent(171, True)
    pipe = ctl.GetPipelineState()
    p("==== CAPTURE:", os.path.basename(cappath))

    def dump(stage, tag):
        refl = pipe.GetShaderReflection(stage)
        if refl is None: return
        pipeobj = pipe.GetGraphicsPipelineObject()
        getcb = getattr(pipe, "GetConstantBlocks", None)
        used = list(getcb(stage)) if callable(getcb) else []
        for i, cb in enumerate(refl.constantBlocks):
            buf = rd.ResourceId.Null(); off=0; ln=0
            for u in used:
                try:
                    if u.access.index == i:
                        buf=u.descriptor.resource; off=u.descriptor.byteOffset; ln=u.descriptor.byteSize; break
                except Exception: pass
            try:
                var = ctl.GetCBufferVariableContents(pipeobj, refl.resourceId, stage, refl.entryPoint, i, buf, off, ln)
                vals=[]
                for v in var:
                    try: vals.append([round(x,6) for x in list(v.value.f32v[:max(v.rows,1)*max(v.columns,1)])])
                    except Exception: vals.append("?")
                p("  %s cb%d %s = %s" % (tag, i, cb.name, vals))
            except Exception as e:
                p("  %s cb%d read err %s" % (tag, i, e))

    dump(rd.ShaderStage.Pixel, "PS")
    dump(rd.ShaderStage.Vertex, "VS")
    ctl.Shutdown(); cap.Shutdown()

try: run()
except Exception:
    try: open(OUT,"a").write("\nFATAL\n"+traceback.format_exc())
    except Exception: pass
finally:
    os._exit(0)
