import { create } from 'zustand';
import type { QueueObservation, QueueStatus } from '../types';
import * as queueService from '../services/queue';

interface QueueState {
  // Queue items loaded from SQLite
  observations: QueueObservation[];

  // Sync status
  isSyncing: boolean;
  lastSyncTimestamp: Date | null;

  // Actions
  loadQueue: () => Promise<void>;
  addToQueue: (
    observation: Omit<QueueObservation, 'id' | 'idempotencyKey' | 'status' | 'createdAt'>,
    evidence: any[]
  ) => Promise<string>;
  updateStatus: (id: string, status: QueueStatus, errorMessage?: string) => Promise<void>;
  removeFromQueue: (id: string) => Promise<void>;
  clearSubmitted: () => Promise<number>;
  setIsSyncing: (syncing: boolean) => void;
  setSyncTimestamp: (timestamp: Date) => void;

  // Computed
  getPendingCount: () => number;
  getFailedCount: () => number;
}

export const useQueueStore = create<QueueState>((set, get) => ({
  observations: [],
  isSyncing: false,
  lastSyncTimestamp: null,

  loadQueue: async () => {
    try {
      const observations = await queueService.getQueue();
      set({ observations });
    } catch (error) {
      console.error('Failed to load queue:', error);
      throw error;
    }
  },

  addToQueue: async (observation, evidence) => {
    try {
      const id = await queueService.addToQueue(observation, evidence);

      // Reload queue to get the new observation
      await get().loadQueue();

      return id;
    } catch (error) {
      console.error('Failed to add to queue:', error);
      throw error;
    }
  },

  updateStatus: async (id, status, errorMessage) => {
    try {
      await queueService.updateStatus(id, status, errorMessage);

      // Update local state
      set((state) => ({
        observations: state.observations.map((obs) =>
          obs.id === id ? { ...obs, status, errorMessage } : obs
        ),
      }));
    } catch (error) {
      console.error('Failed to update status:', error);
      throw error;
    }
  },

  removeFromQueue: async (id) => {
    try {
      await queueService.removeFromQueue(id);

      // Update local state
      set((state) => ({
        observations: state.observations.filter((obs) => obs.id !== id),
      }));
    } catch (error) {
      console.error('Failed to remove from queue:', error);
      throw error;
    }
  },

  clearSubmitted: async () => {
    try {
      const count = await queueService.clearSubmitted();

      // Reload queue
      await get().loadQueue();

      return count;
    } catch (error) {
      console.error('Failed to clear submitted:', error);
      throw error;
    }
  },

  setIsSyncing: (syncing) => set({ isSyncing: syncing }),

  setSyncTimestamp: (timestamp) => set({ lastSyncTimestamp: timestamp }),

  getPendingCount: () => {
    const state = get();
    return state.observations.filter(
      (obs) => obs.status === 'pending' || obs.status === 'failed'
    ).length;
  },

  getFailedCount: () => {
    const state = get();
    return state.observations.filter((obs) => obs.status === 'failed').length;
  },
}));
