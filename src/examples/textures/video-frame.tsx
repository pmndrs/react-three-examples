/**
 * video-frame
 * R3F port of three.js `webgpu_video_frame`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_video_frame (~110 lines of JS)
 *
 * DEMONSTRATES
 * - `THREE.VideoFrameTexture`: unlike `VideoTexture` (which reads a live
 *   `<video>` element every frame), this texture has no element at all — each frame
 *   is pushed in manually via `.setFrame(videoFrame)`, flagging `needsUpdate` itself
 * - The WebCodecs `VideoDecoder` API decoding raw H.264 access units straight off an
 *   MP4 container (via the three.js addon `MP4Demuxer`, built on mp4box.js) — frames
 *   arrive as fast as the decoder can produce them, not gated to the video's own
 *   playback clock the way a `<video>` element would be
 * - A genuinely vanilla effect for the decode pipeline itself: WebCodecs is a raw,
 *   callback-driven browser API with no hook to wrap it in, so the decoder/demuxer
 *   setup lives in one `useEffect`, guarded against StrictMode's double-invoke and
 *   cleaned up by closing the decoder (AGENTS.md rule 3: vanilla when React can't
 *   express it, kept visible in the component that owns it)
 * - `THREE.DefaultLoadingManager.itemStart/itemEnd` called by hand around the fetch
 *   + decode of the first frame — the same signal drei's suspending loader hooks
 *   report to automatically, so this repo's shared readiness gate (which polls
 *   drei's `useProgress`) waits for an actual decoded frame instead of firing the
 *   instant the (still-black) plane mounts
 *
 * DIVERGENCE from original
 * - `window.innerWidth/innerHeight` + a manual `resize` listener are dropped — fiber
 *   sizes the canvas/camera to its container automatically
 * - When the MP4 finishes demuxing and the decoder flushes, the original does
 *   `scene.remove(mesh)`; this port sets a `finished` flag and returns `null` instead
 *   — same effect (the plane disappears once every frame has played through once,
 *   the video never loops)
 */
import { useEffect, useState } from 'react';
import { MP4Demuxer } from 'three/addons/libs/demuxer_mp4.js';
import { DefaultLoadingManager, NoToneMapping, SRGBColorSpace, VideoFrameTexture } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const VIDEO_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/sintel.mp4';

// `VideoFrameTexture.image` types as `VideoFrame | {}` upstream (@types/three's `{}`
// placeholder for "no frame yet") — broad enough that `instanceof VideoFrame`
// narrowing doesn't leave a callable `.close()`. One cast, isolated here; the `{}`
// param type is matched to the upstream signature, not chosen freely.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
function closeIfFrame(image: VideoFrame | {}) {
  if (image instanceof VideoFrame) (image as VideoFrame).close();
}

function DecodedVideoPlane() {
  // Non-node instance driven entirely from the decoder callback below — lazy
  // useState keeps identity stable across a StrictMode re-render.
  const [texture] = useState(() => {
    const tex = new VideoFrameTexture();
    tex.colorSpace = SRGBColorSpace;
    return tex;
  });
  const [finished, setFinished] = useState(false);

  // WebCodecs has no fiber hook to lean on — decode + demux is raw callback-driven
  // browser API, ported close to the original's shape (AGENTS.md rule 3).
  useEffect(() => {
    let cancelled = false;
    let firstFrameSeen = false;

    // Registered/cleared exactly once, around the wait for the FIRST frame — this
    // repo's readiness gate polls `active` and shouldn't declare victory over a
    // still-black plane. See DEMONSTRATES.
    DefaultLoadingManager.itemStart(VIDEO_URL);

    const decoder = new VideoDecoder({
      output(frame) {
        if (cancelled) {
          frame.close();
          return;
        }
        // Avoid stalling the decoder: close the previous VideoFrame before adopting
        // the new one (WebCodecs spec note ported verbatim from the original).
        closeIfFrame(texture.image);
        texture.setFrame(frame);
        if (!firstFrameSeen) {
          firstFrameSeen = true;
          DefaultLoadingManager.itemEnd(VIDEO_URL);
        }
      },
      error(e) {
        console.error('VideoDecoder:', e);
      },
    });

    new MP4Demuxer(VIDEO_URL, {
      onConfig(config) {
        if (!cancelled) decoder.configure(config);
      },
      onChunk(chunk) {
        if (!cancelled) decoder.decode(chunk);
      },
      setStatus(kind, status) {
        if (cancelled || kind !== 'fetch' || status !== 'Done') return;
        decoder.flush().then(() => {
          if (cancelled) return;
          decoder.close();
          closeIfFrame(texture.image);
          // Original also nulls `videoTexture.image` here; skipped — the plane
          // unmounts right below (`finished`), so the texture becomes unreachable
          // with nothing left sampling it.
          setFinished(true);
        });
      },
    });

    return () => {
      cancelled = true;
      if (!firstFrameSeen) DefaultLoadingManager.itemEnd(VIDEO_URL);
      if (decoder.state !== 'closed') decoder.close();
    };
  }, [texture]);

  if (finished) return null;

  return (
    <mesh>
      <planeGeometry />
      <meshBasicNodeMaterial map={texture} />
    </mesh>
  );
}

export default function VideoFrame() {
  return (
    <Canvas renderer={{ toneMapping: NoToneMapping }} camera={{ position: [0, 0, 1], fov: 75, near: 0.25, far: 10 }}>
      <DecodedVideoPlane />
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  );
}
