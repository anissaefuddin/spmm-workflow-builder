/**
 * workflow-validator.ts — comprehensive DSL validator.
 *
 * Implements the full validation checklist derived from analyzing the
 * broken-vs-working XML gap in real SPMM workflow definitions. Used by:
 *   - XmlEditorPanel (pre-publish sanity check)
 *   - StepValidation (per-step warnings — subset of these checks)
 *   - Publish flow (block critical errors, warn on soft ones)
 *
 * Categories:
 *   - ERROR    : prevents publish
 *   - WARNING  : advisory; publish allowed
 *   - INFO     : hints / suggestions
 */
import type {
  WorkflowDSL,
  WorkflowStep,
  WorkflowVariable,
  FormStep,
  DecisionUserStep,
  DecisionSistemStep,
} from '../types/workflow'

export type ValidationSeverity = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  severity: ValidationSeverity
  category: string      // short tag: "role" | "option" | "decision" | "transition" | "orphan" | "duplicate" | "parallel"
  message: string
  stepNumber?: number
  variableName?: string
}

export interface ValidationReport {
  valid: boolean        // true if no errors (warnings OK)
  errors: number
  warnings: number
  infos: number
  issues: ValidationIssue[]
}

const STANDARD_VTYPES = new Set(['String', 'Number', 'float', 'Date', 'Option', 'file'])
const CUSTOM_FORMDATA_PREFIX = 'custom-formdata-'

// ── Helper: collect all transition targets from a step ───────

function getTransitionTargets(t: number | number[] | undefined): number[] {
  if (t === undefined) return []
  return Array.isArray(t) ? t : [t]
}

// ── Helper: reachability analysis (BFS from step 0) ──────────

function computeReachable(dsl: WorkflowDSL): Set<number> {
  const byNum = new Map<number, WorkflowStep>()
  for (const s of dsl.process.steps) byNum.set(s.number, s)

  const reachable = new Set<number>()
  const queue: number[] = [0]
  while (queue.length) {
    const n = queue.shift()!
    if (reachable.has(n)) continue
    reachable.add(n)
    const step = byNum.get(n)
    if (!step) continue
    for (const key of ['true', 'false', 'rollback'] as const) {
      for (const target of getTransitionTargets(step.transitions[key])) {
        if (!reachable.has(target)) queue.push(target)
      }
    }
  }
  return reachable
}

// ── Variable checks ──────────────────────────────────────────

function checkVariables(dsl: WorkflowDSL, issues: ValidationIssue[]) {
  const seen = new Set<string>()

  for (const v of dsl.process.variables) {
    // Duplicate names
    if (seen.has(v.name)) {
      issues.push({
        severity: 'error',
        category: 'duplicate',
        message: `Duplicate variable name: "${v.name}"`,
        variableName: v.name,
      })
    }
    seen.add(v.name)

    // Case-sensitive 'option' check — engine requires 'Option'
    if (v.vtype.toLowerCase() === 'option' && v.vtype !== 'Option') {
      issues.push({
        severity: 'error',
        category: 'option',
        message: `Variable "${v.name}": vtype "${v.vtype}" must be "Option" (case-sensitive)`,
        variableName: v.name,
      })
    }

    // Option types MUST have value2 (even empty is acceptable)
    if (v.vtype === 'Option' && v.value2 === undefined) {
      issues.push({
        severity: 'error',
        category: 'option',
        message: `Variable "${v.name}": Option type requires <value2> (engine dropdown rendering)`,
        variableName: v.name,
      })
    }

    // Option with empty value2 is suspicious (no selectable options)
    if (v.vtype === 'Option' && v.value2 !== undefined && v.value2.trim() === '') {
      issues.push({
        severity: 'warning',
        category: 'option',
        message: `Variable "${v.name}": Option has empty value2 (no selectable options defined)`,
        variableName: v.name,
      })
    }

    // File type should have linkfile template (soft warning)
    if (v.vtype === 'file' && !v.linkfile) {
      issues.push({
        severity: 'info',
        category: 'file',
        message: `Variable "${v.name}": file type without <linkfile> template path`,
        variableName: v.name,
      })
    }

    // Custom-formdata without label/readonly flags (downstream rendering expects them)
    if (v.vtype.startsWith(CUSTOM_FORMDATA_PREFIX)) {
      if (v.label === undefined) {
        issues.push({
          severity: 'info',
          category: 'custom',
          message: `Variable "${v.name}": custom-formdata type without <label> flag`,
          variableName: v.name,
        })
      }
    }
  }
}

// ── Step checks ──────────────────────────────────────────────

