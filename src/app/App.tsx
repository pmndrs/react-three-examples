import { Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from './Layout';
import { exampleRoutes } from './routes';
import { metaBySlug } from './manifest';
import { Titleblock } from './Titleblock';
import { Home } from './Home';

export function App() {
  return (
    <BrowserRouter>
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
                  <div className="relative h-full w-full">
                    <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading…</div>}>
                      <Component />
                    </Suspense>
                    {meta && <Titleblock meta={meta} />}
                  </div>
                }
              />
            );
          })}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
