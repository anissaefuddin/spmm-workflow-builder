/**
 * workflow-logic-validator.ts — execution-semantic validation.
 *
 * Goes beyond structural checks to detect runtime-semantic issues:
 *   - parallel splits without joins
 *   - race conditions at join points
 *   - incomplete AND conditions (only one completion flag checked)
 *   - premature workflow termination
 *   - deadlock potentials
 *
 * Pure function API. No runtime side effects.
 * Works with the existing WorkflowDSL types — no XML parsing, no DB reads.
 *
 * Complements (does NOT replace) workflow-validator.ts which handles structural issues.
 */
import type {
  WorkflowDSL,
  WorkflowStep,
  DecisionSistemStep,
} from '../types/workflow'
import {
  indexSteps,
  findReachable,
  findDivergenceNodes,
  findConvergence,
  getBranchTargets,
  canReach,
} from './workflow-graph'

export type LogicSeverity = 'error' | 'warning' | 'info'

export interface LogicIssue {
  severity: LogicSeverity
  category: 'parallel-no-join' | 'race-condition' | 'incomplete-and'
           | 'premature-end' | 'deadlock' | 'missing-sync'
  message: string
  stepNumber?: number
  relatedSteps?: number[]
}

export interface LogicReport {
  ok: boolean
  errors: number
  warnings: number
  infos: number
  issues: LogicIssue[]
}

// Heuristic: variable name patterns that suggest "completion flags"
const COMPLETION_PATTERNS = [
  /_[Ss]elesai$/,         // Indonesian "Selesai" = done
  /_[Dd]one$/,
  /_[Cc]omplete$/,
  /_[Ff]inished$/,
  /^Apakah_.*_[Ss]elesai$/,
  /^Apakah_.*_[Dd]ilanjutkan$/,
]

function looksLikeCompletionFlag(name: string): boolean {
  return COMPLETION_PATTERNS.some((re) => re.test(name))
}

// ── 1. Parallel Must Join ────────────────────────────────────

/**
 * For every parallel fork (true = [a, b, ...]), check that all branches
 * eventually converge to at least one common step.
 * If no convergence exists → ERROR (parallel split without join).
 */
export function detectParallelWithoutJoin(dsl: WorkflowDSL): LogicIssue[] {
  const issues: LogicIssue[] = []

  for (const step of dsl.process.steps) {
    const t = step.transitions.true
    if (!Array.isArray(t) || t.length < 2) continue

    const convergence = findConvergence(dsl, t)
    if (convergence.size === 0) {
      issues.push({
        severity: 'error',
        category: 'parallel-no-join',
        message: `Step #${step.number}: parallel split to [${t.join(', ')}] — branches never converge (no join point found)`,
        stepNumber: step.number,
        relatedSteps: t,
      })
    } else if (convergence.size > 0) {
      // Check if the first convergence is a proper synchronization step
      const byNum = indexSteps(dsl)
      // Order convergence by reachability distance — pick nearest
      const sortedConv = [...convergence].sort((a, b) => a - b)
      const firstJoin = sortedConv[0]
      const joinStep = byNum.get(firstJoin)

      if (joinStep) {
        // A "safe" join is either:
        //   - a system_decision that gates on a completion flag, OR
        //   - a step with multiple incoming edges from the parallel branches
        //     AND that handles synchronization explicitly
        const isDecisionGate = joinStep.type === 'decision_sistem'
        if (!isDecisionGate) {
          issues.push({
            severity: 'warning',
            category: 'missing-sync',
            message: `Step #${step.number}: parallel branches converge at step ${firstJoin} (${joinStep.type}), but no explicit synchronization detected. Consider inserting a system_decision gate.`,
            stepNumber: step.number,
            relatedSteps: [firstJoin],
          })
        }
      }
    }
  }

  return issues
}

// ── 2. Race Condition Detection ──────────────────────────────

/**
 * A race condition at a join point occurs when both parallel branches
 * route to the same next step without a gating decision that checks
 * the OTHER branch's completion flag.
 *
 * Pattern: branchA → decisionA → next, branchB → decisionB → next
 * If decisionA checks only flagA (not flagB), and decisionB checks only flagB,
 * then whichever arrives FIRST triggers `next` prematurely.
 */
