// Byte-exact reference ramps: colour data transcribed from the studied game's
// colour atlas. Game-derived, so what it is and why it ships here is in PROVENANCE.md.
// The page runs without it: every ramp rebuilds from five colour stops at runtime.
// menuSrgb = the central-menu row (authored PNG row 24, sampled at v=0.808);
// splashSrgb = the splash / slate-menu row (row 44, v=0.65). Authored sRGB bytes.
// Dual-use: Node (scripts/verify.js) via module.exports, the page via the global.
const REFERENCE = {};
REFERENCE.menuSrgb = [
  '#dccf9f','#dccf9f','#dccf9f','#dccf9f','#dccf9f','#dccf9f','#dccf9f','#dccf9f',
  '#dccf9f','#dccf9f','#dccf9f','#dccf9f','#dccf9f','#dccf9f','#dccf9f','#dccf9f',
  '#dccf9f','#dccf9f','#dccf9f','#dccf9f','#dccf9f','#dccf9f','#dccf9f','#dccf9f',
  '#dccf9f','#dccf9f','#dccf9f','#dccf9f','#dccf9f','#dccf9f','#dbcf9f','#bfcc9b',
  '#7ac691','#5ec38d','#5dc38d','#5dc38d','#5dc38d','#5dc38d','#5dc38d','#5dc38d',
  '#5dc38d','#5dc38d','#5dc38d','#5dc38d','#5dc38d','#5dc38d','#56c293','#30bbb1',
  '#13b6c9','#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb',
  '#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb',
  '#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb',
  '#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb','#0ea5b8','#074c55',
  '#010708','#000000','#000000','#000000','#000000','#000000','#000000','#000000',
  '#000000','#000000','#000000','#000000','#000000','#000000','#000000','#000000',
  '#000000','#000000','#000000','#000000','#000000','#000000','#000000','#000000',
  '#000000','#000000','#000000','#000000','#000000','#000000','#021113','#096a76',
  '#0fafc3','#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb',
  '#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb','#10b6cb'
];
REFERENCE.splashSrgb = [
  '#ce714b','#ce714b','#ce714b','#ce714b','#ce714b','#ce714b','#ce714b','#ce714b',
  '#ce714b','#ce714b','#ce714b','#ce714b','#ce714b','#ce714b','#ce714b','#ce714b',
  '#ce714b','#ce714b','#ce714b','#ce714b','#ce714b','#ce714b','#ce714b','#ce714b',
  '#ce714b','#ce714b','#ce714b','#ce714b','#ce714b','#ce714b','#cd714b','#b76f5b',
  '#7f6c83','#696a93','#686a93','#686a93','#686a93','#686a93','#686a93','#686a93',
  '#686a93','#686a93','#686a93','#686a93','#686a93','#686a93','#686a93','#686a93',
  '#686a93','#686a93','#686a93','#686a93','#686a93','#686a93','#686a93','#686a93',
  '#686a93','#686a93','#686a93','#686a93','#686a93','#686a93','#686a93','#686a93',
  '#686a93','#686a93','#686a93','#686a93','#686a93','#686a93','#686a93','#686a93',
  '#686a93','#686a93','#686a93','#686a93','#686a93','#686a93','#62638a','#463e59',
  '#2f2133','#2d1e2f','#2d1e2f','#2d1e2f','#2d1e2f','#2d1e2f','#2d1e2f','#2d1e2f',
  '#2d1e2f','#2d1e2f','#2d1e2f','#2d1e2f','#2d1e2f','#2d1e2f','#2d1e2f','#2d1e2f',
  '#2d1e2f','#2d1e2f','#2d1e2f','#2d1e2f','#2d1e2f','#2d1e2f','#2d1e2f','#2d1e2f',
  '#2d1e2f','#2d1e2f','#2d1e2f','#2d1e2f','#2d1e2f','#2d1e2f','#332538','#4f4a69',
  '#66678f','#686a93','#686a93','#686a93','#686a93','#686a93','#686a93','#686a93',
  '#686a93','#686a93','#686a93','#686a93','#686a93','#686a93','#686a93','#686a93'
];
// The rows keyed by the preset each one belongs to, which is all the page wants from this
// file: it swaps the ramp in over that preset's five-stop rebuild. The splash row reaches
// the page as the slate menu's, the one preset that carries it.
REFERENCE.ramps = {
  menu:      REFERENCE.menuSrgb,
  slatemenu: REFERENCE.splashSrgb,
};
if (typeof module !== 'undefined' && module.exports) module.exports = REFERENCE;
