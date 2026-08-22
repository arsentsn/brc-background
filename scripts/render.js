// CPU reimplementation of BRC pixel shader 391 (EID 171) for verification.
const zlib = require('zlib');
const fs = require('fs');

// Authored sRGB bytes for the reference ramp. Third-party colour data, so it is not in
// this repository (see PROVENANCE.md): it comes from the evidence workspace beside it.
// Output bytes then match the reference render directly, with no colour-space conversion.
// Override with BRC_WORKSPACE or BRC_REFERENCE when it lives elsewhere.
const path = require('path');
const WORKSPACE = process.env.BRC_WORKSPACE || path.join(__dirname, '..', '..', 'brc-thing');
const REF_PATH = process.env.BRC_REFERENCE || path.join(WORKSPACE, 'evidence', 'reference.js');
let REF;
try { REF = require(path.resolve(REF_PATH)); }
catch (e) { console.error('cannot read the reference ramp at ' + REF_PATH + ' (see PROVENANCE.md)'); process.exit(1); }
const PALETTE = REF.menuSrgb;
const PAL = PALETTE.map(h=>{const n=parseInt(h.slice(1),16);return [(n>>16)&255,(n>>8)&255,n&255];});
// game sampler (SwirlColorPalletes .meta): filterMode Point, wrap Clamp. u may be NEGATIVE
// (sign-preserving fract, DXBC insts 29-31); clamp then pins it to texel 0.
function pal(u){ let i=Math.floor(u*128); i=Math.max(0,Math.min(127,i)); return PAL[i]; }

const W=1920,H=1080;
const TIME=parseFloat(process.env.T || "0.744");   // cb1[0].x for this frame
const FLOW=0.49;                  // cb0[4].x, CONSTANT across all captures
const phase = (TIME*0.244 - Math.floor(TIME*0.244))*6.28;   // DXBC literal 6.28, NOT 2*pi
const ampx=11.08/467, ampy=18.299999/467;
const denom = Math.max(H*0.005, W/1.9);

const buf = Buffer.alloc(W*H*3);
for(let y=0;y<H;y++){
  for(let x=0;x<W;x++){
    let ax=(x+0.5)/denom, ay=(y+0.5)/denom;   // D3D top-left origin, PIXEL CENTERS (SV_Position is x+0.5)
    for(let i=1;i<19;i++){
      let a=(i*3)*ay + phase;
      let b=(i*3)*ax + phase;
      ax = i*4 + ampx*Math.sin(a) + ax;
      ay = i*4 + ampy*Math.cos(b) + ay;
    }
    let m = 0.358*ax + 0.642*ay;
    m = Math.cos(m)*10.97 + FLOW;   // shader's final sincos writes COS, not sin
    let u = Math.abs(m); u = u-Math.floor(u);
    if(m < 0) u = -u;               // sign-preserving fract (DXBC insts 29-31); pal() clamps
    let c = pal(u);
    let o=(y*W+x)*3;
    buf[o]=c[0]|0; buf[o+1]=c[1]|0; buf[o+2]=c[2]|0;
  }
}

// minimal PNG encoder (truecolor, no filter)
function png(w,h,rgb){
  const raw = Buffer.alloc((w*3+1)*h);
  for(let y=0;y<h;y++){ raw[y*(w*3+1)]=0; rgb.copy(raw, y*(w*3+1)+1, y*w*3, (y+1)*w*3); }
  const idat = zlib.deflateSync(raw);
  const chunk=(type,data)=>{ const len=Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t=Buffer.from(type); const crc=Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t,data]))>>>0); return Buffer.concat([len,t,data,crc]); };
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4);
  ihdr[8]=8; ihdr[9]=2; // 8-bit truecolor
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  return Buffer.concat([sig, chunk('IHDR',ihdr), chunk('IDAT',idat), chunk('IEND',Buffer.alloc(0))]);
}
let CRC=[]; for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;CRC[n]=c>>>0;}
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return c^0xffffffff;}

// Renders land beside the evidence they are compared against: BRC_OUT if set,
// otherwise the workspace's dump directory. Never inside the repository.
const outDir = process.env.BRC_OUT || path.join(WORKSPACE, 'dump');
const name = path.join(outDir, 'replica_t'+TIME.toFixed(3)+'.png');
fs.writeFileSync(name, png(W,H,buf));
console.log('wrote', name, ' phase=',phase.toFixed(4));
