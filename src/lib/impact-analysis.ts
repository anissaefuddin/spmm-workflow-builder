/**
 * impact-analysis.ts — Detects downstream effects of edits.
 *
 * All functions are pure — they take the DSL and return impact reports.
 * Used by the UI to show warnings before destructive actions.
 */
import type {
  WorkflowDSL, WorkflowStep,
  FormStep, DecisionUserStep, DecisionSistemStep,
} from '../types/workflow'

// ── Impact Types ──────────────────────────────────────────────

export interface AffectedStep {
  stepNumber: number
  stepId: string
  stepType: string
  stepTitle?: string
  reason: string
}

export interface ImpactReport {
  kind: 'variable-delete' | 'step-delete' | 'role-change'
  target: string
  severity: 'warning' | 'critical'
  affectedSteps: AffectedStep[]
  summary: string
}

// ── Variable Deletion Impact ──────────────────────────────────

export function analyzeVariableRemoval(variableName: string, dsl: WorkflowDSL): ImpactReport {
  const affected: AffectedStep[] = []

  for (const step of dsl.process.steps) {
    const reasons: string[] = []

    switch (step.type) {
      case 'form': {
        const s = step as FormStep
        if (s.formFields.includes(variableName))
          reasons.push('listed in formFields')
        if (s.formDataInput && variableName in s.formDataInput)
          reasons.push('mapped in formDataInput')
        if (s.formDataView && variableName in s.formDataView)
          reasons.push('mapped in formDataView')
        break
      }
      case 'decision_user': {
        const s = step as DecisionUserStep
        if (s.viewFields.includes(variableName))
          reasons.push('shown as view field')
        break
      }
      case 'decision_sistem': {
        const s = step as DecisionSistemStep
        if (s.condition.variableA === variableName)
          reasons.push('used as condition left operand')
        if (s.condition.variableB === variableName)
          reasons.push('used as condition right operand')
        break
      }
    }

    if (reasons.length > 0) {
      affected.push({
        stepNumber: step.number,
        stepId: step.id,
        stepType: step.type,
        stepTitle: step.title,
        reason: reasons.join(', '),
      })
    }
  }

  const severity = affected.some((a) => a.stepType === 'decision_sistem') ? 'critical' : 'warning'

  return {
    kind: 'variable-delete',
    target: variableName,
    severity,
    affectedSteps: affected,
    summary: affected.length === 0
      ? 'This variable is not referenced by any step.'
      : `Removing "${variableName}" will affect ${affected.length} step${affected.length > 1 ? 's' : ''}.`,
  }
}

// ── Step Deletion Impact ──────────────────────────────────────

export function analyzeStepRemoval(stepId: string, dsl: WorkflowDSL): ImpactReport {
  const target = dsl.process.steps.find((s) => s.id === stepId)
  if (!target) {
    return { kind: 'step-delete', target: stepId, severity: 'warning', affectedSteps: [], summary: 'Step not found.' }
  }

  const affected: AffectedStep[] = []

  for (const step of dsl.process.steps) {
    if (step.id === stepId) continue
    const reasons: string[] = []

    // Check if any transition points to the target step number
    if (step.transitions.true === target.number)
      reasons.push('true/next transition targets this step')
    if (step.transitions.false === target.number)
      reasons.push('false/reject transition targets this step')
    if (step.transitions.rollback === target.number)
      reasons.push('rollback transition targets this step')

    if (reasons.length > 0) {
      affected.push({
        stepNumber: step.number,
        stepId: step.id,
        stepType: step.type,
        stepTitle: step.title,
        reason: reasons.join(', '),
      })
    }
  }

  const severity = affected.length > 0 ? 'critical' : 'warning'

  return {
    kind: 'step-delete',
    target: `Step #${target.number}${target.title ? ` (${target.title})` : ''}`,
    severity,
    affectedSteps: affected,
    summary: affected.length === 0
      ? 'No other steps reference this step.'
      : `Removing Step #${target.number} will break ${affected.length} transition${affected.length > 1 ? 's' : ''}.`,
  }
}

// ── Role Change Impact ────────────────────────────────────────

export function analyzeRoleChange(
  oldRole: string,
  dsl: WorkflowDSL,
): ImpactReport {
  const affected: AffectedStep[] = []

  for (const step of dsl.process.steps) {
    if (step.role === oldRole) {
      affected.push({
        stepNumber: step.number,
        stepId: step.id,
        stepType: step.type,
        stepTitle: step.title,
        reason: `assigned to role "${oldRole}"`,
      })
    }
  }

  // Also check roleStart
  const isRoleStart = dsl.process.roleStart === oldRole

  return {
    kind: 'role-change',
    target: oldRole,
    severity: affected.length > 0 || isRoleStart ? 'critical' : 'warning',
    affectedSteps: affected,
    summary: [
      ...(isRoleStart ? [`"${oldRole}" is the starting role.`] : []),
      affected.length > 0
        ? `${affected.length} step${affected.length > 1 ? 's' : ''} assigned to "${oldRole}".`
        : `No steps are assigned to "${oldRole}".`,
    ].join(' '),
  }
}

// ── Quick check: does this edit have impact? ──────────────────

export function hasImpact(report: ImpactReport): boolean {
  return report.affectedSteps.length > 0
}
