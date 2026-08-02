import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import type { User } from '../types';

export function CourtChat({ placeId, user }: { placeId: string; user: User | null }) {
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const messages = useQuery({
    queryKey: queryKeys.courtMessages(placeId),
    queryFn: () => api.courtMessages(placeId),
    refetchInterval: 15_000,
  });
  const send = useMutation({
    mutationFn: () => api.sendCourtMessage(placeId, body),
    onSuccess: () => { setBody(''); qc.invalidateQueries({ queryKey: queryKeys.courtMessages(placeId) }); },
  });
  function submit(e: FormEvent) { e.preventDefault(); if (body.trim()) send.mutate(); }
  return (
    <section className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
      <div className="flex items-center justify-between"><h3 className="font-bold text-violet-950">Court group chat</h3><span className="text-[10px] uppercase tracking-wide text-violet-600">updates every 15s</span></div>
      <div className="mt-3 max-h-52 space-y-2 overflow-y-auto rounded-xl bg-white/80 p-3">
        {messages.isLoading && <p className="text-sm text-neutral-500">Loading messages…</p>}
        {!messages.isLoading && !messages.data?.messages.length && <p className="text-sm text-neutral-500">Start the conversation—ask who’s playing or share court conditions.</p>}
        {messages.data?.messages.map((message) => (
          <div key={message.id} className="text-sm">
            <div className="flex items-baseline justify-between gap-2"><span className="font-semibold text-violet-950">{message.user.name ?? 'Player'}</span><span className="text-[10px] text-neutral-400">{new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div>
            <p className="break-words text-neutral-700">{message.body}</p>
          </div>
        ))}
      </div>
      {user ? (
        <form onSubmit={submit} className="mt-2 flex gap-2"><input value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} placeholder="Message this court…" className="min-w-0 flex-1 rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm" /><button disabled={!body.trim() || send.isPending} className="rounded-xl bg-violet-700 px-3 text-sm font-semibold text-white disabled:opacity-50">Send</button></form>
      ) : <p className="mt-2 text-xs text-neutral-500"><a className="font-semibold text-violet-700 underline" href="/login">Sign in</a> to join the chat.</p>}
    </section>
  );
}
