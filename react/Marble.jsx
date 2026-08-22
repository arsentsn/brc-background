import { Renderer, Program, Mesh, Triangle, Texture } from 'ogl';
import { useEffect, useRef } from 'react';

const RAMP_SIZE = 128;

// Five flat colour bands with short blended transitions between them. The
// proportions are tuned rather than even; override with `bands`, or pass a
// different number of colours to get an evenly split ramp. The default is the
// reconstructed original scheme; see PROVENANCE.md.
const DEFAULT_COLORS = ['#dccf9f', '#5dc38d', '#10b6cb', '#000000', '#10b6cb'];
const DEFAULT_BANDS = [
  [0, 29],
  [34, 45],
  [49, 77],
  [81, 109],
  [113, 127]
];

// Base warp amplitude per axis; the `amplitude` prop scales both.
const BASE_AMPLITUDE = [11.08 / 467, 18.3 / 467];
const TRANSITION = 4;

// The container fills its parent and clips. These live here rather than in a
// stylesheet so the component carries its own styling; `style` is merged over
// them, so a caller can override any of it.
const CONTAINER_STYLE = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden'
};

const hexToRgb = hex => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const smoothstep = t => t * t * (3 - 2 * t);

const evenBands = count => {
  const width = RAMP_SIZE / count;
  return Array.from({ length: count }, (_, i) => [
    i === 0 ? 0 : Math.round(i * width) + TRANSITION,
    Math.round((i + 1) * width) - 1
  ]);
};

// Builds the ramp lookup table. Bands are held flat and the gaps between them
// are blended in sRGB space with a doubled smoothstep, a combination that was
// fitted against the original ramp and tracks it closely on the
// transition texels (a linear-space lerp does not).
function buildRamp(colors, bands) {
  const stops = colors.map(hexToRgb);
  const segments = bands && bands.length === colors.length ? bands : evenBands(colors.length);
  const data = new Uint8Array(RAMP_SIZE * 4);

  for (let x = 0; x < RAMP_SIZE; x++) {
    let rgb = stops[stops.length - 1];
    for (let s = 0; s < segments.length; s++) {
      if (x <= segments[s][1]) {
        if (x >= segments[s][0]) {
          rgb = stops[s];
        } else {
          const prev = segments[s - 1];
          const raw = (x - prev[1]) / (segments[s][0] - prev[1]);
          const t = smoothstep(smoothstep(raw));
          rgb = stops[s - 1].map((c, k) => c + (stops[s][k] - c) * t);
        }
        break;
      }
    }
    data[x * 4] = Math.round(rgb[0] * 255);
    data[x * 4 + 1] = Math.round(rgb[1] * 255);
    data[x * 4 + 2] = Math.round(rgb[2] * 255);
    data[x * 4 + 3] = 255;
  }
  return data;
}

const vertexShader = `
attribute vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform vec2 uResolution;
uniform float uPhase;
uniform float uScale;
uniform float uOffset;
uniform int uIterations;
uniform vec2 uAmplitude;
uniform float uCollapse;
uniform sampler2D uRamp;

void main() {
  vec2 fc = gl_FragCoord.xy;
  fc.y = uResolution.y - fc.y;

  // One divisor for BOTH axes, so the warp stays square at any aspect ratio.
  // Tied to width, so the pattern keeps a constant on-screen density
  // viewport changes; the height term only guards degenerate sizes.
  float denom = max(uResolution.y * 0.005, uResolution.x / 1.9) / uScale;
  vec2 uv = fc / denom;

  float phase = uPhase * 6.28;
  vec2 acc = uv;

  // WebGL1 needs a constant loop bound, hence the break.
  for (int i = 1; i <= 64; i++) {
    if (i > uIterations) break;
    float fi = float(i);
    // a and b both read the PREVIOUS acc, so do not inline them into the
    // assignments below, or acc.y would warp against an already-updated acc.x.
    float a = (fi * 3.0) * acc.y + phase;
    float b = (fi * 3.0) * acc.x + phase;
    acc.x = fi * 4.0 + uAmplitude.x * sin(a) + acc.x;
    acc.y = fi * 4.0 + uAmplitude.y * cos(b) + acc.y;
  }

  // Collapse to one scalar. The tuned default lands the result near a
  // cosine extremum, which is what keeps the bands broad and calm; \`collapse\`
  // 1.0 (acc.x alone) lands mid-slope and gives much denser banding. The
  // two weights always sum to 1.
  float m = uCollapse * acc.x + (1.0 - uCollapse) * acc.y;
  m = cos(m) * 10.97 + uOffset;  // COSINE, not sine: sine here is a busy mess

  // Sign-preserving fract. Never fires at default settings, but at large scales
  // m goes negative and CLAMP_TO_EDGE pins those pixels to the first texel.
  float u = fract(abs(m));
  if (m < 0.0) u = -u;

  gl_FragColor = vec4(texture2D(uRamp, vec2(u, 0.5)).rgb, 1.0);
}
`;

