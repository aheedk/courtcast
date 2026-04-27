import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { User } from '../types';

export function AuthGate({ user, children }: { user: User | null; children: ReactNode }) {
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
