/**
 * Global application state using Zustand
 */

import { create } from 'zustand';

interface AppState {
  // Current site context
  currentSiteId: string | null;
  currentLotImageId: string | null;

  // UI state
  sidebarOpen: boolean;
  loading: boolean;
  error: string | null;

  // Actions
  setSite: (siteId: string, lotImageId: string) => void;
  toggleSidebar: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  currentSiteId: null,
  currentLotImageId: null,
  sidebarOpen: true,
  loading: false,
  error: null,

  // Actions
  setSite: (siteId, lotImageId) => set({ currentSiteId: siteId, currentLotImageId: lotImageId }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));
