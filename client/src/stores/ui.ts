import { create } from 'zustand';

interface UiState {
  selectedPlaceId: string | null;
  /** One-shot flag: when the panel opens for this placeId, the
   *  ReportStatusForm starts already expanded. Cleared automatically once
   *  the form reads it. Used so the card menu's "Report status" option
   *  can short-circuit the extra tap inside the panel. */
  autoOpenReportForId: string | null;
  selectCourt: (placeId: string | null) => void;
  selectCourtAndReport: (placeId: string) => void;
  consumeAutoOpenReport: () => void;
}

export const useUi = create<UiState>((set) => ({
  selectedPlaceId: null,
  autoOpenReportForId: null,
  selectCourt: (placeId) => set({ selectedPlaceId: placeId, autoOpenReportForId: null }),
  selectCourtAndReport: (placeId) =>
    set({ selectedPlaceId: placeId, autoOpenReportForId: placeId }),
  consumeAutoOpenReport: () => set({ autoOpenReportForId: null }),
}));