export function detectRaceConditions(dsl: WorkflowDSL): LogicIssue[] {
  const issues: LogicIssue[] = []
  const byNum = indexSteps(dsl)

  // Find all parallel forks
  for (const forkStep of dsl.process.steps) {
    const t = forkStep.transitions.true
    if (!Array.isArray(t) || t.length < 2) continue

    const branchStarts = t
    const convergence = findConvergence(dsl, branchStarts)
    if (convergence.size === 0) continue

    // Find decisions that feed the convergence points
    for (const convNum of convergence) {
      const convStep = byNum.get(convNum)
      if (!convStep) continue

      // Who feeds this convergence? Check all steps whose transitions reach convNum.
      const feeders: WorkflowStep[] = []
      for (const s of dsl.process.steps) {
        const outs = [
          ...(Array.isArray(s.transitions.true)  ? s.transitions.true  : s.transitions.true  !== undefined ? [s.transitions.true]  : []),
          ...(Array.isArray(s.transitions.false) ? s.transitions.false : s.transitions.false !== undefined ? [s.transitions.false] : []),
        ]
        if (outs.includes(convNum)) feeders.push(s)
      }

      // Look for the anti-pattern: multiple decision_sistem feeders, each checking different variables
      const decisionFeeders = feeders.filter((s) => s.type === 'decision_sistem') as DecisionSistemStep[]
      if (decisionFeeders.length >= 2) {
        // Check if each decision's variables reference the SAME branch (bad) or CROSS branches (good)
        const variablesChecked = decisionFeeders.map((d) => d.condition.variableA)
        const allSameBranchNaming = variablesChecked.every((v) => {
          // If all reference the same assessor (e.g. all contain "Asesor_1"), that's suspicious
          const match = v.match(/Asesor_([12])/i) || v.match(/Assesor_([12])/i)
          return match && match[1] === (variablesChecked[0].match(/Asesor_([12])/i) || variablesChecked[0].match(/Assesor_([12])/i) || [])[1]
        })
        if (allSameBranchNaming) {
          issues.push({
            severity: 'warning',
            category: 'race-condition',
            message: `Step ${convNum}: multiple decisions feed this join but all check the same branch variable. Each decision should check the OTHER branch's flag (cross-check pattern).`,
            stepNumber: convNum,
            relatedSteps: decisionFeeders.map((d) => d.number),
          })
        }
      }

      // Look for direct convergence (no decision gate at all)
      if (decisionFeeders.length === 0 && feeders.length >= 2) {
        issues.push({
          severity: 'warning',
          category: 'race-condition',
          message: `Step ${convNum}: ${feeders.length} parallel branches converge directly without a synchronization decision. Whichever branch arrives first continues.`,
          stepNumber: convNum,
          relatedSteps: feeders.map((f) => f.number),
        })
      }
    }
  }

  return issues
}

// ── 3. Incomplete AND Condition ──────────────────────────────

/**
 * Detect system_decision steps that check only ONE of a family of
 * "completion flag" variables.
 *
 * Example bad pattern:
 *   Variables: Apakah_Visitasi_Asesor_1_Selesai, Apakah_Visitasi_Asesor_2_Selesai
 *   Decision: variabela = Apakah_Visitasi_Asesor_1_Selesai (only one!)
 *
 * If parallel branches exist that produce both flags, the gate is incomplete.
 */
export function detectIncompleteANDConditions(dsl: WorkflowDSL): LogicIssue[] {
  const issues: LogicIssue[] = []
  const completionVars = dsl.process.variables.filter((v) => looksLikeCompletionFlag(v.name))
  if (completionVars.length < 2) return issues

  // Group by base pattern — variables that differ only in a trailing number or role
  // e.g. Apakah_Visitasi_Asesor_1_Selesai + _2_Selesai → same family
  const families = new Map<string, string[]>()
  for (const v of completionVars) {
    // Strip trailing _1/_2 or _asesor1/_asesor2 to get family key
    const key = v.name
      .replace(/_[Aa]sesor_?[12]/g, '_ASESOR')
      .replace(/_[Aa]sessor_?[12]/g, '_ASESOR')
      .replace(/_[12](_|$)/, '_X$1')
    const arr = families.get(key) ?? []
    arr.push(v.name)
    families.set(key, arr)
  }

  // For each multi-member family, find decisions referencing at most one of them
  for (const [familyKey, members] of families) {
    if (members.length < 2) continue

    for (const step of dsl.process.steps) {
      if (step.type !== 'decision_sistem') continue
      const ds = step as DecisionSistemStep
      const checksA = members.includes(ds.condition.variableA)
      const checksB = members.includes(ds.condition.variableB)
      // If decision references exactly one member of the family, it's incomplete
      const matched = members.filter((m) => m === ds.condition.variableA || m === ds.condition.variableB)
      if (matched.length === 1 && !checksA === !checksB) {
        // Only one side of the condition is a completion flag
        issues.push({
          severity: 'warning',
          category: 'incomplete-and',
          message: `Step #${step.number}: decision checks "${matched[0]}" but sibling completion flag(s) exist: [${members.filter((m) => m !== matched[0]).join(', ')}]. Consider chaining cross-checks.`,
          stepNumber: step.number,
        })
      }
    }
    void familyKey
  }

  return issues
}

