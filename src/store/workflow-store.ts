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
import { detectParallelBlocks } from '../lib/parallel-block-detector'

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
  setActiveDefinitionId: (id: string | null) => void
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

  // Parallel-block actions
  /**
   * Copy authoring content (title, form_data, meta) from one branch of a
   * detected parallel block to the other, with actor-index substitution
   * (Asesor 1 ↔ Asesor 2, _asesor1 ↔ _asesor2, spelling-tolerant).
   * Transitions, step numbers, and ids are left untouched — only content
   * that is expected to mirror is copied.
   */
  syncParallelBranch: (
    blockId: string,
    fromBranchIndex: number,
    toBranchIndex: number,
  ) => { copiedSteps: number } | null

  /**
   * Persist the currently detected parallel blocks into the DSL as an
   * annotation — emitted to XML as a comment on save, so next-session
   * opens the file with the same groupings pre-confirmed.
   */
  commitParallelBlockAnnotations: () => { count: number }

  /**
   * Clear any persisted parallel-block annotations from the DSL.
   * Detector will still auto-detect on next load.
   */
  clearParallelBlockAnnotations: () => void
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

// ── Actor substitution ────────────────────────────────────────
// Replace "Asesor <fromIdx+1>" with "Asesor <toIdx+1>" in both free-text
// (titles) and identifier tokens (field names, form_data keys/values).
// Tolerant to Indonesian spelling variants used inconsistently across
// this codebase: asesor, asessor, assessor (case-insensitive).

function substituteActor(text: string, fromIdx: number, toIdx: number): string {
  if (!text) return text
  const fromN = String(fromIdx + 1)
  const toN = String(toIdx + 1)
  // Matches: "asesor 1", "Asessor_1", "praasesor1" — any spelling, any separator.
  // Preserves the prefix/separator so casing and underscores stay intact.
  const pattern = /(ass?ess?or[\s_]*)([12])/gi
  return text.replace(pattern, (match, prefix: string, num: string) => {
    if (num === fromN) return `${prefix}${toN}`
    if (num === toN) return match       // don't touch the target's own refs
    return match
  })
}

function substituteRecord(
  obj: Record<string, string> | undefined,
  fromIdx: number,
  toIdx: number,
): Record<string, string> | undefined {
  if (!obj) return obj
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    next[substituteActor(k, fromIdx, toIdx)] = substituteActor(v, fromIdx, toIdx)
  }
  return next
}

