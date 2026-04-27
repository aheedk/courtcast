import type { PlayabilityScore } from '../types';

const styles: Record<PlayabilityScore, string> = {
  GOOD: 'bg-good text-white',
  OK:   'bg-ok text-neutral-900',
  BAD:  'bg-bad text-white',
};

const labels: Record<PlayabilityScore, string> = {
  GOOD: 'Good to play',
  OK:   'Playable',
  BAD:  'Not great',
};

export function PlayabilityBadge({ score, size = 'md' }: { score: PlayabilityScore; size?: 'sm' | 'md' | 'lg' }) {
  const sizing =
    size === 'lg' ? 'text-base px-4 py-2 rounded-xl' :
    size === 'sm' ? 'text-xs px-2 py-1 rounded-md' :
    'text-sm px-3 py-1.5 rounded-lg';
  return (
    <span className={`inline-flex items-center font-semibold ${styles[score]} ${sizing}`}>
      {labels[score]}
    </span>
  );
}
