import { create } from 'zustand';
import type { RecipientAccount } from '@cedar-terrace/shared';

interface AuthState {
  // Authentication state
  recipientAccountId: string | null;
  qrToken: string | null;
  email: string | null;

  // Status flags
  isEmailVerified: boolean;
  isProfileComplete: boolean;

  // UI state
  loading: boolean;
  error: string | null;

  // Actions
  setAccount: (account: RecipientAccount, qrToken: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// LocalStorage keys
const STORAGE_KEYS = {
  ACCOUNT_ID: 'recipientAccountId',
  QR_TOKEN: 'qrToken',
  EMAIL: 'recipientEmail',
};

// Load initial state from localStorage
const loadFromStorage = (): Partial<AuthState> => {
  try {
    const accountId = localStorage.getItem(STORAGE_KEYS.ACCOUNT_ID);
    const qrToken = localStorage.getItem(STORAGE_KEYS.QR_TOKEN);
    const email = localStorage.getItem(STORAGE_KEYS.EMAIL);

    return {
      recipientAccountId: accountId,
      qrToken,
      email,
      // Status flags will be set when account is loaded
      isEmailVerified: false,
      isProfileComplete: false,
    };
  } catch {
    return {};
  }
};

export const useAuthStore = create<AuthState>((set) => ({
  // Initial state from localStorage
  ...loadFromStorage(),
  recipientAccountId: loadFromStorage().recipientAccountId || null,
  qrToken: loadFromStorage().qrToken || null,
  email: loadFromStorage().email || null,
  isEmailVerified: false,
  isProfileComplete: false,
  loading: false,
  error: null,

  // Actions
  setAccount: (account: RecipientAccount, qrToken: string) => {
    // Persist to localStorage
    try {
      localStorage.setItem(STORAGE_KEYS.ACCOUNT_ID, account.id);
      localStorage.setItem(STORAGE_KEYS.QR_TOKEN, qrToken);
      localStorage.setItem(STORAGE_KEYS.EMAIL, account.email);
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }

    // Update state
    set({
      recipientAccountId: account.id,
      qrToken,
      email: account.email,
      isEmailVerified: !!account.emailVerifiedAt,
      isProfileComplete: !!account.profileCompletedAt,
      error: null,
    });
  },

  clearAuth: () => {
    // Clear localStorage
    try {
      localStorage.removeItem(STORAGE_KEYS.ACCOUNT_ID);
      localStorage.removeItem(STORAGE_KEYS.QR_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.EMAIL);
    } catch (e) {
      console.error('Failed to clear localStorage:', e);
    }

    // Reset state
    set({
      recipientAccountId: null,
      qrToken: null,
      email: null,
      isEmailVerified: false,
      isProfileComplete: false,
      error: null,
    });
  },

  setLoading: (loading: boolean) => set({ loading }),

  setError: (error: string | null) => set({ error }),
}));
