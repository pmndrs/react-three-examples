import { Link } from 'react-router';
import { CATEGORIES, categoryAccent, categoryLabels, exampleMeta, type ExampleMeta } from './manifest';
import { repoUrl } from './agentLinks';

// Landing page at "/" (SPEC §9: "Gallery + sidebar"). Replaces the old redirect-to-
// first-example — this is a reader's first stop, so it leads with what the repo IS
// before the gallery: R3F v10 ports of the official three.js examples, WebGPU-first,
// proving the same demo reads clearer in React. No screenshots are committed
// (screenshots/ is gitignored), so cards use a category accent color instead of a
// thumbnail — see docs/SITE.md.
export function Home() {
  const byCategory = new Map<string, ExampleMeta[]>();
  for (const example of exampleMeta) {
    const list = byCategory.get(example.category) ?? [];
    list.push(example);
    byCategory.set(example.category, list);
  }
  for (const list of byCategory.values()) list.sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="h-full w-full overflow-y-auto">
      <header className="border-b border-neutral-800 px-8 py-12">
        <p className="text-xs font-semibold tracking-widest text-neutral-500 uppercase">react-three-fiber v10</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-semibold text-neutral-50">
          The official three.js examples, rebuilt in idiomatic React
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-400">
          {exampleMeta.length} WebGPU-first ports across {CATEGORIES.length} categories, showing that the same demo
          reads clearer in React Three Fiber than in vanilla three.js — same GPU, same techniques, dramatically less
          code to get there.
        </p>
        <div className="mt-5 flex items-center gap-4 text-sm">
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-neutral-700 px-3 py-1.5 font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white">
            View on GitHub ↗
          </a>
          <span className="text-neutral-600">
            Each example links back to its three.js original — this is a companion, not a fork.
          </span>
        </div>
      </header>

      <main className="space-y-10 px-8 py-10">
        {CATEGORIES.map((category) => {
          const examples = byCategory.get(category);
          if (!examples || examples.length === 0) return null;
          return (
            <section key={category}>
              <h2 className="flex items-baseline gap-2 text-sm font-semibold text-neutral-200">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: categoryAccent[category] }}
                />
                {categoryLabels[category]}
                <span className="text-xs font-normal text-neutral-600">{examples.length}</span>
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {examples.map((example) => (
                  <ExampleCard key={example.slug} example={example} />
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}

function ExampleCard({ example }: { example: ExampleMeta }) {
  const accent = categoryAccent[example.category];
  return (
    <Link
      to={`/examples/${example.slug}`}
      className="group block overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900/50 transition-colors hover:border-neutral-600 hover:bg-neutral-900">
      <div
        className="h-16 w-full opacity-70 transition-opacity group-hover:opacity-100"
        style={{ background: `linear-gradient(135deg, ${accent}55, ${accent}11)` }}
      />
      <div className="p-3">
        <h3 className="truncate text-sm font-medium text-neutral-100">{example.title}</h3>
        {example.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {example.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
