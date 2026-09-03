// <StartOverlay> — click-to-start gate for the AudioContext-gesture examples
// (`src/examples/audio/*`). Browsers refuse to start audio without a real user
// gesture and there's no muted-autoplay escape here (unlike `video-panorama`'s
// `<video muted>`), so every webaudio original gates its whole demo behind a
// "Play" button overlay. That overlay IS part of the demo, not shell chrome — so
// it lives in the example, not the app shell.
//
// `data-start-click` is a stable selector: the manifest's `startClick` field points
// Playwright at it (`tests/smoke.spec.ts`, `tests/animates.spec.ts`,
// `scripts/contact-sheet.mjs` all click it — a real, trusted CDP click satisfies
// Chromium's user-activation gate — before waiting on the readiness signal).
import { useState } from 'react';

export interface StartOverlayProps {
  /** Runs once, on the user's first click — create the AudioContext-backed objects
   * and kick off playback here. */
  onStart: () => void;
  /** Button label. Defaults to "Play", matching every original's own overlay. */
  label?: string;
  /** Optional one-line hint under the button (credits/instructions the original
   * shows next to its own overlay). */
  hint?: string;
}

export function StartOverlay({ onStart, label = 'Play', hint }: StartOverlayProps) {
  const [started, setStarted] = useState(false);
  if (started) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        background: 'rgba(10, 10, 10, 0.75)',
        zIndex: 10,
      }}>
      <button
        type="button"
        data-start-click
        onClick={() => {
          setStarted(true);
          onStart();
        }}
        style={{
          padding: '0.75rem 2rem',
          fontSize: '1rem',
          fontWeight: 600,
          color: '#111',
          background: '#e5e5e5',
          border: 'none',
          borderRadius: '0.375rem',
          cursor: 'pointer',
        }}>
        {label}
      </button>
      {hint && <p style={{ color: '#a3a3a3', font: '13px system-ui', margin: 0 }}>{hint}</p>}
    </div>
  );
}
