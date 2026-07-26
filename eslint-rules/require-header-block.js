// Corpus rule: every example ENTRY file leads with the header block schema
// (AGENTS.md Layer 2). Entry file = src/examples/<slug>.tsx or
// src/examples/<slug>/<slug>.tsx; subcomponents inside a folder are exempt.
// Mechanized so agent ports get lint feedback instead of prose review notes.
const ENTRY_RE = /src\/examples\/(?:([^/]+)\.tsx|([^/]+)\/\2\.tsx)$/

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'require the DEMONSTRATES / DIVERGENCE header comment block on example entry files',
    },
    messages: {
      missingHeader:
        'Example entry files must start with the header block: a leading /** … */ comment ' +
        'with DEMONSTRATES and DIVERGENCE sections (see AGENTS.md Layer 2).',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename.replace(/\\/g, '/')
    if (!ENTRY_RE.test(filename)) return {}
    return {
      Program(node) {
        const first = context.sourceCode.getAllComments()[0]
        const ok =
          first &&
          first.type === 'Block' &&
          first.loc.start.line <= 2 &&
          first.value.includes('DEMONSTRATES') &&
          first.value.includes('DIVERGENCE')
        if (!ok) context.report({ node, messageId: 'missingHeader' })
      },
    }
  },
}
