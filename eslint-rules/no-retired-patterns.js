// Corpus rule: patterns that WERE required and are not any more.
//
// Retiring a rule in AGENTS.md does not clean the corpus. Both of these were found
// surviving in categories that had already been restyled — an agent reading a file
// full of a retired pattern copies it, and a reviewer reading the inline comment that
// cites the (closed) upstream brief believes it. Mechanized so the doc and the code
// cannot drift apart again.
//
// 1. `as WebGPURenderer` — UPSTREAM B9, fixed in fiber alpha.4. On the `/webgpu` entry
//    `state.renderer` is already typed `WebGPURenderer`. 24 sites when this landed.
// 2. `useFrame((_, delta) => …)` — House style rule 10. `state.elapsed` (s),
//    `state.delta` (s) and `state.time` (ms) all live on state; skipping the parameter
//    positionally hides that. 12 sites when this landed.

export default {
  meta: {
    type: 'problem',
    docs: { description: 'ban patterns retired by a dependency bump or house-style rule' },
    messages: {
      rendererCast:
        '`as WebGPURenderer` is retired (UPSTREAM B9, fixed in fiber alpha.4). ' +
        'On the /webgpu entry `state.renderer` is already typed — write ' +
        '`useThree((state) => state.renderer)` and drop the cast and its import.',
      frameParams:
        'Destructure useFrame state: `useFrame(({ delta, elapsed }) => …)`. ' +
        'AGENTS.md § House style 10 — `elapsed` (s), `delta` (s) and `time` (ms) all ' +
        'live on state, so skipping it positionally hides what is available.',
    },
    schema: [],
  },
  create(context) {
    return {
      // `x as WebGPURenderer`
      TSAsExpression(node) {
        const ann = node.typeAnnotation;
        if (ann?.type === 'TSTypeReference' && ann.typeName?.name === 'WebGPURenderer') {
          context.report({ node, messageId: 'rendererCast' });
        }
      },
      // useFrame((_, delta) => …) / useFrame((state, delta) => …)
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'useFrame') return;
        const cb = node.arguments[0];
        if (!cb || (cb.type !== 'ArrowFunctionExpression' && cb.type !== 'FunctionExpression')) return;
        // Two positional params means the state object was taken whole (or skipped)
        // rather than destructured.
        if (cb.params.length >= 2 && cb.params[0].type === 'Identifier') {
          context.report({ node: cb.params[0], messageId: 'frameParams' });
        }
      },
    };
  },
};
