// Ambient module declaration for three.js's WebCodecs MP4 demuxer addon
// (`examples/jsm/libs/demuxer_mp4.js`). Unlike most jsm addons, this one has NO
// `.d.ts` anywhere — not generated for the runtime package, not in @types/three
// (it lives under `libs/`, not a typed `loaders`/`geometries`/... addon folder).
// A genuine upstream gap, typed narrowly here to the surface `video-frame.tsx` uses.
declare module 'three/addons/libs/demuxer_mp4.js' {
  export class MP4Demuxer {
    constructor(
      uri: string,
      callbacks: {
        onConfig: (config: VideoDecoderConfig) => void;
        onChunk: (chunk: EncodedVideoChunk) => void;
        setStatus: (kind: string, status: string) => void;
      },
    );
  }
}
