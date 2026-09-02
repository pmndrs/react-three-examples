import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { CATEGORIES, categoryAccent, categoryLabels, exampleMeta, type ExampleMeta } from './manifest'

// Sidebar: grouped-by-category nav + a plain substring search over title/slug/
// tags/category (131 items — no search library needed, see AGENTS.md). Groups a
// query doesn't touch collapse out entirely rather than staying empty.
export function Layout() {
  const [query, setQuery] = useState('')
  const location = useLocation()
  const activeSlug = location.pathname.startsWith('/examples/') ? location.pathname.slice('/examples/'.length) : null

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (example: ExampleMeta) =>
      q.length === 0 ||
      example.title.toLowerCase().includes(q) ||
      example.slug.includes(q) ||
      example.category.includes(q) ||
      example.tags.some((tag) => tag.includes(q))

    const byCategory = new Map<string, ExampleMeta[]>()
    for (const example of exampleMeta) {
      if (!matches(example)) continue
      const list = byCategory.get(example.category) ?? []
      list.push(example)
      byCategory.set(example.category, list)
    }
    for (const list of byCategory.values()) list.sort((a, b) => a.title.localeCompare(b.title))

    return CATEGORIES.map((category) => ({ category, examples: byCategory.get(category) ?? [] })).filter(
      (group) => group.examples.length > 0,
    )
  }, [query])

  const activeItemRef = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeSlug]) // only on navigation — a search keystroke shouldn't yank the scroll position

  const resultCount = groups.reduce((sum, g) => sum + g.examples.length, 0)

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100">
      <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-800">
        <div className="border-b border-neutral-800 p-4">
          <Link to="/" className="text-sm font-semibold tracking-wide text-neutral-200 hover:text-white">
            r3f-examples
          </Link>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, tag, category…"
            className="mt-3 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-neutral-600"
          />
          {query.trim().length > 0 && (
            <p className="mt-1.5 text-xs text-neutral-600">
              {resultCount} result{resultCount === 1 ? '' : 's'}
            </p>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {groups.length === 0 && <p className="px-3 py-4 text-sm text-neutral-600">No examples match "{query}".</p>}
          {groups.map(({ category, examples }) => (
            <div key={category} className="mb-3">
              <h2 className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: categoryAccent[category] }} />
                {categoryLabels[category]}
              </h2>
              <ul className="space-y-0.5">
                {examples.map((example) => {
                  const isActive = example.slug === activeSlug
                  return (
                    <li key={example.slug}>
                      <NavLink
                        ref={isActive ? activeItemRef : undefined}
                        to={`/examples/${example.slug}`}
                        className={({ isActive }) =>
                          `block truncate rounded-md px-3 py-1.5 text-sm transition-colors ${
                            isActive
                              ? 'bg-neutral-800 text-white'
                              : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                          }`
                        }
                      >
                        {example.title}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
