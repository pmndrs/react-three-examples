// Corpus rule: every example ENTRY file leads with the header block schema
// (AGENTS.md § Repo format). Mechanized so agent ports get lint feedback instead of
// prose review notes.
//
// An entry file is the one whose BASENAME is a registered slug, at any depth under
// src/examples/ — so all of these are entries:
//   src/examples/<slug>.tsx
//   src/examples/<slug>/<slug>.tsx
//   src/examples/<category>/<slug>.tsx
//   src/examples/<category>/<slug>/<slug>.tsx
// and every sibling subcomponent (VolumeFire.tsx, seaNodes.tsx, …) is exempt, because
// its basename is not a slug. Matching the manifest instead of the path shape means
// the category reorg needs no change here.
//
// DEMONSTRATES is required. DIVERGENCE is OPTIONAL by design — a faithful port has
// nothing to say, and forcing the section only manufactures boilerplate.
import examples from '../src/examples.json' with { type: 'json' };

const SLUGS = new Set(examples.map((example) => example.slug));

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'require the DEMONSTRATES header comment block on example entry files',
    },
    messages: {
      missingHeader:
        'Example entry files must start with the header block: a leading /** … */ comment ' +
        'containing a DEMONSTRATES section (see AGENTS.md § Repo format). ' +
        'DIVERGENCE is optional — only include it when there is a real difference to call out.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename.replace(/\\/g, '/');
    if (!filename.includes('/src/examples/') || !filename.endsWith('.tsx')) return {};
    // Basename, not a path regex: a greedy `.*` backtracks to capture one character.
    const slug = filename.slice(filename.lastIndexOf('/') + 1, -'.tsx'.length);
    if (!SLUGS.has(slug)) return {};

    return {
      Program(node) {
        const first = context.sourceCode.getAllComments()[0];
        const ok = first && first.type === 'Block' && first.loc.start.line <= 2 && first.value.includes('DEMONSTRATES');
        if (!ok) context.report({ node, messageId: 'missingHeader' });
      },
    };
  },
};
