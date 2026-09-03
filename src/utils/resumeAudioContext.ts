// Shared fix for a real @types/three gap (checked r185): `AudioContext.getContext()`
// is typed to return THREE's OWN `AudioContext` class — self-referential, even though
// its own JSDoc says `Window.AudioContext` — while at runtime it returns the native
// `window.AudioContext` singleton (three/src/audio/AudioContext.js:
// `new (window.AudioContext || window.webkitAudioContext)()`). Cast, don't `any`
// (AGENTS.md "casts are a bug report"); ledgered in docs/REVIEW-QUEUE.md since this
// repo's task didn't allow editing docs/UPSTREAM.md directly.
//
// Every `AudioListener`/`Audio` instance in this repo shares this one lazily-created
// context, and browsers only let it start "running" from a trusted user gesture — so
// this belongs inside a click handler (`<StartOverlay>`'s `onStart`), not an effect.
import { AudioContext as ThreeAudioContext } from 'three/webgpu';

export function resumeAudioContext() {
  return (ThreeAudioContext.getContext() as unknown as globalThis.AudioContext).resume();
}
