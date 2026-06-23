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
        className="fixed bottom-32 right-4 z-30 bg-white/95 backdrop-blur-xl text-neutral-500 px-4 py-2.5 rounded-full shadow-lg shadow-neutral-900/10 text-sm font-semibold border border-neutral-200"
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
          : 'fixed bottom-32 right-4 z-30 bg-neutral-950 text-white px-4 py-2.5 rounded-full shadow-lg shadow-neutral-900/20 text-sm font-semibold hover:bg-neutral-800'
      }
    >
      {active ? '✕ Cancel' : '+ Add a spot'}
    </button>
  );
}