function checkSteps(dsl: WorkflowDSL, issues: ValidationIssue[]) {
  const steps = dsl.process.steps
  const stepNums = new Set(steps.map((s) => s.number))

  // Duplicate step numbers
  const seenNums = new Set<number>()
  for (const s of steps) {
    if (seenNums.has(s.number)) {
      issues.push({
        severity: 'error',
        category: 'duplicate',
        message: `Duplicate step number: ${s.number}`,
        stepNumber: s.number,
      })
    }
    seenNums.add(s.number)
  }

  // Per-step validation
  for (const step of steps) {
    checkStepTransitions(step, stepNums, issues)
    checkStepType(step, issues)
  }
}

function checkStepTransitions(step: WorkflowStep, stepNums: Set<number>, issues: ValidationIssue[]) {
  for (const key of ['true', 'false', 'rollback'] as const) {
    const targets = getTransitionTargets(step.transitions[key])
    for (const target of targets) {
      if (!stepNums.has(target)) {
        issues.push({
          severity: 'error',
          category: 'transition',
          message: `Step #${step.number}: <step${key}=${target}> references non-existent step`,
          stepNumber: step.number,
        })
      }

      // Loopback-to-start warning: any non-zero step pointing to 0 via true/false
      // is almost always a misconfiguration (reset to draft / infinite loop risk).
      // Exception: rollback → 0 is sometimes intentional (reset to start).
      if (target === 0 && step.number !== 0 && key !== 'rollback') {
        issues.push({
          severity: 'warning',
          category: 'loop',
          message: `Step #${step.number}: <step${key}>=0 loops back to Draft — potential infinite loop or misconfiguration`,
          stepNumber: step.number,
        })
      }
    }
    // Parallel branches must have unique targets
    if (Array.isArray(step.transitions[key])) {
      const arr = step.transitions[key] as number[]
      const dupes = arr.filter((n, i) => arr.indexOf(n) !== i)
      if (dupes.length > 0) {
        issues.push({
          severity: 'warning',
          category: 'parallel',
          message: `Step #${step.number}: parallel ${key}-branch has duplicate targets: ${dupes.join(',')}`,
          stepNumber: step.number,
        })
      }
    }
  }

  // system_email_user that notifies multiple roles but has single-target or zero transition
  // is almost always a misconfiguration — these are classic parallel-fork notifiers.
  if (step.type === 'system_action') {
    const rawType = (step as WorkflowStep & { rawType?: string }).rawType ?? ''
    if (rawType === 'system_email_user' || rawType.includes('email_user')) {
      const role = step.role ?? ''
      const hasMultiRole = role.includes(',') || role.includes(';')
      const trueTargets = getTransitionTargets(step.transitions.true)
      if (hasMultiRole && trueTargets.length <= 1) {
        issues.push({
          severity: 'warning',
          category: 'parallel',
          message: `Step #${step.number}: system_email_user notifies multiple roles (${role}) but has single-target steptrue. Should likely fork with "${trueTargets[0] ?? 'X'};Y" for parallel branches.`,
          stepNumber: step.number,
        })
      }
      if (hasMultiRole && trueTargets.length === 1 && trueTargets[0] === 0) {
        issues.push({
          severity: 'error',
          category: 'parallel',
          message: `Step #${step.number}: email notification step has steptrue=0 — parallel entry step misconfigured`,
          stepNumber: step.number,
        })
      }
    }
  }
}

function checkStepType(step: WorkflowStep, issues: ValidationIssue[]) {
  // Form steps should have decision_key + at least one input mechanism
  if (step.type === 'form') {
    const s = step as FormStep
    const hasInputs =
      (s.formFields && s.formFields.length > 0) ||
      (s.formDataInput && Object.keys(s.formDataInput).length > 0)
    if (!hasInputs) {
      issues.push({
        severity: 'warning',
        category: 'form',
        message: `Step #${step.number}: form step has no input fields`,
        stepNumber: step.number,
      })
    }
    if (!s.decisionKey || Object.keys(s.decisionKey).length === 0) {
      issues.push({
        severity: 'info',
        category: 'form',
        message: `Step #${step.number}: form step has no <decision_key> button labels`,
        stepNumber: step.number,
      })
    }
  }

  // Decision user — needs rule + true/false
  if (step.type === 'decision_user') {
    const s = step as DecisionUserStep
    if (!s.rule || !s.rule.trim()) {
      issues.push({
        severity: 'warning',
        category: 'decision',
        message: `Step #${step.number}: decision_user has no rule/question text`,
        stepNumber: step.number,
      })
    }
    if (step.transitions.true === undefined || step.transitions.false === undefined) {
      issues.push({
        severity: 'error',
        category: 'decision',
        message: `Step #${step.number}: decision_user requires both steptrue and stepfalse`,
        stepNumber: step.number,
      })
    }
  }

  // Decision sistem — MUST have variabela / operator / variabelb
  if (step.type === 'decision_sistem') {
    const s = step as DecisionSistemStep
    if (!s.condition.variableA || !s.condition.variableB) {
      issues.push({
        severity: 'error',
        category: 'decision',
        message: `Step #${step.number}: system_decision missing variabela/variabelb`,
        stepNumber: step.number,
      })
    }
    if (!s.condition.operator) {
      issues.push({
        severity: 'error',
        category: 'decision',
        message: `Step #${step.number}: system_decision missing operator`,
        stepNumber: step.number,
      })
    }
    if (step.transitions.true === undefined || step.transitions.false === undefined) {
      issues.push({
        severity: 'error',
        category: 'decision',
        message: `Step #${step.number}: system_decision requires both steptrue and stepfalse`,
        stepNumber: step.number,
      })
    }
  }
}

