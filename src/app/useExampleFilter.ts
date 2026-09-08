import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { exampleMeta, type ExampleMeta } from './manifest';

// `?q=` (free-text) and `?tag=` (comma-separated, alphabetically-sorted tag list) together
// describe the ONE filter state the sidebar search box and the home gallery both read —
// lifted here so neither duplicates the other's matching logic and a filtered view is
// still a single copy-pasteable URL (AGENTS.md R4 brief, extended from tags to search).
function parseTagParam(searchParams: URLSearchParams): string[] {
  const raw = searchParams.get('tag');
  return raw ? raw.split(',').filter(Boolean) : [];
}

export function useExampleFilter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const selectedTags = useMemo(() => parseTagParam(searchParams), [searchParams]);

  function setQuery(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next.length > 0) params.set('q', next);
    else params.delete('q');
    setSearchParams(params, { replace: true });
  }

  function setTags(next: string[]) {
    const params = new URLSearchParams(searchParams);
    if (next.length > 0) params.set('tag', [...next].sort().join(','));
    else params.delete('tag');
    setSearchParams(params, { replace: true });
  }

  function toggleTag(tag: string) {
    setTags(selectedTags.includes(tag) ? selectedTags.filter((t) => t !== tag) : [...selectedTags, tag]);
  }

  // AND semantics on tags — narrows further with each pick; plain substring OR across
  // title/slug/category/tags for the free-text query.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (example: ExampleMeta) => {
      const searchOk =
        q.length === 0 ||
        example.title.toLowerCase().includes(q) ||
        example.slug.includes(q) ||
        example.category.includes(q) ||
        example.tags.some((tag) => tag.includes(q));
      const tagsOk = selectedTags.every((tag) => example.tags.includes(tag));
      return searchOk && tagsOk;
    };
  }, [query, selectedTags]);

  const filtered = useMemo(() => exampleMeta.filter(matches), [matches]);
  const isFiltering = query.trim().length > 0 || selectedTags.length > 0;

  return { query, setQuery, selectedTags, setTags, toggleTag, matches, filtered, isFiltering };
}
