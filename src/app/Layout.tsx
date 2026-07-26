import { NavLink, Outlet } from 'react-router'
import { exampleMeta as exampleList } from './manifest'

export function Layout() {
  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100">
      <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-800">
        <div className="border-b border-neutral-800 p-4">
          <h1 className="text-sm font-semibold tracking-wide text-neutral-200">r3f-examples</h1>
          <input
            type="search"
            placeholder="Search examples… (soon)"
            disabled
            className="mt-3 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-400 placeholder:text-neutral-600 outline-none disabled:cursor-not-allowed"
          />
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-0.5">
            {exampleList.map((example) => (
              <li key={example.slug}>
                <NavLink
                  to={`/examples/${example.slug}`}
                  className={({ isActive }) =>
                    `block rounded-md px-3 py-1.5 text-sm transition-colors ${
                      isActive
                        ? 'bg-neutral-800 text-white'
                        : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                    }`
                  }
                >
                  {example.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
