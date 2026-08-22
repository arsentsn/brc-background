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

OUTDIR = DUMP
LOG    = os.path.join(OUTDIR, "_dump_log.txt")
EID    = int(os.environ.get("BRC_EID", "221"))

def run():
    import renderdoc as rd  # type: ignore[import-not-found]  # qrenderdoc injects it
    os.makedirs(OUTDIR, exist_ok=True)
    os.makedirs(os.path.join(OUTDIR, "textures"), exist_ok=True)
    log = open(LOG, "w")
    def p(*a):
        s = " ".join(str(x) for x in a)
        log.write(s + "\n"); log.flush()

    def ok(res):
        m = getattr(res, "OK", None)
        if callable(m): return res.OK()
        try: return res == rd.ResultCode.Succeeded
        except Exception: return bool(res)

    def write(name, text):
        with open(os.path.join(OUTDIR, name), "w", encoding="utf-8") as f:
            f.write(text)

    path = os.environ.get("BRC_CAPTURE")
    p("capture:", path, "| EID:", EID)

    cap = rd.OpenCaptureFile()
    if not ok(cap.OpenFile(path, '', None)):
        p("OpenFile failed"); return
    res, controller = cap.OpenCapture(rd.ReplayOptions(), None)
    if not ok(res):
        p("OpenCapture failed"); return

    controller.SetFrameEvent(EID, True)
    pipe = controller.GetPipelineState()

    # ---- texture descriptions lookup ----
    texdesc = {}
    for t in controller.GetTextures():
        texdesc[t.resourceId] = t

    def rname(rid):
        try: return controller.GetResource(rid).name
        except Exception: return str(rid)

    # ---------- shader dump helper ----------
    disasm_targets = list(controller.GetDisassemblyTargets(True))
    p("disasm targets:", disasm_targets)

    def dump_stage(stage, tag):
        refl = pipe.GetShaderReflection(stage)
        if refl is None or refl.resourceId == rd.ResourceId.Null():
            p(tag, "no shader bound"); return None
        p("==", tag, "shader:", rname(refl.resourceId), "entry:", refl.entryPoint)
        pipeobj = pipe.GetGraphicsPipelineObject()
        # disassembly (try each target, keep the richest)
        for tgt in disasm_targets:
            try:
                dis = controller.DisassembleShader(pipeobj, refl, tgt)
                if dis:
                    safe = tgt.replace(" ", "_").replace("/", "_")
                    write("%s_%s.txt" % (tag, safe), dis)
                    p("  wrote disasm target:", tgt, "(%d chars)" % len(dis))
            except Exception as e:
                p("  disasm fail", tgt, e)
        return refl

    ps_refl = dump_stage(rd.ShaderStage.Pixel, "PS")
    vs_refl = dump_stage(rd.ShaderStage.Vertex, "VS")

    # ---------- constant buffers (PS) ----------
    def dump_cbuffers(stage, refl, tag):
        if refl is None: return
        lines = []
        pipeobj = pipe.GetGraphicsPipelineObject()
        for i, cb in enumerate(refl.constantBlocks):
            lines.append("### CB[%d] name=%s reg=b%d vars=%d"
                         % (i, cb.name, cb.fixedBindNumber if hasattr(cb,'fixedBindNumber') else getattr(cb,'bindPoint',i), len(cb.variables)))
            try:
                bound = pipe.GetConstantBuffer(stage, i, 0)
                var = controller.GetCBufferVariableContents(
                    pipeobj, refl.resourceId, stage, refl.entryPoint, i,
                    bound.resourceId, bound.byteOffset, bound.byteSize)
                def emit(vs, indent="  "):
                    for v in vs:
                        if len(v.members):
                            lines.append("%s%s (%s):" % (indent, v.name, v.type))
                            emit(v.members, indent+"  ")
                        else:
                            # gather scalar values across possible types
                            comp = []
                            for attr in ("f32v","s32v","u32v"):
                                try:
                                    arr = getattr(v.value, attr)
                                    n = max(v.rows,1)*max(v.columns,1)
                                    comp = list(arr[:n]); break
                                except Exception:
                                    continue
                            lines.append("%s%-28s = %s" % (indent, v.name, comp))
                emit(var)
            except Exception as e:
                lines.append("  <could not read contents: %s>" % e)
            lines.append("")
        write("%s_cbuffers.txt" % tag, "\n".join(lines))
        p(tag, "cbuffers written:", len(refl.constantBlocks))

    dump_cbuffers(rd.ShaderStage.Pixel, ps_refl, "PS")
    dump_cbuffers(rd.ShaderStage.Vertex, vs_refl, "VS")

    # ---------- bound PS textures -> PNG ----------
    saved = []
    ro = pipe.GetReadOnlyResources(rd.ShaderStage.Pixel)
    for arr in ro:
        reslist = arr.resources if hasattr(arr, "resources") else [arr]
        for b in reslist:
            rid = getattr(b, "resourceId", None)
            if rid is None or rid == rd.ResourceId.Null():
                continue
            d = texdesc.get(rid)
            if d is None:
                continue  # it's a buffer SRV, not a texture
            ts = rd.TextureSave()
            ts.resourceId = rid
            ts.mip = 0
            ts.slice.sliceIndex = 0
            ts.destType = rd.FileType.PNG
            fn = os.path.join(OUTDIR, "textures", "ps_srv_%s_%dx%d.png"
                              % (str(rid), d.width, d.height))
            try:
                if ok(controller.SaveTexture(ts, fn)):
                    saved.append((str(rid), d.width, d.height, d.format.Name() if hasattr(d.format,'Name') else str(d.format)))
                    p("saved texture:", fn, d.width, "x", d.height)
                else:
                    p("SaveTexture returned failure for", rid)
            except Exception as e:
                p("SaveTexture exception", rid, e)

    # ---------- render targets at this event ----------
    try:
        outs = pipe.GetOutputTargets()
        for idx, o in enumerate(outs):
            rid = o.resourceId
            if rid == rd.ResourceId.Null(): continue
            d = texdesc.get(rid)
            ts = rd.TextureSave(); ts.resourceId = rid; ts.mip = 0
            ts.slice.sliceIndex = 0; ts.destType = rd.FileType.PNG
            fn = os.path.join(OUTDIR, "textures", "rendertarget_%d_%s.png" % (idx, str(rid)))
            controller.SaveTexture(ts, fn)
            p("saved RT:", fn)
    except Exception as e:
        p("RT dump exception", e)

    # ---------- blend / raster / topology state ----------
    st = []
    try:
        for i, cb in enumerate(pipe.GetColorBlends()):
            st.append("ColorBlend[%d]: enabled=%s  color: %s %s %s | alpha: %s %s %s  writemask=%s"
                % (i, cb.enabled,
                   cb.colorBlend.source, cb.colorBlend.destination, cb.colorBlend.operation,
                   cb.alphaBlend.source, cb.alphaBlend.destination, cb.alphaBlend.operation,
                   cb.writeMask))
    except Exception as e:
        st.append("blend read error: %s" % e)
    try:
        st.append("Topology: %s" % pipe.GetPrimitiveTopology())
    except Exception as e:
        st.append("topo error: %s" % e)
    write("state.txt", "\n".join(st))
    p("state written")

    # summary
    summ = ["capture: %s" % path, "EID: %d" % EID, "",
            "PS textures saved:"]
    for s in saved:
        summ.append("  %s  %dx%d  %s" % s)
    write("SUMMARY.txt", "\n".join(summ))

    controller.Shutdown(); cap.Shutdown()
    p("---- DONE ----")

try:
    run()
except Exception:
    try:
        os.makedirs(OUTDIR, exist_ok=True)
        with open(LOG, "a") as f:
            f.write("\nFATAL:\n" + traceback.format_exc())
    except Exception:
        pass
finally:
    os._exit(0)
