import { create } from 'zustand';
import type { LocalPhoto, TextNote } from '../types';

interface CaptureState {
  // Current observation being captured
  siteId: string | null;
  observedAt: Date;
  licensePlate: string;
  issuingState: string;
  registrationMonth: number | null;
  registrationYear: number | null;
  parkingPositionId: string | null;

  // Evidence items for current capture
  photos: LocalPhoto[];
  notes: TextNote[];

  // Actions
  setSite: (siteId: string) => void;
  setVehicleInfo: (
    plate: string,
    state: string,
    month?: number,
    year?: number
  ) => void;
  setPosition: (positionId: string | null) => void;
  addPhoto: (uri: string, intent: string) => void;
  removePhoto: (uri: string) => void;
  addNote: (text: string, intent?: string) => void;
  removeNote: (index: number) => void;
  resetCapture: () => void;

  // Validation
  hasMinimumEvidence: () => boolean;
}

const initialState = {
  siteId: null,
  observedAt: new Date(),
  licensePlate: '',
  issuingState: '',
  registrationMonth: null,
  registrationYear: null,
  parkingPositionId: null,
  photos: [],
  notes: [],
};

export const useCaptureStore = create<CaptureState>((set, get) => ({
  ...initialState,

  setSite: (siteId) => set({ siteId }),

  setVehicleInfo: (plate, state, month, year) =>
    set({
      licensePlate: plate.toUpperCase().trim(),
      issuingState: state.toUpperCase().trim(),
      registrationMonth: month || null,
      registrationYear: year || null,
    }),

  setPosition: (positionId) => set({ parkingPositionId: positionId }),

  addPhoto: (uri, intent) =>
    set((state) => ({
      photos: [
        ...state.photos,
        {
          uri,
          intent,
          capturedAt: new Date().toISOString(),
        },
      ],
      observedAt: new Date(), // Update observed time to now
    })),

  removePhoto: (uri) =>
    set((state) => ({
      photos: state.photos.filter((photo) => photo.uri !== uri),
    })),

  addNote: (text, intent) =>
    set((state) => ({
      notes: [...state.notes, { text: text.trim(), intent }],
    })),

  removeNote: (index) =>
    set((state) => ({
      notes: state.notes.filter((_, i) => i !== index),
    })),

  resetCapture: () =>
    set({
      ...initialState,
      observedAt: new Date(),
      // Preserve siteId for convenience
      siteId: get().siteId,
    }),

  hasMinimumEvidence: () => {
    const state = get();
    return state.photos.length > 0 || state.notes.length > 0;
  },
}));
