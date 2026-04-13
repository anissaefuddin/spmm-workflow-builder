import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type {
  WorkflowDSL,
  WorkflowStep,
  WorkflowVariable,
  FormStep,
  DecisionUserStep,
  DecisionSistemStep,
  SystemActionStep,
  EndStep,
} from '../types/workflow'

const MAX_HISTORY = 50

interface WorkflowState {
  dsl: WorkflowDSL | null
  selectedStepId: string | null
  draftId: string | null
  draftSource: 'local' | 'draft' | 'definition' | null
  activeDefinitionId: string | null

  // ── History (local only — never persisted) ──────────────
  _past: WorkflowDSL[]
  _future: WorkflowDSL[]
  canUndo: boolean
  canRedo: boolean

  // Actions
  loadDSL: (dsl: WorkflowDSL) => void
  loadDSLFromBackend: (
    dsl: WorkflowDSL,
    draftId: string,
    source?: 'draft' | 'definition',
    definitionId?: string | null,
  ) => void
  resetDSL: () => void
  setDraftId: (id: string | null) => void
  selectStep: (id: string | null) => void

  // History
  undo: () => void
  redo: () => void

  // Process-level mutations
  setProcessName: (name: string) => void
  setRoleStart: (role: string) => void

  // Role mutations
  addRole: (name: string) => void
  removeRole: (name: string) => void

  // Variable mutations
  addVariable: (name: string, defaultValue?: string) => void
  updateVariable: (name: string, patch: Partial<WorkflowVariable>) => void
  removeVariable: (name: string) => void

  // Step mutations
  addStep: (type: WorkflowStep['type']) => void
  updateStep: (id: string, patch: Partial<WorkflowStep>) => void
  removeStep: (id: string) => void
}

function makeEmptyDSL(): WorkflowDSL {
  const endStep: EndStep = {
    id: uuidv4(),
    number: 1,
    type: 'end',
    transitions: {},
  }
  const formStep: FormStep = {
    id: uuidv4(),
    number: 0,
    type: 'form',
    formFields: [],
    formData: {},
    transitions: { true: 1 },
  }
  return {
    version: '1.0',
    process: {
      id: uuidv4(),
      name: 'New Workflow',
      roles: [],
      listGrup: [],
      variables: [],
      steps: [formStep, endStep],
    },
  }
}

function nextStepNumber(dsl: WorkflowDSL): number {
  if (dsl.process.steps.length === 0) return 0
  return Math.max(...dsl.process.steps.map((s) => s.number)) + 1
}

// ── History helper ────────────────────────────────────────────
// Captures current DSL into _past, sets new DSL, clears _future.

type SetFn = (fn: (s: WorkflowState) => Partial<WorkflowState>) => void

