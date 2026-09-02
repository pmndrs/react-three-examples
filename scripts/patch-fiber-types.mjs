// Types-only patch for @react-three/fiber's `useUniforms` return type (UPSTREAM B1 / A9).
//
// WHY THIS EXISTS
// fiber's `useUniforms` captures the input record type `T` and then throws it away:
//   useUniforms<T extends UniformInputRecord>(uniforms: T): UniformsWithUtils<UniformRecord<UniformNode>>
// `UniformRecord<UniformNode>` is `Record<string, UniformNode<unknown, unknown>>`, so
// every uniform loses BOTH its node type and its value type. That forced a double cast
// (`uFoo as unknown as Node<'float'>`) at 40+ sites in this corpus, and left `.value`
// typed `unknown` — meaning `uFoo.value = "banana"` typechecked.
//
// three types uniforms precisely (`UniformNode<'float', number>` IS a `Node<'float'>`,
// and `uniform()` ships the value→node-type overload table). This patch makes fiber's
// hook preserve what three already knows, mirroring that table.
//
// WHY A SCRIPT AND NOT `pnpm patch`
// fiber is installed from a local tarball (`file:reference/…​.tgz`), so `pnpm patch`
// tries to fetch 10.0.0-alpha.3 from the registry and fails. This runs on postinstall
// instead. It is idempotent and touches ONLY `.d.ts` files — no runtime code.
//
// UNWIND CONDITION: delete this script, its postinstall hook, and the ~40 casts the
// moment fiber ships the B1 fix (both halves). The casts are the regression signal.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const MARKER = 'UniformNodeFor'; // idempotency guard
const TARGETS = [
  '../node_modules/@react-three/fiber/dist/webgpu/index.d.ts',
  '../node_modules/@react-three/fiber/dist/webgpu/index.d.mts',
  '../node_modules/@react-three/fiber/dist/webgpu/index.d.cts',
];

// Mirrors three's own `Uniform` overload table (UniformNode.d.ts). `V extends Node`
// passes TSL nodes (color(), vec3(), an existing uniform) through untouched.
const HELPER = `
/** B1/A9 local patch — see scripts/patch-fiber-types.mjs. Maps a useUniforms input value to three's precisely-typed UniformNode. */
type UniformNodeFor<V> = V extends Node ? V
    : V extends number ? three_webgpu.UniformNode<'float', number>
    : V extends boolean ? three_webgpu.UniformNode<'bool', boolean>
    : V extends three_webgpu.Vector2 ? three_webgpu.UniformNode<'vec2', three_webgpu.Vector2>
    : V extends three_webgpu.Vector3 ? three_webgpu.UniformNode<'vec3', three_webgpu.Vector3>
    : V extends three_webgpu.Vector4 ? three_webgpu.UniformNode<'vec4', three_webgpu.Vector4>
    : V extends three_webgpu.Color ? three_webgpu.UniformNode<'color', three_webgpu.Color>
    : V extends three_webgpu.Matrix3 ? three_webgpu.UniformNode<'mat3', three_webgpu.Matrix3>
    : V extends three_webgpu.Matrix4 ? three_webgpu.UniformNode<'mat4', three_webgpu.Matrix4>
    : V extends string ? three_webgpu.UniformNode<'color', three_webgpu.Color>
    : three_webgpu.UniformNode<unknown, V>;
/** Preserves the input record's KEYS as well — an unknown key is an error again. */
type MappedUniforms<T> = { [K in keyof T]: UniformNodeFor<T[K]> } & {
    removeUniforms: RemoveUniformsFn;
    clearUniforms: ClearUniformsFn;
    rebuildUniforms: RebuildUniformsFn;
};
`;

// The four typed overloads (the no-arg / scope-only readers stay as they are: with no
// input record there is nothing to infer from).
const REPLACEMENTS = [
  [
    'declare function useUniforms<T extends UniformInputRecord>(creator: UniformCreator<T>): UniformsWithUtils<UniformRecord<UniformNode>>;',
    'declare function useUniforms<T extends UniformInputRecord>(creator: UniformCreator<T>): MappedUniforms<T>;',
  ],
  [
    'declare function useUniforms<T extends UniformInputRecord>(creator: UniformCreator<T>, scope: string): UniformsWithUtils<UniformRecord<UniformNode>>;',
    'declare function useUniforms<T extends UniformInputRecord>(creator: UniformCreator<T>, scope: string): MappedUniforms<T>;',
  ],
  [
    'declare function useUniforms<T extends UniformInputRecord>(uniforms: T): UniformsWithUtils<UniformRecord<UniformNode>>;',
    'declare function useUniforms<T extends UniformInputRecord>(uniforms: T): MappedUniforms<T>;',
  ],
  [
    'declare function useUniforms<T extends UniformInputRecord>(uniforms: T, scope: string): UniformsWithUtils<UniformRecord<UniformNode>>;',
    'declare function useUniforms<T extends UniformInputRecord>(uniforms: T, scope: string): MappedUniforms<T>;',
  ],
];

let patched = 0;
let skipped = 0;

for (const relative of TARGETS) {
  const path = fileURLToPath(new URL(relative, import.meta.url));
  let source;
  try {
    source = await readFile(path, 'utf8');
  } catch {
    continue; // variant not present in this build — fine
  }

  if (source.includes(MARKER)) {
    skipped++;
    continue;
  }

  const anchor = REPLACEMENTS[0][0];
  if (!source.includes(anchor)) {
    console.warn(
      `[patch-fiber-types] anchor not found in ${relative} — fiber's useUniforms signature changed.\n` +
        `  Check whether B1 landed upstream; if so, delete this script and the casts it exists for.`,
    );
    process.exitCode = 1;
    continue;
  }

  let out = source;
  for (const [from, to] of REPLACEMENTS) out = out.replaceAll(from, to);
  out = out.replace(
    anchor.replace('UniformsWithUtils<UniformRecord<UniformNode>>', 'MappedUniforms<T>'),
    (m) => HELPER + m,
  );

  await writeFile(path, out);
  patched++;
}

if (patched) console.log(`[patch-fiber-types] patched ${patched} declaration file(s) (UPSTREAM B1/A9)`);
else if (skipped) console.log(`[patch-fiber-types] already applied (${skipped} file(s))`);
