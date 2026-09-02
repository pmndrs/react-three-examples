// Corpus rule: imports follow the AGENTS.md § House style 8 hierarchy — broadest and
// most fundamental first, local last.
//
//   react
//   three (three, three/tsl, three/webgpu, three/addons)
//   @react-three/fiber
//   @react-three/drei, other third-party r3f (leva, camera-controls)
//   global utils (src/utils, src/assets, src/types — reached via ../../)
//   parent-relative, then sibling-relative
//
// Promoted from review notes: the restyle wave found this violated in 9 of 11 files in a
// single category, and every batch before it had been fixing the same thing by hand.
// Mechanizing the DETECTION is the win; the fix stays manual because import statements
// carry attached comments that a naive reorder would strip or misplace.

const TIERS = [
  [0, (s) => s === 'react' || s.startsWith('react/') || s.startsWith('react-dom')],
  [1, (s) => s === 'three' || s.startsWith('three/')],
  [2, (s) => s === '@react-three/fiber' || s.startsWith('@react-three/fiber/')],
  // Everything else non-relative: drei, leva, camera-controls, react-router, …
  [3, (s) => !s.startsWith('.')],
];

/** Rank an import source. Lower sorts earlier. */
function rank(source) {
  for (const [tier, test] of TIERS) if (test(source)) return [tier, 0];
  // Relative: more `../` means more global, so it comes first. `./` is last.
  const ups = (source.match(/\.\.\//g) ?? []).length;
  return [4, -ups];
}

const TIER_LABEL = ['react', 'three', '@react-three/fiber', 'third-party', 'local'];

export default {
  meta: {
    type: 'layout',
    docs: { description: 'enforce the AGENTS.md import hierarchy' },
    messages: {
      outOfOrder:
        "'{{source}}' ({{tier}}) must come before '{{prevSource}}' ({{prevTier}}) — " +
        'AGENTS.md § House style 8: react, three, @react-three/fiber, third-party, local.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        const imports = program.body.filter(
          // Type-only imports interleave freely; they read as part of their tier.
          (node) => node.type === 'ImportDeclaration',
        );
        let prev = null;
        for (const node of imports) {
          const source = node.source.value;
          if (typeof source !== 'string') continue;
          const key = rank(source);
          if (prev && (key[0] < prev.key[0] || (key[0] === prev.key[0] && key[1] < prev.key[1]))) {
            context.report({
              node,
              messageId: 'outOfOrder',
              data: {
                source,
                prevSource: prev.source,
                tier: TIER_LABEL[key[0]],
                prevTier: TIER_LABEL[prev.key[0]],
              },
            });
          }
          prev = { key, source };
        }
      },
    };
  },
};