function withHistory(set: SetFn, producer: (dsl: WorkflowDSL) => WorkflowDSL | null) {
  set((s) => {
    if (!s.dsl) return s
    const next = producer(s.dsl)
    if (!next || next === s.dsl) return s
    const past = [...s._past, s.dsl].slice(-MAX_HISTORY)
    return {
      dsl: next,
      _past: past,
      _future: [],
      canUndo: true,
      canRedo: false,
    }
  })
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  dsl: null,
  selectedStepId: null,
  draftId: null,
  draftSource: null,
  activeDefinitionId: null,
  _past: [],
  _future: [],
  canUndo: false,
  canRedo: false,

  // ── Load / Reset (resets history) ───────────────────────────

  loadDSL: (dsl) => set({
    dsl, selectedStepId: null, draftId: null, draftSource: 'local', activeDefinitionId: null,
    _past: [], _future: [], canUndo: false, canRedo: false,
  }),

  loadDSLFromBackend: (dsl, draftId, source = 'draft', definitionId = null) =>
    set({
      dsl, selectedStepId: null, draftId, draftSource: source, activeDefinitionId: definitionId,
      _past: [], _future: [], canUndo: false, canRedo: false,
    }),

  resetDSL: () => set({
    dsl: makeEmptyDSL(), selectedStepId: null, draftId: null, draftSource: 'local', activeDefinitionId: null,
    _past: [], _future: [], canUndo: false, canRedo: false,
  }),

  setDraftId: (id) => set({ draftId: id }),

  selectStep: (id) => set({ selectedStepId: id }),

  // ── Undo / Redo ─────────────────────────────────────────────

  undo: () =>
    set((s) => {
      if (s._past.length === 0 || !s.dsl) return s
      const prev = s._past[s._past.length - 1]
      return {
        dsl: prev,
        _past: s._past.slice(0, -1),
        _future: [s.dsl, ...s._future].slice(0, MAX_HISTORY),
        canUndo: s._past.length > 1,
        canRedo: true,
      }
    }),

  redo: () =>
    set((s) => {
      if (s._future.length === 0 || !s.dsl) return s
      const next = s._future[0]
      return {
        dsl: next,
        _past: [...s._past, s.dsl].slice(-MAX_HISTORY),
        _future: s._future.slice(1),
        canUndo: true,
        canRedo: s._future.length > 1,
      }
    }),

  // ── Process-level mutations (with history) ──────────────────

  setProcessName: (name) =>
    withHistory(set, (dsl) => ({ ...dsl, process: { ...dsl.process, name } })),

  setRoleStart: (role) =>
    withHistory(set, (dsl) => ({ ...dsl, process: { ...dsl.process, roleStart: role } })),

  // ── Role mutations ──────────────────────────────────────────

  addRole: (name) =>
    withHistory(set, (dsl) => {
      if (dsl.process.roles.some((r) => r.name === name)) return null
      return { ...dsl, process: { ...dsl.process, roles: [...dsl.process.roles, { name }] } }
    }),

  removeRole: (name) =>
    withHistory(set, (dsl) => ({
      ...dsl, process: { ...dsl.process, roles: dsl.process.roles.filter((r) => r.name !== name) },
    })),

  // ── Variable mutations ──────────────────────────────────────

  addVariable: (name, defaultValue = '') =>
    withHistory(set, (dsl) => {
      if (dsl.process.variables.some((v) => v.name === name)) return null
      return {
        ...dsl,
        process: {
          ...dsl.process,
          variables: [...dsl.process.variables, { name, value1: defaultValue, defaultValue, vtype: 'String' }],
        },
      }
    }),

  updateVariable: (name, patch) =>
    withHistory(set, (dsl) => ({
      ...dsl,
      process: {
        ...dsl.process,
        variables: dsl.process.variables.map((v) => v.name === name ? { ...v, ...patch } : v),
      },
    })),

  removeVariable: (name) =>
    withHistory(set, (dsl) => ({
      ...dsl,
      process: {
        ...dsl.process,
        variables: dsl.process.variables.filter((v) => v.name !== name),
      },
    })),

  // ── Step mutations ──────────────────────────────────────────

  addStep: (type) =>
    withHistory(set, (dsl) => {
      const number = nextStepNumber(dsl)
      let newStep: WorkflowStep
      if (type === 'form') {
        newStep = { id: uuidv4(), number, type: 'form', formFields: [], formData: {}, transitions: {} } satisfies FormStep
      } else if (type === 'decision_user') {
        newStep = { id: uuidv4(), number, type: 'decision_user', rule: '', viewFields: [], decisionKey: {}, transitions: {} } satisfies DecisionUserStep
      } else if (type === 'decision_sistem') {
        newStep = { id: uuidv4(), number, type: 'decision_sistem', condition: { variableA: '', operator: '>', variableB: '' }, transitions: {} } satisfies DecisionSistemStep
      } else if (type === 'system_action') {
        newStep = { id: uuidv4(), number, type: 'system_action', rawType: 'system_action', transitions: {} } satisfies SystemActionStep
      } else {
        newStep = { id: uuidv4(), number, type: 'end', transitions: {} } satisfies EndStep
      }
      return { ...dsl, process: { ...dsl.process, steps: [...dsl.process.steps, newStep] } }
    }),

  updateStep: (id, patch) =>
    withHistory(set, (dsl) => ({
      ...dsl,
      process: {
        ...dsl.process,
        steps: dsl.process.steps.map((step) => step.id === id ? ({ ...step, ...patch } as WorkflowStep) : step),
      },
    })),

  removeStep: (id) =>
    withHistory(set, (dsl) => ({
      ...dsl,
      process: { ...dsl.process, steps: dsl.process.steps.filter((step) => step.id !== id) },
    })),
}))
