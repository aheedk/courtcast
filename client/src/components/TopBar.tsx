import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { User } from '../types';
import { LogoMark } from './LogoMark';

const navLink =
  'px-2.5 sm:px-3 py-1.5 rounded-full text-sm font-semibold text-neutral-600 hover:text-emerald-950 hover:bg-white/70 whitespace-nowrap';
const navLinkActive = 'text-emerald-950 bg-white/85 shadow-sm ring-1 ring-emerald-100';

export function TopBar({ user }: { user: User | null }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const fallbackInitial = (user?.name?.trim()[0] ?? user?.email[0] ?? 'Y').toUpperCase();

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-r from-emerald-50/95 via-amber-50/95 to-sky-50/95 backdrop-blur-xl border-b border-emerald-100/80">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-3 shrink-0 min-w-0">
          <LogoMark className="h-9 w-9 shrink-0" />
          <span className="hidden sm:block min-w-0 leading-tight">
            <span className="block text-lg font-extrabold tracking-normal text-emerald-950 truncate">
              CourtClimate
            </span>
            <span className="hidden sm:block text-[11px] font-semibold text-emerald-700">
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
              {user.avatarUrl && !avatarFailed ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  onError={() => setAvatarFailed(true)}
                  className="w-8 h-8 rounded-full ring-2 ring-white shadow-sm"
                />
              ) : (
                <span className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-700 to-sky-700 text-white ring-2 ring-white shadow-sm inline-flex items-center justify-center text-xs font-bold">
                  {fallbackInitial}
                </span>
              )}
              <span className="text-sm font-medium text-emerald-900 hidden sm:inline">
                {user.name?.split(' ')[0] ?? 'You'}
              </span>
            </NavLink>
          ) : (
            <NavLink
              to="/login"
              className="ml-1 inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold bg-emerald-950 text-white hover:bg-emerald-900 hover:text-white whitespace-nowrap shadow-sm shadow-emerald-950/20"
            >
              Sign in
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
