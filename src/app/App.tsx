import { Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from './Layout';
import { exampleRoutes } from './routes';
import { metaBySlug } from './manifest';
import { ExamplePage } from './ExamplePage';
import { Home } from './Home';

export function App() {
  return (
    // BASE_URL is Vite's resolved `base` (docs/SITE.md "Deploy") — "/" locally and under a
    // custom domain, "/react-three-examples/" on GitHub Pages. react-router 7's
    // `stripBasename` treats a trailing slash and "/" itself as no-ops, so no trimming
    // needed here (verified against node_modules/react-router/dist/.../chunk-SA4DP3SF.js).
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          {exampleRoutes.map(({ slug, Component }) => {
            const meta = metaBySlug.get(slug);
            return (
              <Route
                key={slug}
                path={`/examples/${slug}`}
                element={
                  meta ? (
                    <ExamplePage meta={meta} Component={Component} />
                  ) : (
                    <div className="relative h-full w-full">
                      <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading…</div>}>
                        <Component />
                      </Suspense>
                    </div>
                  )
                }
              />
            );
          })}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
