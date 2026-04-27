import { create } from 'zustand';

interface UiState {
  selectedPlaceId: string | null;
  selectCourt: (placeId: string | null) => void;
}

export const useUi = create<UiState>((set) => ({
  selectedPlaceId: null,
  selectCourt: (placeId) => set({ selectedPlaceId: placeId }),
}));
