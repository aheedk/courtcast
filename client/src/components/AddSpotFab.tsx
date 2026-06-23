interface Props {
  active: boolean;
  authed: boolean;
  onActivate: () => void;
  onCancel: () => void;
}

export function AddSpotFab({ active, authed, onActivate, onCancel }: Props) {
  if (!authed) {
    return (
      <button
        onClick={() => alert('Sign in to save your own spots')}
        className="fixed bottom-32 right-4 z-30 bg-gradient-to-r from-white/95 via-emerald-50/95 to-sky-50/95 backdrop-blur-xl text-emerald-950 px-4 py-2.5 rounded-full shadow-lg shadow-emerald-950/10 text-sm font-semibold border border-emerald-100"
      >
        + Add a spot
      </button>
    );
  }

  return (
    <button
      onClick={active ? onCancel : onActivate}
      className={
        active
          ? 'fixed bottom-32 right-4 z-30 bg-bad text-white px-4 py-2.5 rounded-full shadow-lg shadow-red-900/20 text-sm font-semibold'
          : 'fixed bottom-32 right-4 z-30 bg-gradient-to-r from-emerald-700 to-sky-700 text-white px-4 py-2.5 rounded-full shadow-lg shadow-emerald-950/25 text-sm font-semibold hover:from-emerald-800 hover:to-sky-800'
      }
    >
      {active ? '✕ Cancel' : '+ Add a spot'}
    </button>
  );
}
