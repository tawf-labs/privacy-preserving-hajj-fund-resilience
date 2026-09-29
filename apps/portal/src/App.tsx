import { NavLink, Route, Routes } from 'react-router-dom';
import { Demo } from './pages/Demo';
import { Home } from './pages/Home';
import { Methodology } from './pages/Methodology';
import { Verify } from './pages/Verify';

const links = [
  ['/', 'Overview'],
  ['/verify', 'Verify'],
  ['/demo', 'What stays private'],
  ['/methodology', 'Methodology'],
] as const;

export function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2.5 no-underline">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-green text-gold" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l5 5 9-11" />
              </svg>
            </span>
            <span className="font-serif text-xl font-semibold text-green">Hajj Fund Proof of Resilience</span>
          </NavLink>
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Main">
            {links.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 no-underline ${isActive ? 'bg-green text-sand' : 'text-ink hover:bg-line'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/methodology" element={<Methodology />} />
        </Routes>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-muted sm:px-6">
          Research prototype by Tawf Labs. All figures shown are synthetic and are not data of BPKH or any real institution. Apache-2.0.
        </div>
      </footer>
    </div>
  );
}
