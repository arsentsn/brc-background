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

OUT = DUMP
LOG = os.path.join(OUT, "_all_log.txt")

def run():
    import renderdoc as rd  # type: ignore[import-not-found]  # qrenderdoc injects it
    os.makedirs(OUT, exist_ok=True)
    texdir = os.path.join(OUT, "textures"); os.makedirs(texdir, exist_ok=True)
    shdir  = os.path.join(OUT, "shaders");  os.makedirs(shdir, exist_ok=True)
    log = open(LOG, "w")
    def p(*a): log.write(" ".join(str(x) for x in a) + "\n"); log.flush()
    def ok(res):
        m = getattr(res, "OK", None)
        return res.OK() if callable(m) else bool(res)

    cap = rd.OpenCaptureFile(); cap.OpenFile(os.environ["BRC_CAPTURE"], '', None)
    _, ctl = cap.OpenCapture(rd.ReplayOptions(), None)

    texdesc = {t.resourceId: t for t in ctl.GetTextures()}

    saved_tex = set()
    def save_tex(rid, tag):
        if rid == rd.ResourceId.Null() or rid in saved_tex: return
        d = texdesc.get(rid)
        if d is None: return  # buffer, not a texture
        ts = rd.TextureSave(); ts.resourceId = rid; ts.mip = 0
        ts.slice.sliceIndex = 0; ts.destType = rd.FileType.PNG
        fmt = d.format.Name() if hasattr(d.format, "Name") else str(d.format)
        fn = os.path.join(texdir, "res%s_%dx%d.png" % (str(rid).replace("ResourceId::",""), d.width, d.height))
        try:
            if ok(ctl.SaveTexture(ts, fn)):
                saved_tex.add(rid)
                p("   SAVED %s  %dx%d  %s  [%s]" % (rid, d.width, d.height, fmt, tag))
        except Exception as e:
            p("   savetex err", rid, e)

    saved_sh = set()
    disasm_targets = list(ctl.GetDisassemblyTargets(True))
    def dump_shader(pipe, stage, sid):
        if sid in saved_sh or sid == rd.ResourceId.Null(): return
        refl = pipe.GetShaderReflection(stage)
        if refl is None or refl.resourceId == rd.ResourceId.Null(): return
        saved_sh.add(sid)
        pipeobj = pipe.GetGraphicsPipelineObject()
        for tgt in disasm_targets:
            if tgt != "DXBC":  # DXBC is the one we want for porting
                continue
            try:
                dis = ctl.DisassembleShader(pipeobj, refl, tgt)
                open(os.path.join(shdir, "%s_%s.txt" % (str(sid).replace("ResourceId::",""),
                     "PS" if stage==rd.ShaderStage.Pixel else "VS")), "w", encoding="utf-8").write(dis)
                p("   shader %s %s -> %d chars" % (sid, "PS" if stage==rd.ShaderStage.Pixel else "VS", len(dis)))
            except Exception as e:
                p("   disasm err", e)

    def dump_cb(pipe, stage, refl, eid, tagstage):
        if refl is None or len(refl.constantBlocks) == 0: return
        pipeobj = pipe.GetGraphicsPipelineObject()
        lines = []
        getcb = getattr(pipe, "GetConstantBlocks", None)
        used = None
        if callable(getcb):
            try: used = list(getcb(stage))
            except Exception:
                try: used = list(getcb(stage, False))
                except Exception as e: p("   GetConstantBlocks err", e)
        for i, cb in enumerate(refl.constantBlocks):
            buf = rd.ResourceId.Null(); off = 0; length = 0
            if used:
                for u in used:
                    try:
                        acc = u.access
                        if acc.index == i:
                            buf = u.descriptor.resource; off = u.descriptor.byteOffset
                            length = u.descriptor.byteSize; break
                    except Exception: pass
            lines.append("### CB[%d] %s  vars=%d  buf=%s off=%d len=%d"
                         % (i, cb.name, len(cb.variables), buf, off, length))
            try:
                var = ctl.GetCBufferVariableContents(pipeobj, refl.resourceId, stage,
                        refl.entryPoint, i, buf, off, length)
                def emit(vs, ind="  "):
                    for v in vs:
                        if len(v.members):
                            lines.append("%s%s:" % (ind, v.name)); emit(v.members, ind+"  ")
                        else:
                            comp = []
                            for at in ("f32v","s32v","u32v"):
                                try:
                                    arr = getattr(v.value, at)
                                    n = max(v.rows,1)*max(v.columns,1)
                                    comp = list(arr[:n]); break
                                except Exception: pass
                            lines.append("%s%-30s = %s" % (ind, v.name, comp))
                emit(var)
            except Exception as e:
                lines.append("   <read err: %s>" % e)
        if lines:
            open(os.path.join(OUT, "cb_EID%d_%s.txt" % (eid, tagstage)), "w", encoding="utf-8").write("\n".join(lines))
            p("   cbuffers %s written (%d blocks)" % (tagstage, len(refl.constantBlocks)))

    # ---- gather all drawcalls ----
    draws = []
    def walk(actions):
        for a in actions:
            if bool(a.flags & rd.ActionFlags.Drawcall):
                draws.append(a)
            walk(a.children)
    walk(ctl.GetRootActions())
    p("drawcalls:", len(draws))

    graph = []
    for a in draws:
        eid = a.eventId
        ctl.SetFrameEvent(eid, True)
        pipe = ctl.GetPipelineState()
        p("== EID %d  idx=%d ==" % (eid, a.numIndices))
        ps = pipe.GetShaderReflection(rd.ShaderStage.Pixel)
        vs = pipe.GetShaderReflection(rd.ShaderStage.Vertex)
        ps_id = ps.resourceId if ps else rd.ResourceId.Null()
        vs_id = vs.resourceId if vs else rd.ResourceId.Null()
        dump_shader(pipe, rd.ShaderStage.Pixel, ps_id)
        dump_shader(pipe, rd.ShaderStage.Vertex, vs_id)
        dump_cb(pipe, rd.ShaderStage.Pixel, ps, eid, "PS")
        dump_cb(pipe, rd.ShaderStage.Vertex, vs, eid, "VS")

        outs = [o.resource for o in pipe.GetOutputTargets() if o.resource != rd.ResourceId.Null()]
        ins = []
        for u in pipe.GetReadOnlyResources(rd.ShaderStage.Pixel):
            try: ins.append(u.descriptor.resource)
            except Exception: pass
        for rid in outs: save_tex(rid, "OUT eid%d" % eid)
        for rid in ins:  save_tex(rid, "IN  eid%d" % eid)
        graph.append("EID %4d | PS=%s VS=%s | reads %s | writes %s"
                     % (eid, ps_id, vs_id,
                        [str(x) for x in ins], [str(x) for x in outs]))

    open(os.path.join(OUT, "graph.txt"), "w", encoding="utf-8").write("\n".join(graph))
    p("---- DONE ----")
    ctl.Shutdown(); cap.Shutdown()

try: run()
except Exception:
    try:
        os.makedirs(OUT, exist_ok=True)
        open(LOG, "a").write("\nFATAL\n" + traceback.format_exc())
    except Exception: pass
finally:
    os._exit(0)
