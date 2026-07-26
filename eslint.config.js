// Conventions lint (SPEC §7: mechanize everything mechanizable).
// Custom corpus rules live in eslint-rules/ as a local flat-config plugin —
// promoted from repeated review notes; prose in AGENTS.md is the fallback, not the rule.
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import * as r3f from '@react-three/eslint-plugin'
import requireHeaderBlock from './eslint-rules/require-header-block.js'

export default tseslint.config(
  { ignores: ['dist/', 'reference/', 'node_modules/', 'patches/', 'test-results/'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    plugins: {
      'react-hooks': reactHooks,
      '@react-three': r3f,
      corpus: { rules: { 'require-header-block': requireHeaderBlock } },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@react-three/no-clone-in-loop': 'error',
      '@react-three/no-new-in-loop': 'warn',
      'corpus/require-header-block': 'error',
      // AGENTS.md Layer 1: single fiber entry, renderer-split drei subpaths only.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@react-three/fiber',
              message: 'Import from @react-three/fiber/webgpu (single-entry rule, AGENTS.md).',
            },
            {
              name: '@react-three/fiber/legacy',
              message: 'Legacy fiber is WebGL-only; this corpus is WebGPU-first.',
            },
            {
              name: '@react-three/drei',
              message:
                'Root drei is legacy-flavored. Import from @react-three/drei/webgpu or /core.',
            },
            {
              name: '@react-three/drei/legacy',
              message: 'Never drei/legacy in webgpu examples.',
            },
          ],
        },
      ],
    },
  },
)