// ── 4. Premature End Detection ───────────────────────────────

/**
 * Find system_end steps reachable from only a subset of parallel branches.
 * If an end step is only reachable from branch A but not branch B of a parallel fork,
 * the workflow may terminate while branch B is still running.
 */
export function detectPrematureEnds(dsl: WorkflowDSL): LogicIssue[] {
  const issues: LogicIssue[] = []
  const endSteps = dsl.process.steps.filter((s) => s.type === 'end' || (s as WorkflowStep & { rawType?: string }).rawType?.startsWith('system_end'))

  for (const forkStep of dsl.process.steps) {
    const t = forkStep.transitions.true
    if (!Array.isArray(t) || t.length < 2) continue

    for (const endStep of endSteps) {
      const reachingBranches = t.filter((branchStart) => canReach(dsl, branchStart, endStep.number))
      // If SOME but not ALL branches can reach this end → premature termination risk
      if (reachingBranches.length > 0 && reachingBranches.length < t.length) {
        issues.push({
          severity: 'error',
          category: 'premature-end',
          message: `Step #${endStep.number} (end) reachable from parallel branch(es) [${reachingBranches.join(', ')}] but not all branches of fork at step #${forkStep.number}. Workflow may terminate with active branches.`,
          stepNumber: endStep.number,
          relatedSteps: [forkStep.number, ...reachingBranches],
        })
      }
    }
  }

  return issues
}

// ── 5. Deadlock Detection ────────────────────────────────────

/**
 * A step is a dead-end if it has no outgoing transitions AND is not an end/system_end.
 * The workflow cannot proceed past such steps.
 */
export function detectDeadlocks(dsl: WorkflowDSL): LogicIssue[] {
  const issues: LogicIssue[] = []
  const reachable = findReachable(dsl, 0)

  for (const step of dsl.process.steps) {
    if (!reachable.has(step.number)) continue
    if (step.number >= 100) continue // view-only steps by convention
    const out = [step.transitions.true, step.transitions.false, step.transitions.rollback]
      .filter((v): v is number | number[] => v !== undefined)
    const hasOut = out.length > 0 && out.some((v) => {
      const arr = Array.isArray(v) ? v : [v]
      return arr.some((n) => n !== 0)
    })
    if (hasOut) continue
    // No outgoing — is it an end?
    if (step.type === 'end') continue
    const isSystemEnd = step.type === 'system_action' &&
                        (step as WorkflowStep & { rawType?: string }).rawType?.startsWith('system_end')
    if (isSystemEnd) continue
    // Allow system_kosong as explicit park
    const isKosong = step.type === 'system_action' &&
                     (step as WorkflowStep & { rawType?: string }).rawType === 'system_kosong'
    if (isKosong) continue

    issues.push({
      severity: 'warning',
      category: 'deadlock',
      message: `Step #${step.number} (${step.type}) has no outgoing transitions and is not an end/park step — potential deadlock`,
      stepNumber: step.number,
    })
  }

  return issues
}

// ── Aggregator ───────────────────────────────────────────────

/**
 * Run ALL logic checks and return a unified report.
 */
export function validateLogic(dsl: WorkflowDSL): LogicReport {
  const issues: LogicIssue[] = []
  issues.push(...detectParallelWithoutJoin(dsl))
  issues.push(...detectRaceConditions(dsl))
  issues.push(...detectIncompleteANDConditions(dsl))
  issues.push(...detectPrematureEnds(dsl))
  issues.push(...detectDeadlocks(dsl))

  const errors   = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.filter((i) => i.severity === 'warning').length
  const infos    = issues.filter((i) => i.severity === 'info').length

  return { ok: errors === 0, errors, warnings, infos, issues }
}

/** Exposed helpers for UI introspection */
export { findDivergenceNodes, findConvergence, getBranchTargets }
