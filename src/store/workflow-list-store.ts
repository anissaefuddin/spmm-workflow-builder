/**
 * workflow-list-store.ts
 * Manages the lists of builder drafts and live process definitions
 * fetched from the backend. Independent of the active builder DSL.
 */
import { create } from 'zustand'
import { listDrafts, listDefinitions, getMonitorSummary } from '../services/api'
import { useSettingsStore } from './settings-store'
import type { DraftListItem, DefinitionListItem, MonitorSummary } from '../types/workflow-list'

interface WorkflowListState {
  // ── Builder drafts ──────────────────────────────────────
  drafts: DraftListItem[]
  draftsLoading: boolean
  draftsError: string | null

  // ── Live process definitions ────────────────────────────
  definitions: DefinitionListItem[]
  definitionsLoading: boolean
  definitionsError: string | null

  // ── Monitor summary ─────────────────────────────────────
  monitorSummary: MonitorSummary | null
  monitorLoading: boolean
  monitorError: string | null

  // ── Actions ──────────────────────────────────────────────
  fetchDrafts: () => Promise<void>
  fetchDefinitions: () => Promise<void>
  fetchMonitorSummary: () => Promise<void>
  /** Fetch all three in parallel */
  fetchAll: () => Promise<void>
  /** Remove a draft from local state (e.g. after the user loads it) */
  invalidate: () => void
}

export const useWorkflowListStore = create<WorkflowListState>((set, get) => ({
  drafts:             [],
  draftsLoading:      false,
  draftsError:        null,

  definitions:        [],
  definitionsLoading: false,
  definitionsError:   null,

  monitorSummary:     null,
  monitorLoading:     false,
  monitorError:       null,

  fetchDrafts: async () => {
    if (!useSettingsStore.getState().getBase()) {
      set({ draftsError: null, drafts: [] })
      return
    }
    set({ draftsLoading: true, draftsError: null })
    const res = await listDrafts()
    if (res.ok) set({ drafts: res.data, draftsLoading: false })
    else        set({ draftsError: res.error, draftsLoading: false })
  },

  fetchDefinitions: async () => {
    if (!useSettingsStore.getState().getBase()) {
      set({ definitionsError: null, definitions: [] })
      return
    }
    set({ definitionsLoading: true, definitionsError: null })
    const res = await listDefinitions()
    if (res.ok) set({ definitions: res.data, definitionsLoading: false })
    else        set({ definitionsError: res.error, definitionsLoading: false })
  },

  fetchMonitorSummary: async () => {
    if (!useSettingsStore.getState().getBase()) {
      set({ monitorSummary: null, monitorError: null })
      return
    }
    set({ monitorLoading: true, monitorError: null })
    const res = await getMonitorSummary()
    if (res.ok) set({ monitorSummary: res.data, monitorLoading: false })
    else        set({ monitorError: res.error, monitorLoading: false })
  },

  fetchAll: async () => {
    await Promise.all([
      get().fetchDrafts(),
      get().fetchDefinitions(),
      get().fetchMonitorSummary(),
    ])
  },

  invalidate: () => set({ drafts: [], definitions: [], monitorSummary: null }),
}))
