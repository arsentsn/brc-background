// Self-contained demo with plain controls: no UI kit, drop it anywhere.
// A react-bits fork wants this rewritten against their demo scaffolding
// (PreviewSlider / Customize / CodeExample); see react/README.md.
import { useState } from 'react';

import Marble from './Marble';

// The demo's three looks are this project's own palettes; Marble's own default is the game's
// menu swirl (PROVENANCE.md). Five stops because the shader ramps five bands, the last wrapping.
const PRESETS = {
  ember: ['#ffcf87', '#ff7a5c', '#b02d6e', '#150a12', '#ff9448'],
  indigo: ['#e4ebff', '#8f9cff', '#3b34a8', '#070610', '#5c46dc'],
  slate: ['#f4f1e8', '#9fb0a8', '#3f5a5e', '#0b0f11', '#7c9aa0']
};

export default function MarbleDemo() {
  // Every number here is Marble's own default; only the palette differs, so the demo opens on
  // one of its own looks rather than the reconstructed one.
  const [preset, setPreset] = useState('ember');
  const [scale, setScale] = useState(1);
  const [speed, setSpeed] = useState(0.0122);
  const [offset, setOffset] = useState(0.49);
  const [iterations, setIterations] = useState(18);
  const [amplitude, setAmplitude] = useState(1);

  const control = (label, value, set, min, max, step) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ width: 80 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => set(parseFloat(e.target.value))}
      />
      <span style={{ width: 44, textAlign: 'right' }}>{value}</span>
    </label>
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: 500 }}>
      <Marble
        colors={PRESETS[preset]}
        scale={scale}
        speed={speed}
        offset={offset}
        iterations={iterations}
        amplitude={amplitude}
      />
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          padding: 14,
          borderRadius: 10,
          display: 'grid',
          gap: 6,
          background: 'rgba(16,16,20,.82)',
          backdropFilter: 'blur(6px)',
          color: '#d9d9e0',
          fontFamily: 'ui-monospace, Menlo, monospace'
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          {Object.keys(PRESETS).map(name => (
            <button
              key={name}
              onClick={() => setPreset(name)}
              style={{
                flex: 1,
                padding: '4px 8px',
                fontSize: 11,
                cursor: 'pointer',
                borderRadius: 6,
                border: '1px solid #33333d',
                background: preset === name ? '#e8873b' : '#23232b',
                color: preset === name ? '#111' : '#d9d9e0'
              }}
            >
              {name}
            </button>
          ))}
        </div>
        {/* Ranges are the useful window for each prop rather than its legal one: speed tops
            out well above the studied rate, and `amplitude` scales Marble's BASE_AMPLITUDE. */}
        {control('scale', scale, setScale, 0.3, 3, 0.01)}
        {control('speed', speed, setSpeed, 0, 0.04, 0.0002)}
        {control('offset', offset, setOffset, 0, 1, 0.005)}
        {control('iterations', iterations, setIterations, 2, 24, 1)}
        {control('amplitude', amplitude, setAmplitude, 0.2, 3, 0.05)}
      </div>
    </div>
  );
}
