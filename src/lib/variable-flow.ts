/**
 * variable-flow.ts — Computes variable ↔ step relationships.
 *
 * Scans the DSL to build a bi-directional map:
 *   Variable → which steps use it (and how)
 *   Step     → which variables it references
 *
 * Pure functions — no side effects, no API calls.
 */
import type {
  WorkflowDSL, WorkflowStep,
  FormStep, DecisionUserStep, DecisionSistemStep, SystemActionStep,
} from '../types/workflow'

// ── Types ────────────────────────────────────────────────────

export type UsageContext =
  | 'formFields'         // form: listed as an input field
  | 'formDataInput'      // form: writable data mapping
  | 'formDataView'       // form: read-only data mapping
  | 'viewFields'         // decision_user: shown to reviewer
  | 'condition.left'     // decision_sistem: left operand
  | 'condition.right'    // decision_sistem: right operand
  | 'inputVariable'      // system_action: input reference
  | 'viewVariable'       // system_action: view reference

export interface VariableUsage {
  stepNumber: number
  stepId: string
  stepType: string
  stepTitle?: string
  context: UsageContext
}

export interface VariableFlowNode {
  variableName: string
  vtype: string
  usages: VariableUsage[]
  /** Steps that WRITE this variable (formDataInput / formFields) */
  writers: number[]
  /** Steps that READ this variable (formDataView / viewFields / condition) */
  readers: number[]
}

export interface StepFlowNode {
  stepNumber: number
  stepId: string
  stepType: string
  /** Variables consumed (read) by this step */
  reads: string[]
  /** Variables produced (written) by this step */
  writes: string[]
}

export interface VariableFlowGraph {
  variables: Map<string, VariableFlowNode>
  steps: Map<number, StepFlowNode>
  /** Ordered list of variable names referenced by at least one step */
  usedVariables: string[]
  /** Variables declared but never referenced */
  unusedVariables: string[]
}

// ── Core Analysis ────────────────────────────────────────────

function collectUsages(step: WorkflowStep): { reads: VariableUsage[]; writes: VariableUsage[] } {
  const base = { stepNumber: step.number, stepId: step.id, stepType: step.type, stepTitle: step.title }
  const reads: VariableUsage[] = []
  const writes: VariableUsage[] = []

  switch (step.type) {
    case 'form': {
      const s = step as FormStep
      for (const f of s.formFields)
        writes.push({ ...base, context: 'formFields' })
      // formFields are both write and read — they define input fields
      for (const f of s.formFields)
        writes.push({ ...base, context: 'formFields' })
      // Deduplicate: use a Set approach instead
      const inputNames = new Set(s.formFields)
      for (const name of inputNames) {
        writes.push({ ...base, context: 'formFields' })
      }
      // Clear and redo properly
      writes.length = 0
      reads.length = 0
      for (const name of s.formFields) {
        writes.push({ ...base, context: 'formFields' })
      }
      if (s.formDataInput) {
        for (const _name of Object.keys(s.formDataInput)) {
          writes.push({ ...base, context: 'formDataInput' })
        }
      }
      if (s.formDataView) {
        for (const _name of Object.keys(s.formDataView)) {
          reads.push({ ...base, context: 'formDataView' })
        }
      }
      break
    }
    case 'decision_user': {
      const s = step as DecisionUserStep
      for (const _f of s.viewFields) {
        reads.push({ ...base, context: 'viewFields' })
      }
      break
    }
    case 'decision_sistem': {
      const s = step as DecisionSistemStep
      if (s.condition.variableA) reads.push({ ...base, context: 'condition.left' })
      if (s.condition.variableB) reads.push({ ...base, context: 'condition.right' })
      break
    }
    case 'system_action': {
      const s = step as SystemActionStep
      if (s.inputVariable) writes.push({ ...base, context: 'inputVariable' })
      if (s.viewVariable)  reads.push({ ...base, context: 'viewVariable' })
      break
    }
  }

  return { reads, writes }
}

/**
 * Extracts all variable names referenced by a step, grouped by read/write.
 */
function extractVariableNames(step: WorkflowStep): { reads: string[]; writes: string[] } {
  const reads: string[] = []
  const writes: string[] = []

  switch (step.type) {
    case 'form': {
      const s = step as FormStep
      writes.push(...s.formFields)
      if (s.formDataInput) writes.push(...Object.keys(s.formDataInput))
      if (s.formDataView) reads.push(...Object.keys(s.formDataView))
      break
    }
    case 'decision_user': {
      const s = step as DecisionUserStep
      reads.push(...s.viewFields)
      break
    }
    case 'decision_sistem': {
      const s = step as DecisionSistemStep
      if (s.condition.variableA) reads.push(s.condition.variableA)
      if (s.condition.variableB) reads.push(s.condition.variableB)
      break
    }
    case 'system_action': {
      const s = step as SystemActionStep
      if (s.inputVariable) writes.push(s.inputVariable)
      if (s.viewVariable)  reads.push(s.viewVariable)
      break
    }
  }

  return { reads: [...new Set(reads)], writes: [...new Set(writes)] }
}

/**
 * Builds the complete variable flow graph from a DSL.
 */
export function buildVariableFlow(dsl: WorkflowDSL): VariableFlowGraph {
  const variables = new Map<string, VariableFlowNode>()
  const steps = new Map<number, StepFlowNode>()
  const allUsedNames = new Set<string>()

  // Initialize variable nodes from declarations
  for (const v of dsl.process.variables) {
    variables.set(v.name, {
      variableName: v.name,
      vtype: v.vtype,
      usages: [],
      writers: [],
      readers: [],
    })
  }

  // Scan each step
  for (const step of dsl.process.steps) {
    const { reads, writes } = extractVariableNames(step)

    steps.set(step.number, {
      stepNumber: step.number,
      stepId: step.id,
      stepType: step.type,
      reads,
      writes,
    })

    // Record usages on each variable
    for (const name of writes) {
      allUsedNames.add(name)
      const vn = variables.get(name)
      if (vn) {
        vn.writers.push(step.number)
        vn.usages.push({
          stepNumber: step.number,
          stepId: step.id,
          stepType: step.type,
          stepTitle: step.title,
          context: step.type === 'form' ? 'formDataInput' : 'inputVariable',
        })
      }
    }

    for (const name of reads) {
      allUsedNames.add(name)
      const vn = variables.get(name)
      if (vn) {
        vn.readers.push(step.number)
        vn.usages.push({
          stepNumber: step.number,
          stepId: step.id,
          stepType: step.type,
          stepTitle: step.title,
          context: step.type === 'decision_user' ? 'viewFields'
            : step.type === 'decision_sistem' ? 'condition.left'
            : 'formDataView',
        })
      }
    }
  }

  const declaredNames = new Set(dsl.process.variables.map((v) => v.name))
  const usedVariables = [...allUsedNames].filter((n) => declaredNames.has(n))
  const unusedVariables = [...declaredNames].filter((n) => !allUsedNames.has(n))

  return { variables, steps, usedVariables, unusedVariables }
}

/**
 * Returns all step numbers that reference a given variable.
 */
export function getStepsForVariable(dsl: WorkflowDSL, variableName: string): number[] {
  const graph = buildVariableFlow(dsl)
  const vn = graph.variables.get(variableName)
  if (!vn) return []
  return [...new Set([...vn.writers, ...vn.readers])].sort((a, b) => a - b)
}
