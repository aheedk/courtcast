import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { env } from '../lib/env';
import type { User } from '../types';

declare global {
  interface Window {
    google?: typeof google;
  }
}

export function LoginPage({ user }: { user: User | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const buttonRef = useRef<HTMLDivElement>(null);

  const login = useMutation({
    mutationFn: (idToken: string) => api.loginWithGoogle(idToken),
    onSuccess: (res) => {
      qc.setQueryData(queryKeys.me, { user: res.user });
      navigate('/my-courts', { replace: true });
    },
  });

  useEffect(() => {
    if (user) navigate('/my-courts', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (!env.googleOauthClientId) return;

    let cancelled = false;
    const tryRender = () => {
      const g = window.google?.accounts?.id;
      if (!g) return false;
      g.initialize({
        client_id: env.googleOauthClientId,
        callback: (resp: google.accounts.id.CredentialResponse) => {
          if (resp.credential) login.mutate(resp.credential);
        },
      });
      if (buttonRef.current) {
        g.renderButton(buttonRef.current, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', width: 280 });
      }
      return true;
    };

    if (tryRender()) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => { if (!cancelled) tryRender(); };
    document.head.appendChild(script);
    return () => { cancelled = true; };
  }, [login]);

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-2xl p-8 text-center shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-good mx-auto mb-4" aria-hidden />
        <h1 className="text-xl font-bold mb-1">Welcome to CourtClimate</h1>
        <p className="text-sm text-neutral-500 mb-6">
          Sign in to save your favorite tennis courts and see live playability for each one.
        </p>

        {!env.googleOauthClientId ? (
          <p className="text-sm text-bad">
            Missing <code>VITE_GOOGLE_OAUTH_CLIENT_ID</code>. See <code>SETUP.md</code>.
          </p>
        ) : (
          <div className="flex justify-center" ref={buttonRef} />
        )}

        {login.isError && (
          <p className="mt-4 text-sm text-bad">Sign-in failed. Please try again.</p>
        )}
      </div>
    </div>
  );
}
