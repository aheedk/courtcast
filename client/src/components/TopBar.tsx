import { Link, NavLink } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { User } from '../types';

const navLink =
  'px-3 py-1.5 rounded-lg text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100';
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
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="inline-block w-6 h-6 rounded-md bg-good" aria-hidden />
          CourtCast
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={({ isActive }) => `${navLink} ${isActive ? navLinkActive : ''}`}>
            Map
          </NavLink>
          <NavLink to="/my-courts" className={({ isActive }) => `${navLink} ${isActive ? navLinkActive : ''}`}>
            My Courts
          </NavLink>
          {user ? (
            <button
              onClick={() => logout.mutate()}
              className="ml-2 flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-neutral-100"
              title="Sign out"
            >
              {user.avatarUrl && (
                <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
              )}
              <span className="text-sm text-neutral-600 hidden sm:inline">Sign out</span>
            </button>
          ) : (
            <NavLink to="/login" className={`${navLink} ml-2 bg-neutral-900 text-white hover:bg-neutral-800 hover:text-white`}>
              Sign in
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
