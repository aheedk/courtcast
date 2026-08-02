import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import type { Court, CourtFacts } from '../types';

export function CourtFactsCard({ court, canEdit }: { court: Court; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const facts = court.facts ?? {};
  if (!editing) {
    const chips = factChips(facts);
    return (
      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white/75 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Court details</h3>
          {canEdit && <button onClick={() => setEditing(true)} className="text-xs font-semibold text-emerald-700">{chips.length ? 'Edit' : 'Add details'}</button>}
        </div>
        {chips.length ? <div className="mt-2 flex flex-wrap gap-2">{chips.map((chip) => <span key={chip} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700">{chip}</span>)}</div> : <p className="mt-2 text-sm text-neutral-500">No court details have been added yet.</p>}
        {facts.hours && <p className="mt-2 text-xs text-neutral-600">Hours: {facts.hours}</p>}
        {facts.bookingUrl && <a href={facts.bookingUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Book or reserve ↗</a>}
      </section>
    );
  }
  return <CourtFactsForm court={court} onClose={() => setEditing(false)} />;
}

function CourtFactsForm({ court, onClose }: { court: Court; onClose: () => void }) {
  const qc = useQueryClient();
  const initial = court.facts ?? {};
  const [surface, setSurface] = useState(initial.surface ?? '');
  const [count, setCount] = useState(initial.courtCount?.toString() ?? '');
  const [lights, setLights] = useState(initial.hasLights === true ? 'yes' : initial.hasLights === false ? 'no' : '');
  const [access, setAccess] = useState(initial.access ?? '');
  const [hours, setHours] = useState(initial.hours ?? '');
  const [bookingUrl, setBookingUrl] = useState(initial.bookingUrl ?? '');
  const mutation = useMutation({
    mutationFn: () => api.updateCourtFacts(court.placeId, {
      surface: (surface || null) as CourtFacts['surface'],
      courtCount: count ? Number(count) : null,
      hasLights: lights ? lights === 'yes' : null,
      access: (access || null) as CourtFacts['access'],
      hours: hours || null,
      bookingUrl: bookingUrl || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.court(court.placeId) }); onClose(); },
  });
  const field = 'rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm';
  return (
    <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
      <h3 className="font-bold">Edit court details</h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <select value={surface} onChange={(e) => setSurface(e.target.value)} className={field}><option value="">Surface</option>{['hard','clay','grass','asphalt','concrete','wood','turf','other'].map((v) => <option key={v}>{v}</option>)}</select>
        <input type="number" min="1" max="50" value={count} onChange={(e) => setCount(e.target.value)} placeholder="Court count" className={field} />
        <select value={lights} onChange={(e) => setLights(e.target.value)} className={field}><option value="">Lights?</option><option value="yes">Has lights</option><option value="no">No lights</option></select>
        <select value={access} onChange={(e) => setAccess(e.target.value)} className={field}><option value="">Access</option>{['free','paid','members','reservation','unknown'].map((v) => <option key={v}>{v}</option>)}</select>
        <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Hours, e.g. 7am–10pm" className={`${field} col-span-2`} />
        <input type="url" value={bookingUrl} onChange={(e) => setBookingUrl(e.target.value)} placeholder="Booking URL" className={`${field} col-span-2`} />
      </div>
      {mutation.isError && <p className="mt-2 text-xs text-red-700">Check the values and booking URL.</p>}
      <div className="mt-3 flex gap-2"><button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Save</button><button onClick={onClose} className="px-3 py-2 text-sm">Cancel</button></div>
    </section>
  );
}

function factChips(facts: CourtFacts) {
  return [facts.surface && `${facts.surface} surface`, facts.courtCount && `${facts.courtCount} court${facts.courtCount === 1 ? '' : 's'}`, facts.hasLights === true && 'lights', facts.indoor === true && 'indoor', facts.access && `${facts.access} access`, ...(facts.amenities ?? [])].filter(Boolean) as string[];
}
