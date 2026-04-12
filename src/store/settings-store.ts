/**
 * settings-store.ts — Global app settings, persisted in localStorage
 * Stores the backend base URL so the app can connect to different environments.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  backendUrl: string
  setBackendUrl: (url: string) => void
  /** Returns the trimmed URL without trailing slash */
  getBase: () => string
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      backendUrl: '',
      setBackendUrl: (url) => set({ backendUrl: url }),
      getBase: () => get().backendUrl.trim().replace(/\/$/, ''),
    }),
    {
      name: 'spmm-workflow-settings',
      partialize: (s) => ({ backendUrl: s.backendUrl }),
    },
  ),
)

/** Read-only accessor — use outside React components */
export function getBackendBase(): string {
  return useSettingsStore.getState().getBase()
}
