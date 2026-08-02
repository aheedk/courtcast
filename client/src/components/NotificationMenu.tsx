import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';

export function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const inbox = useQuery({ queryKey: queryKeys.notifications, queryFn: api.notifications, refetchInterval: 60_000 });
  const preferences = useQuery({ queryKey: queryKeys.notificationPreferences, queryFn: api.notificationPreferences });
  const readAll = useMutation({ mutationFn: api.readAllNotifications, onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }) });
  useEffect(() => {
    const latest = inbox.data?.notifications.find((item) => !item.readAt);
    if (!latest || !preferences.data?.preferences.browserAlerts || !('Notification' in window) || Notification.permission !== 'granted') return;
    const key = 'courtclimate:last-browser-notification';
    if (localStorage.getItem(key) === latest.id) return;
    new Notification(latest.title, { body: latest.body, tag: latest.id });
    localStorage.setItem(key, latest.id);
  }, [inbox.data, preferences.data]);
  return (
    <div className="relative">
      <button onClick={() => setOpen((value) => !value)} className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/80" aria-label="Notifications">🔔{inbox.data?.unreadCount ? <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">{inbox.data.unreadCount}</span> : null}</button>
      {open && <div className="fixed left-3 right-3 top-16 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-emerald-100 bg-white p-3 shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-96">
        <div className="flex items-center justify-between px-1"><h3 className="font-bold">Notifications</h3>{inbox.data?.unreadCount ? <button onClick={() => readAll.mutate()} className="text-xs font-semibold text-emerald-700">Mark all read</button> : null}</div>
        <div className="mt-2 space-y-1">{inbox.data?.notifications.length ? inbox.data.notifications.map((item) => <button key={item.id} onClick={async () => { if (!item.readAt) await api.readNotification(item.id); qc.invalidateQueries({ queryKey: queryKeys.notifications }); setOpen(false); if (item.placeId) window.location.href = `/?court=${encodeURIComponent(item.placeId)}`; }} className={`w-full rounded-xl p-3 text-left ${item.readAt ? 'bg-white' : 'bg-emerald-50'}`}><span className="block text-sm font-bold">{item.title}</span><span className="block text-xs text-neutral-600">{item.body}</span><span className="mt-1 block text-[10px] text-neutral-400">{new Date(item.createdAt).toLocaleString()}</span></button>) : <p className="p-4 text-center text-sm text-neutral-500">You’re all caught up.</p>}</div>
      </div>}
    </div>
  );
}
