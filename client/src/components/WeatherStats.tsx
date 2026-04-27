import type { WeatherSummary } from '../types';

export function WeatherStats({ weather, compact = false }: { weather: WeatherSummary; compact?: boolean }) {
  const stat = (label: string, value: string) => (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <span className={compact ? 'text-base font-semibold' : 'text-2xl font-semibold'}>{value}</span>
    </div>
  );

  return (
    <div className={`grid grid-cols-3 gap-4 ${compact ? '' : 'mt-2'}`}>
      {stat('Temp', `${weather.tempF}°F`)}
      {stat('Wind', `${weather.windMph} mph`)}
      {stat('Rain (2h)', `${weather.rainPctNext2h}%`)}
    </div>
  );
}
