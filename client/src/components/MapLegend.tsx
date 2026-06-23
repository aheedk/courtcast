export function MapLegend() {
  return (
    <div className="absolute bottom-28 left-3 z-20 bg-white/95 backdrop-blur-xl rounded-lg shadow-lg shadow-neutral-900/10 border border-white/80 px-2.5 py-2 text-[10px] text-neutral-600 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-neutral-500" />
          unsaved
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden className="text-neutral-700 leading-none">★</span>
          saved
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-good" />
        <span className="inline-block w-2 h-2 rounded-full bg-ok" />
        <span className="inline-block w-2 h-2 rounded-full bg-bad" />
        <span className="ml-0.5">playability</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
        <span>recent status report</span>
      </div>
    </div>
  );
}