export default function Marble({
  colors = DEFAULT_COLORS,
  bands = DEFAULT_BANDS,
  scale = 1,
  speed = 0.0122,
  offset = 0.49,
  iterations = 18,
  amplitude = 1,
  collapse = 0.358,
  paused = false,
  dpr,
  className = '',
  style
}) {
  const containerRef = useRef(null);
  const textureRef = useRef(null);
  const settingsRef = useRef({ scale, speed, offset, iterations, amplitude, collapse, paused });

  // Read live values from a ref inside the render loop, so changing scale,
  // speed, offset, iterations, amplitude or collapse never tears down the GL context.
  settingsRef.current = { scale, speed, offset, iterations, amplitude, collapse, paused };

  const colorKey = colors.join(',');
  const bandKey = JSON.stringify(bands);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const renderer = new Renderer({
      dpr: dpr ?? Math.min(window.devicePixelRatio || 1, 2),
      alpha: false,
      antialias: false
    });
    const gl = renderer.gl;
    container.appendChild(gl.canvas);
    // The canvas is ours, so it is styled from here for the same reason: no
    // stylesheet to ship. display:block is what removes the inline-element gap.
    gl.canvas.style.display = 'block';
    gl.canvas.style.width = '100%';
    gl.canvas.style.height = '100%';

    const texture = new Texture(gl, {
      image: buildRamp(colors, bands),
      width: RAMP_SIZE,
      height: 1,
      generateMipmaps: false,
      minFilter: gl.NEAREST,
      magFilter: gl.NEAREST,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      flipY: false
    });
    textureRef.current = texture;

    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uResolution: { value: [1, 1] },
        uPhase: { value: 0 },
        uScale: { value: scale },
        uOffset: { value: offset },
        uIterations: { value: iterations },
        uAmplitude: { value: [BASE_AMPLITUDE[0], BASE_AMPLITUDE[1]] },
        uCollapse: { value: collapse },
        uRamp: { value: texture }
      }
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container;
      renderer.setSize(Math.max(w, 1), Math.max(h, 1));
      program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height];
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let frame = 0;
    let phase = 0;
    let last = null;

    const draw = now => {
      frame = requestAnimationFrame(draw);
      const s = settingsRef.current;

      const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!s.paused && !reduceMotion) phase = (phase + dt * s.speed) % 1;

      program.uniforms.uPhase.value = phase;
      program.uniforms.uScale.value = s.scale;
      program.uniforms.uOffset.value = s.offset;
      program.uniforms.uIterations.value = s.iterations;
      program.uniforms.uAmplitude.value = [
        BASE_AMPLITUDE[0] * s.amplitude,
        BASE_AMPLITUDE[1] * s.amplitude
      ];
      program.uniforms.uCollapse.value = s.collapse;
      renderer.render({ scene: mesh });
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (gl.canvas.parentNode === container) container.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      textureRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dpr]);

  // Recolour in place, with no context rebuild.
  useEffect(() => {
    const texture = textureRef.current;
    if (!texture) return;
    texture.image = buildRamp(colors, bands);
    texture.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorKey, bandKey]);

  return <div ref={containerRef} className={className} style={{ ...CONTAINER_STYLE, ...style }} />;
}