// ── Reachability / orphan detection ──────────────────────────

function checkReachability(dsl: WorkflowDSL, issues: ValidationIssue[]) {
  const reachable = computeReachable(dsl)
  const steps = dsl.process.steps

  for (const step of steps) {
    // View-only steps (≥100) are convention for read-only data views — not expected to be reachable
    if (step.number >= 100) continue
    if (step.number === 0) continue // entry point — always reachable by definition
    if (!reachable.has(step.number)) {
      issues.push({
        severity: 'warning',
        category: 'orphan',
        message: `Step #${step.number}: unreachable from step 0`,
        stepNumber: step.number,
      })
    }
  }
}

// ── Parallel branch sanity check ─────────────────────────────

function checkParallelBranches(dsl: WorkflowDSL, issues: ValidationIssue[]) {
  // Warn if a multi-role notification step has a single-target steptrue
  // (typically these should fan out to multiple branches)
  for (const step of dsl.process.steps) {
    if (!step.role || !step.role.includes(',')) continue
    // Multi-role step
    const trueTargets = getTransitionTargets(step.transitions.true)
    if (trueTargets.length === 1 && step.type === 'system_action') {
      issues.push({
        severity: 'info',
        category: 'parallel',
        message: `Step #${step.number}: notifies multiple roles (${step.role}) but steptrue is single-target`,
        stepNumber: step.number,
      })
    }
  }
}

// ── Main Entry Point ─────────────────────────────────────────

/**
 * Validate a complete WorkflowDSL.
 * Returns a structured report with errors, warnings, and info notes.
 *
 * @example
 * const report = validateWorkflow(dsl)
 * if (!report.valid) {
 *   showErrors(report.issues.filter(i => i.severity === 'error'))
 * }
 */
export function validateWorkflow(
  dsl: WorkflowDSL,
  opts: { includeLogic?: boolean } = {},
): ValidationReport {
  const issues: ValidationIssue[] = []

  // Root-level checks
  if (!dsl.process.roleStart) {
    issues.push({
      severity: 'error',
      category: 'role',
      message: 'Missing <rolestart> — required by engine',
    })
  }
  if (dsl.process.steps.length === 0) {
    issues.push({
      severity: 'error',
      category: 'step',
      message: 'No steps defined',
    })
  }

  checkVariables(dsl, issues)
  checkSteps(dsl, issues)
  checkReachability(dsl, issues)
  checkParallelBranches(dsl, issues)

  // ── Logic-level checks (opt-in; defaults to true) ──
  // Dynamic import avoided — direct import is safe because no circular dep exists.
  if (opts.includeLogic !== false) {
    const logicIssues = validateLogicIssues(dsl)
    for (const li of logicIssues) {
      issues.push({
        severity: li.severity,
        category: `logic:${li.category}`,
        message: li.message,
        stepNumber: li.stepNumber,
      })
    }
  }

  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.filter((i) => i.severity === 'warning').length
  const infos = issues.filter((i) => i.severity === 'info').length

  return {
    valid: errors === 0,
    errors,
    warnings,
    infos,
    issues,
  }
}

// Indirection to keep the import local + avoid circular type issues
import { validateLogic } from './workflow-logic-validator'
function validateLogicIssues(dsl: WorkflowDSL) {
  return validateLogic(dsl).issues
}

/** Export for testing: the helper that extracts all transition targets */
export { getTransitionTargets, computeReachable }

/** Check whether a variable is a custom (non-standard) type */
export function isCustomVtype(vtype: string): boolean {
  return !STANDARD_VTYPES.has(vtype)
}

/** Export so UI can tag variables */
export { STANDARD_VTYPES }
