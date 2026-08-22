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
LOG = os.path.join(OUT, "_actions.txt")

def run():
    import renderdoc as rd  # type: ignore[import-not-found]  # qrenderdoc injects it
    os.makedirs(OUT, exist_ok=True)
    shdir = os.path.join(OUT, "shaders"); os.makedirs(shdir, exist_ok=True)
    f = open(LOG, "w")
    def p(*a): f.write(" ".join(str(x) for x in a) + "\n"); f.flush()

    cap = rd.OpenCaptureFile(); cap.OpenFile(os.environ["BRC_CAPTURE"], '', None)
    _, ctl = cap.OpenCapture(rd.ReplayOptions(), None)
    sdfile = ctl.GetStructuredFile()

    # enumerate ALL flag names available
    flagnames = [n for n in dir(rd.ActionFlags) if not n.startswith("_")]

    def flagstr(fl):
        out = []
        for n in flagnames:
            try:
                bit = getattr(rd.ActionFlags, n)
                if int(fl) & int(bit) and int(bit) != 0:
                    out.append(n)
            except Exception: pass
        return "|".join(out)

    disasm_targets = list(ctl.GetDisassemblyTargets(True))
    saved_cs = set()

    def dump_compute(eid):
        ctl.SetFrameEvent(eid, True)
        pipe = ctl.GetPipelineState()
        refl = pipe.GetShaderReflection(rd.ShaderStage.Compute)
        if refl is None or refl.resourceId == rd.ResourceId.Null():
            p("    (no compute shader bound at eid %d)" % eid); return
        sid = refl.resourceId
        p("    COMPUTE shader %s entry=%s" % (sid, refl.entryPoint))
        # UAVs (read-write)
        try:
            rw = pipe.GetReadWriteResources(rd.ShaderStage.Compute)
            for u in rw:
                try: p("      UAV ->", u.descriptor.resource, u.descriptor.type)
                except Exception as e: p("      UAV err", e)
        except Exception as e:
            p("    GetReadWriteResources err", e)
        # inputs
        try:
            ro = pipe.GetReadOnlyResources(rd.ShaderStage.Compute)
            for u in ro:
                try: p("      SRV <-", u.descriptor.resource)
                except Exception: pass
        except Exception as e:
            p("    ro err", e)
        if sid not in saved_cs:
            saved_cs.add(sid)
            pipeobj = pipe.GetComputePipelineObject()
            for tgt in disasm_targets:
                if tgt != "DXBC": continue
                try:
                    dis = ctl.DisassembleShader(pipeobj, refl, tgt)
                    open(os.path.join(shdir, "%s_CS.txt" % str(sid).replace("ResourceId::","")),
                         "w", encoding="utf-8").write(dis)
                    p("      wrote CS disasm %d chars" % len(dis))
                except Exception as e:
                    p("      CS disasm err", e)

    def walk(actions, depth=0):
        for a in actions:
            nm = a.GetName(sdfile)
            fs = flagstr(a.flags)
            p("EID %5d [%s] %s" % (a.eventId, fs, nm))
            if int(a.flags) & int(rd.ActionFlags.Dispatch):
                dump_compute(a.eventId)
            walk(a.children, depth+1)

    p("ActionFlags available:", flagnames)
    p("---- ALL actions ----")
    walk(ctl.GetRootActions())
    p("---- done ----")
    ctl.Shutdown(); cap.Shutdown()

try: run()
except Exception:
    try:
        os.makedirs(OUT, exist_ok=True)
        open(LOG, "a").write("\nFATAL\n"+traceback.format_exc())
    except Exception: pass
finally:
    os._exit(0)
