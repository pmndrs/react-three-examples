import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router';
import { CATEGORIES, categoryAccent, categoryLabels, exampleMeta, type ExampleMeta } from './manifest';
import { Thumb } from './Thumb';

// `?tag=` holds a comma-separated, alphabetically-sorted list of selected tags — one
// param rather than repeated `tag=` keys, so a filtered view is a single copy-pasteable
// URL (AGENTS.md R4 brief).
function parseTagParam(searchParams: URLSearchParams): string[] {
  const raw = searchParams.get('tag');
  return raw ? raw.split(',').filter(Boolean) : [];
}

// Sidebar: grouped-by-category nav + a plain substring search over title/slug/
// tags/category (now 268 items — no search library needed, see AGENTS.md), composable
// with a tag multi-select synced to `?tag=`. Groups neither touches collapse out
// entirely rather than staying open empty.
export function Layout() {
  const [query, setQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const location = useLocation();
  const activeSlug = location.pathname.startsWith('/examples/') ? location.pathname.slice('/examples/'.length) : null;

  const selectedTags = useMemo(() => parseTagParam(searchParams), [searchParams]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const example of exampleMeta) for (const tag of example.tags) set.add(tag);
    return [...set].sort();
  }, []);

  function setTags(next: string[]) {
    const params = new URLSearchParams(searchParams);
    if (next.length > 0) params.set('tag', [...next].sort().join(','));
    else params.delete('tag');
    setSearchParams(params, { replace: true });
  }

  function toggleTag(tag: string) {
    setTags(selectedTags.includes(tag) ? selectedTags.filter((t) => t !== tag) : [...selectedTags, tag]);
  }

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (example: ExampleMeta) => {
      const searchOk =
        q.length === 0 ||
        example.title.toLowerCase().includes(q) ||
        example.slug.includes(q) ||
        example.category.includes(q) ||
        example.tags.some((tag) => tag.includes(q));
      // AND semantics: every selected tag must be present — narrows further with each pick.
      const tagsOk = selectedTags.every((tag) => example.tags.includes(tag));
      return searchOk && tagsOk;
    };

    const byCategory = new Map<string, ExampleMeta[]>();
    for (const example of exampleMeta) {
      if (!matches(example)) continue;
      const list = byCategory.get(example.category) ?? [];
      list.push(example);
      byCategory.set(example.category, list);
    }
    for (const list of byCategory.values()) list.sort((a, b) => a.title.localeCompare(b.title));

    return CATEGORIES.map((category) => ({ category, examples: byCategory.get(category) ?? [] })).filter(
      (group) => group.examples.length > 0,
    );
  }, [query, selectedTags]);

  const activeItemRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeSlug]); // only on navigation — a search keystroke shouldn't yank the scroll position

  const resultCount = groups.reduce((sum, g) => sum + g.examples.length, 0);
  const isFiltering = query.trim().length > 0 || selectedTags.length > 0;

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

          <div className="mt-2">
            <button
              type="button"
              onClick={() => setTagsExpanded((v) => !v)}
              aria-expanded={tagsExpanded}
              className="flex w-full items-center justify-between rounded-md px-1 py-1 text-xs font-medium text-neutral-500 hover:text-neutral-300">
              <span className="flex items-center gap-1.5">
                <span className={`inline-block transition-transform ${tagsExpanded ? 'rotate-90' : ''}`}>›</span>
                Tags{selectedTags.length > 0 ? ` (${selectedTags.length})` : ''}
              </span>
              {selectedTags.length > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    setTags([]);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setTags([]);
                  }}
                  className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200">
                  Clear
                </span>
              )}
            </button>

            {selectedTags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {selectedTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    title={`Remove "${tag}" filter`}
                    className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-900 hover:bg-white">
                    {tag} ×
                  </button>
                ))}
              </div>
            )}

            {tagsExpanded && (
              <div className="mt-1.5 flex max-h-40 flex-wrap gap-1 overflow-y-auto rounded-md border border-neutral-800 bg-neutral-900/50 p-2">
                {allTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      aria-pressed={isSelected}
                      className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                        isSelected
                          ? 'bg-neutral-100 font-medium text-neutral-900'
                          : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200'
                      }`}>
                      {tag}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {isFiltering && (
            <p className="mt-2 text-xs text-neutral-600">
              {resultCount} result{resultCount === 1 ? '' : 's'}
            </p>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {groups.length === 0 && (
            <p className="px-3 py-4 text-sm text-neutral-600">
              No examples match{query.trim().length > 0 ? ` "${query}"` : ''}
              {selectedTags.length > 0
                ? ` with tag${selectedTags.length === 1 ? '' : 's'} ${selectedTags.join(', ')}`
                : ''}
              .
            </p>
          )}
          {groups.map(({ category, examples }) => (
            <div key={category} className="mb-3">
              <h2 className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: categoryAccent[category] }}
                />
                {categoryLabels[category]}
              </h2>
              <ul className="space-y-0.5">
                {examples.map((example) => {
                  const isActive = example.slug === activeSlug;
                  return (
                    <li key={example.slug}>
                      <NavLink
                        ref={isActive ? activeItemRef : undefined}
                        to={`/examples/${example.slug}`}
                        className={({ isActive }) =>
                          `flex items-center gap-2 truncate rounded-md px-3 py-1.5 text-sm transition-colors ${
                            isActive
                              ? 'bg-neutral-800 text-white'
                              : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                          }`
                        }>
                        <Thumb
                          slug={example.slug}
                          accent={categoryAccent[category]}
                          className="h-4 w-6 shrink-0 rounded-sm object-cover"
                        />
                        <span className="truncate">{example.title}</span>
                      </NavLink>
                    </li>
                  );
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
  );
}
