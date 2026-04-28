export function MapLegend() {
  return (
    <div className="absolute bottom-6 left-4 z-20 bg-white/90 backdrop-blur rounded-xl shadow-md px-3 py-2 text-[11px] text-neutral-600 flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-neutral-500" />
          unsaved
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="text-neutral-700">★</span>
          saved
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-good" />
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-ok" />
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-bad" />
        <span className="ml-1">playability</span>
      </div>
    </div>
  );
}
