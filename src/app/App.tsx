import { Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Layout } from './Layout'
import { exampleRoutes } from './routes'
import examples from '../examples.json'

const firstSlug = (examples as { slug: string }[])[0]?.slug

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          {firstSlug && <Route index element={<Navigate to={`/examples/${firstSlug}`} replace />} />}
          {exampleRoutes.map(({ slug, Component }) => (
            <Route
              key={slug}
              path={`/examples/${slug}`}
              element={
                <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading…</div>}>
                  <Component />
                </Suspense>
              }
            />
          ))}
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
