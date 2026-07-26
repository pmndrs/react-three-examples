import { Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Layout } from './Layout'
import { exampleRoutes } from './routes'
import { exampleMeta, metaBySlug } from './manifest'
import { Titleblock } from './Titleblock'

const firstSlug = exampleMeta[0]?.slug

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          {firstSlug && <Route index element={<Navigate to={`/examples/${firstSlug}`} replace />} />}
          {exampleRoutes.map(({ slug, Component }) => {
            const meta = metaBySlug.get(slug)
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
            )
          })}
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
