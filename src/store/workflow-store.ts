import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type {
  WorkflowDSL,
  WorkflowStep,
  WorkflowVariable,
  WorkflowRole,
  FormStep,
  DecisionUserStep,
  DecisionSistemStep,
  SystemActionStep,
  EndStep,
} from '../types/workflow'

interface WorkflowState {
  dsl: WorkflowDSL | null
  selectedStepId: string | null
  /** Backend draft ID — set when this DSL was loaded from / saved to the backend */
  draftId: string | null
  /** Source type: 'local' | 'draft' | 'definition' */
  draftSource: 'local' | 'draft' | 'definition' | null
  /**
   * The wf_process_definition ID that corresponds to this workflow.
   * Used to filter monitoring tickets by workflow.
   * - definition source: equals the definition id
   * - draft source: equals publishedDefinitionId (if published)
   * - local / unpublished: null
   */
  activeDefinitionId: string | null

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

export const useWorkflowStore = create<WorkflowState>((set) => ({
  dsl: null,
  selectedStepId: null,
  draftId: null,
  draftSource: null,
  activeDefinitionId: null,

  loadDSL: (dsl) => set({
    dsl, selectedStepId: null, draftId: null, draftSource: 'local', activeDefinitionId: null,
  }),

  loadDSLFromBackend: (dsl, draftId, source = 'draft', definitionId = null) =>
    set({ dsl, selectedStepId: null, draftId, draftSource: source, activeDefinitionId: definitionId }),

  resetDSL: () => set({
    dsl: makeEmptyDSL(), selectedStepId: null, draftId: null, draftSource: 'local', activeDefinitionId: null,
  }),

  setDraftId: (id) => set({ draftId: id }),

  selectStep: (id) => set({ selectedStepId: id }),

  setProcessName: (name) =>
    set((s) => s.dsl ? { dsl: { ...s.dsl, process: { ...s.dsl.process, name } } } : s),

  setRoleStart: (role) =>
    set((s) => s.dsl ? { dsl: { ...s.dsl, process: { ...s.dsl.process, roleStart: role } } } : s),

  addRole: (name) =>
    set((s) => {
      if (!s.dsl) return s
      if (s.dsl.process.roles.some((r) => r.name === name)) return s
      return { dsl: { ...s.dsl, process: { ...s.dsl.process, roles: [...s.dsl.process.roles, { name }] } } }
    }),

  removeRole: (name) =>
    set((s) => {
      if (!s.dsl) return s
      return { dsl: { ...s.dsl, process: { ...s.dsl.process, roles: s.dsl.process.roles.filter((r) => r.name !== name) } } }
    }),

  addVariable: (name, defaultValue = '') =>
    set((s) => {
      if (!s.dsl) return s
      if (s.dsl.process.variables.some((v) => v.name === name)) return s
      return {
        dsl: {
          ...s.dsl,
          process: {
            ...s.dsl.process,
            variables: [...s.dsl.process.variables, { name, value1: defaultValue, defaultValue, vtype: 'String' }],
          },
        },
      }
    }),

  updateVariable: (name, patch) =>
    set((s) => {
      if (!s.dsl) return s
      return {
        dsl: {
          ...s.dsl,
          process: {
            ...s.dsl.process,
            variables: s.dsl.process.variables.map((v) => v.name === name ? { ...v, ...patch } : v),
          },
        },
      }
    }),

  removeVariable: (name) =>
    set((s) => {
      if (!s.dsl) return s
      return {
        dsl: {
          ...s.dsl,
          process: {
            ...s.dsl.process,
            variables: s.dsl.process.variables.filter((v) => v.name !== name),
          },
        },
      }
    }),

  addStep: (type) =>
    set((s) => {
      if (!s.dsl) return s
      const number = nextStepNumber(s.dsl)
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
      return { dsl: { ...s.dsl, process: { ...s.dsl.process, steps: [...s.dsl.process.steps, newStep] } } }
    }),

  updateStep: (id, patch) =>
    set((s) => {
      if (!s.dsl) return s
      return {
        dsl: {
          ...s.dsl,
          process: {
            ...s.dsl.process,
            steps: s.dsl.process.steps.map((step) => step.id === id ? ({ ...step, ...patch } as WorkflowStep) : step),
          },
        },
      }
    }),

  removeStep: (id) =>
    set((s) => {
      if (!s.dsl) return s
      return {
        dsl: {
          ...s.dsl,
          process: { ...s.dsl.process, steps: s.dsl.process.steps.filter((step) => step.id !== id) },
        },
      }
    }),
}))
