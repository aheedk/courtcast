import { QueryClient } from '@tanstack/react-query';
import type { Sport } from '../types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

export const queryKeys = {
  me: ['me'] as const,
  nearbyCourts: (lat: number, lng: number, sport: Sport, keyword?: string) =>
    ['courts', round(lat), round(lng), sport, keyword ?? ''] as const,
  court: (placeId: string) => ['court', placeId] as const,
  savedCourts: ['savedCourts'] as const,
  lists: ['lists'] as const,
  list: (id: string) => ['lists', id] as const,
  courtReport: (placeId: string) => ['courtReport', placeId] as const,
  // Sorted-join key so two arrays with the same ids in different order
  // share the same cache entry.
  courtReportsBatch: (placeIds: string[]) =>
    ['courtReportsBatch', [...placeIds].sort().join(',')] as const,
};

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
