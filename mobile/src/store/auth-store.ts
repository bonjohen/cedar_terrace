import { create } from 'zustand';
import * as storage from '../services/storage';

interface AuthState {
  userId: string | null;
  isAuthenticated: boolean;

  // Actions
  loadUser: () => Promise<void>;
  setUser: (userId: string) => Promise<void>;
  clearUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  isAuthenticated: false,

  loadUser: async () => {
    try {
      const userId = await storage.getUserId();
      set({
        userId,
        isAuthenticated: !!userId,
      });
    } catch (error) {
      console.error('Failed to load user:', error);
    }
  },

  setUser: async (userId) => {
    try {
      await storage.setUserId(userId);
      set({
        userId,
        isAuthenticated: true,
      });
    } catch (error) {
      console.error('Failed to set user:', error);
      throw error;
    }
  },

  clearUser: async () => {
    try {
      await storage.clearUserId();
      set({
        userId: null,
        isAuthenticated: false,
      });
    } catch (error) {
      console.error('Failed to clear user:', error);
      throw error;
    }
  },
}));
