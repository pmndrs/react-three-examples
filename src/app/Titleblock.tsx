import type { ExampleMeta } from './manifest'

// Standard per-example titleblock — shell-level DOM overlay, not in-canvas furniture.
// Driven entirely by examples.json so ports get it for free; grows into the M2
// per-example page footer (code view / agent buttons live in the same region later).
export function Titleblock({ meta }: { meta: ExampleMeta }) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex items-center gap-3 rounded-lg border border-white/10 bg-neutral-950/70 px-3.5 py-2.5 backdrop-blur-sm">
      {/* Logo slot — placeholder mark until we have real art. */}
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/10 text-[10px] font-bold tracking-tight text-white/80">
        r3f
      </div>
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-neutral-100">{meta.title}</h2>
        <p className="truncate text-xs text-neutral-400">
          {meta.original && (
            <a
              href={meta.original}
              target="_blank"
              rel="noreferrer"
              className="pointer-events-auto underline-offset-2 hover:text-white hover:underline"
            >
              three.js original ↗
            </a>
          )}
          {meta.original && meta.credits && <span> · </span>}
          {meta.credits && <span>{meta.credits}</span>}
        </p>
      </div>
    </div>
  )
}
