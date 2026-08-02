import type { Court, CourtReport, Forecast, ForecastSlot, PlayabilityScore } from '../types';
import type { Thresholds } from './playability';
import { scoreFromThresholds } from './playability';

const HOUR = 3600_000;

export interface SafetyNotice {
  level: 'warning' | 'danger';
  label: string;
}

export interface PlayWindow {
  startAt: number;
  endAt: number;
  score: PlayabilityScore;
  avgTempF: number;
  maxRainPct: number;
  maxWindMph: number;
  safety: SafetyNotice[];
}

export interface DryingEstimate {
  dryAt: number | null;
  confidence: 'low' | 'medium' | 'high';
  summary: string;
}

export function safetyForSlot(slot: ForecastSlot): SafetyNotice[] {
  const notices: SafetyNotice[] = [];
  const feels = slot.apparentTempF ?? slot.tempF;
  if (feels >= 105) notices.push({ level: 'danger', label: `Dangerous heat (${feels}°F feels like)` });
  else if (feels >= 95) notices.push({ level: 'warning', label: `Heat caution (${feels}°F feels like)` });
  if ((slot.windGustMph ?? slot.windMph) >= 35) notices.push({ level: 'danger', label: `Strong gusts (${slot.windGustMph ?? slot.windMph} mph)` });
  else if ((slot.windGustMph ?? 0) >= 25) notices.push({ level: 'warning', label: `Gusty (${slot.windGustMph} mph)` });
  if ((slot.uvIndex ?? 0) >= 8) notices.push({ level: 'danger', label: `Very high UV (${slot.uvIndex})` });
  else if ((slot.uvIndex ?? 0) >= 6) notices.push({ level: 'warning', label: `High UV (${slot.uvIndex})` });
  return notices;
}

export function scoreSlot(slot: ForecastSlot, thresholds: Thresholds): PlayabilityScore {
  const notices = safetyForSlot(slot);
  if (notices.some((notice) => notice.level === 'danger' && /heat|gust/i.test(notice.label))) return 'BAD';
  return scoreFromThresholds({
    tempF: slot.tempF,
    windMph: slot.windMph,
    rainPctNext2h: slot.rainPct,
    apparentTempF: slot.apparentTempF,
    humidityPct: slot.humidityPct,
    windGustMph: slot.windGustMph,
    uvIndex: slot.uvIndex,
  }, thresholds);
}

/** Returns the strongest two-hour-or-longer forecast windows, ranked GOOD before OK. */
export function bestPlayWindows(
  forecast: Forecast | null | undefined,
  thresholds: Thresholds,
  limit = 5,
): PlayWindow[] {
  if (!forecast?.slots.length) return [];
  const now = Date.now() - HOUR;
  const candidates: PlayWindow[] = [];

  for (let i = 0; i < forecast.slots.length - 1; i++) {
    const pair = forecast.slots.slice(i, i + 2);
    if (pair[0].ts < now || pair[1].ts - pair[0].ts > 1.5 * HOUR) continue;
    if (!pair.every(isDaylightSlot)) continue;
    const scores = pair.map((slot) => scoreSlot(slot, thresholds));
    if (scores.includes('BAD')) continue;
    const safety = pair.flatMap(safetyForSlot);
    candidates.push({
      startAt: pair[0].ts,
      endAt: pair[1].ts + HOUR,
      score: scores.every((value) => value === 'GOOD') ? 'GOOD' : 'OK',
      avgTempF: Math.round(pair.reduce((sum, slot) => sum + slot.tempF, 0) / pair.length),
      maxRainPct: Math.max(...pair.map((slot) => slot.rainPct)),
      maxWindMph: Math.max(...pair.map((slot) => slot.windMph)),
      safety,
    });
  }

  return candidates
    .sort((a, b) => {
      const qualityA = a.score === 'GOOD' ? 0 : 100;
      const qualityB = b.score === 'GOOD' ? 0 : 100;
      const penaltyA = qualityA + a.maxRainPct + a.maxWindMph * 1.5 + a.safety.length * 20;
      const penaltyB = qualityB + b.maxRainPct + b.maxWindMph * 1.5 + b.safety.length * 20;
      return penaltyA - penaltyB || a.startAt - b.startAt;
    })
    // Avoid a list full of overlapping versions of the same window.
    .filter((window, index, all) => all.findIndex((other) => Math.abs(other.startAt - window.startAt) < 4 * HOUR) === index)
    .slice(0, limit);
}

function isDaylightSlot(slot: ForecastSlot): boolean {
  if (slot.solarRadiationWm2 !== undefined) return slot.solarRadiationWm2 >= 20;
  const hour = new Date(slot.ts).getHours();
  return hour >= 7 && hour < 20;
}

/**
 * Conservative surface-drying estimate. This is intentionally presented as
 * an estimate: court material, shade, drainage, and puddling are unknown.
 */
export function estimateDrying(
  forecast: Forecast | null | undefined,
  report: CourtReport | null | undefined,
): DryingEstimate | null {
  if (!forecast?.slots.length || !report || report.condition === 'dry' || !report.condition) return null;
  let remaining = report.condition === 'unplayable' ? 7 : 3.5;
  const start = Math.max(Date.now(), new Date(report.createdAt).getTime());
  let observedRichData = 0;
  for (const slot of forecast.slots) {
    if (slot.ts < start - HOUR) continue;
    if (slot.precipitationIn && slot.precipitationIn > 0.01) remaining += Math.min(5, slot.precipitationIn * 25);
    if (slot.rainPct >= 65) remaining += 0.5;
    const sun = (slot.solarRadiationWm2 ?? 0) / 500;
    const warmth = Math.max(0.15, (slot.tempF - 38) / 45);
    const breeze = Math.min(1.2, slot.windMph / 12);
    const dryness = slot.humidityPct === undefined ? 0.45 : Math.max(0.1, (100 - slot.humidityPct) / 55);
    remaining -= Math.max(0.1, warmth * 0.45 + breeze * 0.35 + dryness * 0.35 + sun * 0.65);
    if (slot.humidityPct !== undefined && slot.solarRadiationWm2 !== undefined) observedRichData += 1;
    if (remaining <= 0) {
      const confidence = observedRichData >= 3 ? 'medium' : 'low';
      return { dryAt: slot.ts + HOUR, confidence, summary: `Estimated dry around ${formatShortTime(slot.ts + HOUR)}` };
    }
  }
  return { dryAt: null, confidence: 'low', summary: 'No reliable drying window in the forecast' };
}

export function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function rankPlayableCourts(courts: Court[], origin: { lat: number; lng: number }, thresholds: Thresholds) {
  return courts.map((court) => {
    const threeDayForecast = court.forecast ? {
      ...court.forecast,
      slots: court.forecast.slots.filter((slot) => slot.ts < Date.now() + 72 * HOUR),
    } : null;
    const next = bestPlayWindows(threeDayForecast, thresholds, 1)[0] ?? null;
    const distance = distanceMiles(origin, court);
    const score = next?.score ?? court.score ?? null;
    const rank = (score === 'GOOD' ? 0 : score === 'OK' ? 80 : 180) + distance * 8 + (next ? Math.max(0, next.startAt - Date.now()) / HOUR : 48);
    return { court, distance, next, score, rank };
  }).sort((a, b) => a.rank - b.rank);
}

function formatShortTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
