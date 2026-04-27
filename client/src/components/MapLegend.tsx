export function MapLegend() {
  return (
    <div className="absolute bottom-6 left-4 z-20 bg-white/90 backdrop-blur rounded-xl shadow-md px-3 py-2 text-[11px] text-neutral-600 flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-neutral-900" />
        Places
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-white border-2 border-good" />
        Yours
      </div>
    </div>
  );
}
