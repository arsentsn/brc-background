// Byte-exactness regression check.
//
// Recomputes the reference pixels listed in the capture evidence with the CPU model and
// compares them byte-for-byte. Both inputs are game-derived, so neither is in this
// repository (see PROVENANCE.md): they come from the evidence workspace beside it, which
// is where WORKSPACE points. Override any of the three when it lives somewhere else:
//
//   node scripts/verify.js                                  # workspace beside the repo
//   BRC_WORKSPACE=/path/to/workspace node scripts/verify.js
//   BRC_REFERENCE=... BRC_PICK=... node scripts/verify.js    # per-file
//
// Missing, it says so and exits rather than pretending to pass.
//
const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.BRC_WORKSPACE || path.join(__dirname, '..', '..', 'brc-thing');
const refPath = process.env.BRC_REFERENCE || path.join(WORKSPACE, 'evidence', 'reference.js');
const pickPath = process.env.BRC_PICK || path.join(WORKSPACE, 'dump', 'pick.txt');
let REF;
try {
  REF = require(path.resolve(refPath));
} catch (e) {
  console.error('cannot read the reference ramp at ' + refPath + ' (see PROVENANCE.md)');
  process.exit(1);
}
if (!fs.existsSync(pickPath)) {
  console.error('cannot read the pick list at ' + pickPath + ' (see PROVENANCE.md)');
  process.exit(1);
}

const PAL = REF.menuSrgb.map(h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });
function pal(u) { let i = Math.floor(u * 128); i = Math.max(0, Math.min(127, i)); return PAL[i]; }

const W = 1920, H = 1080;
const TIME = parseFloat(process.env.T || '0.744');   // frozen clock for the reference frame
const FLOW = 0.49;
const phase = (TIME * 0.244 - Math.floor(TIME * 0.244)) * 6.28;
const ampx = 11.08 / 467, ampy = 18.299999 / 467;
const denom = Math.max(H * 0.005, W / 1.9);

function shade(px, py) {
  let ax = (px + 0.5) / denom, ay = (py + 0.5) / denom;   // pixel centres
  for (let i = 1; i < 19; i++) {
    const a = (i * 3) * ay;
    const b = (i * 3) * ax;
    ax = i * 4 + ampx * Math.sin(a + phase) + ax;
    ay = i * 4 + ampy * Math.cos(b + phase) + ay;
  }
  let m = 0.358 * ax + 0.642 * ay;
  m = Math.cos(m) * 10.97 + FLOW;
  let u = Math.abs(m); u = u - Math.floor(u);
  if (m < 0) u = -u;
  return pal(u);
}

const rows = fs.readFileSync(pickPath, 'utf8').trim().split('\n').map(line => {
  const m = line.match(/\((\d+),\s*(\d+)\)\s*=\s*\[([^\]]+)\]/);
  if (!m) return null;
  return {
    x: +m[1], y: +m[2],
    expect: m[3].split(',').map(v => Math.round(parseFloat(v) * 255))
  };
}).filter(Boolean);

let pass = 0;
for (const r of rows) {
  const got = shade(r.x, r.y);
  const ok = got.every((c, i) => c === r.expect[i]);
  if (ok) pass++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} (${r.x},${r.y})  got [${got}]  expect [${r.expect}]`);
}
console.log(`\n${pass}/${rows.length} byte-exact at t=${TIME}`);
process.exit(pass === rows.length ? 0 : 1);
