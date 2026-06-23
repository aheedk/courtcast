import { Link, NavLink } from 'react-router-dom';
import type { User } from '../types';
import { LogoMark } from './LogoMark';

const navLink =
  'px-3 py-1.5 rounded-full text-sm font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 whitespace-nowrap';
const navLinkActive = 'text-neutral-950 bg-neutral-100 shadow-sm';

export function TopBar({ user }: { user: User | null }) {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-neutral-200/80">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-3 shrink-0 min-w-0">
          <LogoMark className="h-9 w-9 shrink-0" />
          <span className="min-w-0 leading-tight">
            <span className="block text-lg font-extrabold tracking-normal text-neutral-950 truncate">
              CourtClimate
            </span>
            <span className="hidden sm:block text-[11px] font-semibold text-neutral-500">
              Court weather
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-1.5 shrink-0">
          <NavLink to="/" end className={({ isActive }) => `${navLink} ${isActive ? navLinkActive : ''}`}>
            Map
          </NavLink>
          <NavLink to="/my-courts" className={({ isActive }) => `${navLink} ${isActive ? navLinkActive : ''}`}>
            My Courts
          </NavLink>
          {user ? (
            <NavLink
              to="/settings"
              className="ml-1 flex items-center gap-2 px-1 py-1 rounded-full hover:bg-neutral-100"
              title="Settings"
            >
              {user.avatarUrl && (
                <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full ring-1 ring-neutral-200" />
              )}
              <span className="text-sm font-medium text-neutral-600 hidden sm:inline">
                {user.name?.split(' ')[0] ?? 'You'}
              </span>
            </NavLink>
          ) : (
            <NavLink
              to="/login"
              className="ml-1 inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold bg-neutral-950 text-white hover:bg-neutral-800 hover:text-white whitespace-nowrap shadow-sm"
            >
              Sign in
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
