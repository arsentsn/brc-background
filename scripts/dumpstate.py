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
OUT = os.path.join(DUMP, "stages")
LOG = os.path.join(DUMP, "stages", "_log.txt")
def run():
    import renderdoc as rd  # type: ignore[import-not-found]  # qrenderdoc injects it
    os.makedirs(OUT, exist_ok=True)
    log = open(LOG, "w")
    def p(*a): log.write(" ".join(str(x) for x in a)+"\n"); log.flush()
    cap = rd.OpenCaptureFile(); cap.OpenFile(os.environ["BRC_CAPTURE"], '', None)
    _, ctl = cap.OpenCapture(rd.ReplayOptions(), None)
    tex = {t.resourceId:t for t in ctl.GetTextures()}
    def find(idnum):
        for t in ctl.GetTextures():
            if str(t.resourceId)=="ResourceId::%d"%idnum: return t.resourceId
        return None
    r402 = find(402)
    for eid in [154,171,191,199,221]:
        ctl.SetFrameEvent(eid, True)
        pipe = ctl.GetPipelineState()
        # save 402 state now
        if r402 is not None:
            ts=rd.TextureSave(); ts.resourceId=r402; ts.mip=0; ts.slice.sliceIndex=0; ts.destType=rd.FileType.PNG
            ctl.SaveTexture(ts, os.path.join(OUT,"c402_eid%d.png"%eid))
        # viewport + RT + textures bound
        try:
            vps = pipe.GetViewports()
            vp = vps[0] if len(vps) else None
            p("EID %d viewport: %s" % (eid, ("%gx%g @ %g,%g" % (vp.width,vp.height,vp.x,vp.y)) if vp else "none"))
        except Exception as e: p("EID %d vp err %s"%(eid,e))
        try:
            outs=[o.resource for o in pipe.GetOutputTargets() if o.resource!=rd.ResourceId.Null()]
            p("   RT:", [str(o) for o in outs], "dims:", [(tex[o].width,tex[o].height) for o in outs if o in tex])
        except Exception as e: p("   rt err",e)
        try:
            ins=[]
            for u in pipe.GetReadOnlyResources(rd.ShaderStage.Pixel):
                rid=u.descriptor.resource
                d=tex.get(rid)
                ins.append("%s(%s)"%(rid, "%dx%d"%(d.width,d.height) if d else "buf"))
            p("   PS SRV:", ins)
        except Exception as e: p("   srv err",e)
    ctl.Shutdown(); cap.Shutdown()
try: run()
except Exception:
    try: open(LOG,"a").write("\nFATAL\n"+traceback.format_exc())
    except Exception: pass
finally: os._exit(0)
