import { Link, NavLink } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { User } from '../types';

const navLink =
  'px-3 py-1.5 rounded-lg text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 whitespace-nowrap';
const navLinkActive = 'text-neutral-900 bg-neutral-100';

export function TopBar({ user }: { user: User | null }) {
  const qc = useQueryClient();
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      qc.clear();
      window.location.href = '/login';
    },
  });

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-neutral-200">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg shrink-0">
          <span className="inline-block w-6 h-6 rounded-md bg-good shrink-0" aria-hidden />
          <span className="hidden sm:inline">CourtClimate</span>
        </Link>
        <nav className="flex items-center gap-1 shrink-0">
          <NavLink to="/" end className={({ isActive }) => `${navLink} ${isActive ? navLinkActive : ''}`}>
            Map
          </NavLink>
          <NavLink to="/my-courts" className={({ isActive }) => `${navLink} ${isActive ? navLinkActive : ''}`}>
            My Courts
          </NavLink>
          {user ? (
            <button
              onClick={() => logout.mutate()}
              className="ml-1 flex items-center gap-2 px-1 py-1 rounded-full hover:bg-neutral-100"
              title="Sign out"
            >
              {user.avatarUrl && (
                <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
              )}
              <span className="text-sm text-neutral-600 hidden sm:inline">Sign out</span>
            </button>
          ) : (
            <NavLink
              to="/login"
              className="ml-1 inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 hover:text-white whitespace-nowrap"
            >
              Sign in
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