function substituteFields(fields: string[] | undefined, fromIdx: number, toIdx: number) {
  if (!fields) return fields
  return fields.map((f) => substituteActor(f, fromIdx, toIdx))
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

  setActiveDefinitionId: (id) => set({ activeDefinitionId: id }),

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
        steps: dsl.process.steps.map((step) => {
          if (step.id !== id) return step
          // Invalidate cached raw JSON when its parsed counterpart is edited,
          // otherwise the generator emits the stale import-time JSON and silently
          // drops UI-added fields (e.g. a new variable added to form_data_input).
          const next = { ...step, ...patch } as Record<string, unknown>
          if ('formDataInput' in patch) next._rawFormDataInput = undefined
          if ('formDataView'  in patch) next._rawFormDataView  = undefined
          if ('formData'      in patch) next._rawFormData      = undefined
          if ('decisionKey'   in patch) next._rawDecisionKey   = undefined
          return next as unknown as WorkflowStep
        }),
      },
    })),

  removeStep: (id) =>
    withHistory(set, (dsl) => ({
      ...dsl,
      process: { ...dsl.process, steps: dsl.process.steps.filter((step) => step.id !== id) },
    })),

  // ── Parallel-block: sync source → target branch ─────────────
  // Runs the detector to locate the block, pairs up steps by index,
  // copies authoring content with actor-index substitution.

  syncParallelBranch: (blockId, fromBranchIndex, toBranchIndex) => {
    let report: { copiedSteps: number } | null = null
    set((s) => {
      if (!s.dsl) return s
      const blocks = detectParallelBlocks(s.dsl)
      const block = blocks.find((b) => b.id === blockId)
      if (!block) return s
      const fromBranch = block.branches[fromBranchIndex]
      const toBranch = block.branches[toBranchIndex]
      if (!fromBranch || !toBranch) return s

      const pairCount = Math.min(fromBranch.length, toBranch.length)
      const byNum = new Map(s.dsl.process.steps.map((st) => [st.number, st]))

      // Build a map from targetStepId → patched step
      const patched = new Map<string, WorkflowStep>()

      for (let i = 0; i < pairCount; i++) {
        const src = byNum.get(fromBranch[i])
        const tgt = byNum.get(toBranch[i])
        if (!src || !tgt || src.type !== tgt.type) continue

        // Start with the target so we preserve id/number/transitions.
        // Double-cast through unknown is required because WorkflowStep is a
        // discriminated union and lacks an index signature.
        const next = { ...tgt } as unknown as Record<string, unknown> & WorkflowStep

        // Copy shared meta with substitution
        const srcAny = src as unknown as Record<string, unknown>
        const copyField = <T>(key: string, transform?: (v: T) => T) => {
          if (!(key in srcAny) || srcAny[key] === undefined) return
          const v = srcAny[key] as T
          next[key] = transform ? transform(v) : v
        }

        copyField<string>('title',       (v) => substituteActor(v, fromBranchIndex, toBranchIndex))
        copyField<string>('grup')
        copyField<string>('status')
        copyField<string>('statustiket')
        copyField<string>('viewer')
        copyField<string>('logstart',    (v) => substituteActor(v, fromBranchIndex, toBranchIndex))
        copyField<string>('logtrue',     (v) => substituteActor(v, fromBranchIndex, toBranchIndex))
        copyField<string>('logfalse',    (v) => substituteActor(v, fromBranchIndex, toBranchIndex))
        copyField<string>('logsave',     (v) => substituteActor(v, fromBranchIndex, toBranchIndex))

        if (src.type === 'form' && next.type === 'form') {
          const srcForm = src as FormStep
          const nextForm = next as FormStep
          nextForm.formFields = substituteFields(srcForm.formFields, fromBranchIndex, toBranchIndex) ?? []
          nextForm.formData = substituteRecord(srcForm.formData, fromBranchIndex, toBranchIndex) ?? {}
          nextForm.formDataInput = substituteRecord(srcForm.formDataInput, fromBranchIndex, toBranchIndex)
          nextForm.formDataView = substituteRecord(srcForm.formDataView, fromBranchIndex, toBranchIndex)
          // Invalidate raw caches so generator re-serializes from the patched parsed form
          nextForm._rawFormData = undefined
          nextForm._rawFormDataInput = undefined
          nextForm._rawFormDataView = undefined
          nextForm._rawDecisionKey = undefined
        }

        if (src.type === 'decision_user' && next.type === 'decision_user') {
          const srcD = src as DecisionUserStep
          const nextD = next as DecisionUserStep
          nextD.rule = substituteActor(srcD.rule, fromBranchIndex, toBranchIndex)
          nextD.viewFields = substituteFields(srcD.viewFields, fromBranchIndex, toBranchIndex) ?? []
          nextD.decisionKey = substituteRecord(srcD.decisionKey, fromBranchIndex, toBranchIndex) ?? {}
          nextD._rawDecisionKey = undefined
        }

        if (src.type === 'decision_sistem' && next.type === 'decision_sistem') {
          const srcS = src as DecisionSistemStep
          const nextS = next as DecisionSistemStep
          nextS.condition = {
            variableA: substituteActor(srcS.condition.variableA, fromBranchIndex, toBranchIndex),
            operator: srcS.condition.operator,
            variableB: substituteActor(srcS.condition.variableB, fromBranchIndex, toBranchIndex),
          }
        }

        patched.set(tgt.id, next as WorkflowStep)
      }

      if (patched.size === 0) return s

      const newSteps = s.dsl.process.steps.map((st) => patched.get(st.id) ?? st)
      const next: WorkflowDSL = { ...s.dsl, process: { ...s.dsl.process, steps: newSteps } }
      const past = [...s._past, s.dsl].slice(-MAX_HISTORY)

      report = { copiedSteps: patched.size }
      return {
        dsl: next,
        _past: past,
        _future: [],
        canUndo: true,
        canRedo: false,
      }
    })
    return report
  },

  commitParallelBlockAnnotations: () => {
    let count = 0
    set((s) => {
      if (!s.dsl) return s
      const blocks = detectParallelBlocks(s.dsl)
      count = blocks.length
      const annotations = blocks.map((b) => ({
        id: b.id,
        forkStepNumber: b.forkStepNumber,
        joinStepNumber: b.joinStepNumber,
        branches: b.branches,
        actors: b.actors,
      }))
      const next: WorkflowDSL = {
        ...s.dsl,
        process: { ...s.dsl.process, parallelBlocks: annotations },
      }
      const past = [...s._past, s.dsl].slice(-MAX_HISTORY)
      return {
        dsl: next,
        _past: past,
        _future: [],
        canUndo: true,
        canRedo: false,
      }
    })
    return { count }
  },

  clearParallelBlockAnnotations: () =>
    withHistory(set, (dsl) => {
      if (!dsl.process.parallelBlocks) return null
      const nextProcess = { ...dsl.process }
      delete nextProcess.parallelBlocks
      return { ...dsl, process: nextProcess }
    }),
}))
