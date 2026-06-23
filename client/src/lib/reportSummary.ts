import {
  CONDITION_LABEL,
  OPEN_COURTS_LABEL,
  type CourtReport,
} from '../types';

export function reportSummary(report: CourtReport): string {
  const parts: string[] = [];
  if (report.openCourts) parts.push(`${OPEN_COURTS_LABEL[report.openCourts]} open`);
  if (report.condition) parts.push(CONDITION_LABEL[report.condition]);
  return parts.join(' · ') || 'Status report';
}
