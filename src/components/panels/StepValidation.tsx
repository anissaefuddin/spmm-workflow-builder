/**
 * StepValidation — inline warning badges for the current step.
 *
 * Runs a set of checks against the step and its siblings.
 * Shows amber warnings for common configuration issues.
 * Non-blocking — just advisory notices, never prevents saving.
 */
import { useMemo } from 'react'
import type { WorkflowStep, FormStep, DecisionUserStep, DecisionSistemStep, SystemActionStep } from '../../types/workflow'
import { useWorkflowStore } from '../../store/workflow-store'

interface Warning {
  key: string
  text: string
  severity: 'warn' | 'info'
}

function computeWarnings(step: WorkflowStep, allSteps: WorkflowStep[]): Warning[] {
  const w: Warning[] = []
  const stepNums = new Set(allSteps.map((s) => s.number))

  const checkTransition = (key: 'true' | 'false' | 'rollback', label: string) => {
    const t = step.transitions[key]
    if (t !== undefined && !stepNums.has(t))
      w.push({ key: `trans-${key}-missing`, text: `${label} → Step ${t} does not exist`, severity: 'warn' })
  }

  switch (step.type) {
    case 'form': {
      const s = step as FormStep
      const hasFields = s.formFields.length > 0 || (s.formDataInput && Object.keys(s.formDataInput).length > 0)
      if (!hasFields)
        w.push({ key: 'no-fields', text: 'No input fields configured', severity: 'info' })
      if (step.transitions.true === undefined)
        w.push({ key: 'no-next', text: 'No next step set', severity: 'warn' })
      checkTransition('true', 'Next')
      checkTransition('rollback', 'Rollback')
      break
    }
    case 'decision_user': {
      const s = step as DecisionUserStep
      if (!s.rule?.trim())
        w.push({ key: 'no-rule', text: 'Decision rule / question is empty', severity: 'warn' })
      if (step.transitions.true === undefined)
        w.push({ key: 'no-approve', text: 'Approve transition not set', severity: 'warn' })
      if (step.transitions.false === undefined)
        w.push({ key: 'no-reject', text: 'Reject transition not set', severity: 'warn' })
      checkTransition('true', 'Approve')
      checkTransition('false', 'Reject')
      break
    }
    case 'decision_sistem': {
      const s = step as DecisionSistemStep
      if (!s.condition.variableA || !s.condition.variableB)
        w.push({ key: 'no-condition', text: 'Condition variables are incomplete', severity: 'warn' })
      if (step.transitions.true === undefined)
        w.push({ key: 'no-true', text: 'True transition not set', severity: 'warn' })
      if (step.transitions.false === undefined)
        w.push({ key: 'no-false', text: 'False transition not set', severity: 'warn' })
      checkTransition('true', 'True')
      checkTransition('false', 'False')
      break
    }
    case 'system_action': {
      const s = step as SystemActionStep
      if (!s.rawType || s.rawType === 'system_action')
        w.push({ key: 'no-rawtype', text: 'System action type is not specified', severity: 'warn' })
      if (step.transitions.true === undefined)
        w.push({ key: 'no-next', text: 'No next step set', severity: 'info' })
      break
    }
    case 'end':
      // End steps are fine with no transitions
      break
  }

  return w
}

export function StepValidation({ step }: { step: WorkflowStep }) {
  const allSteps = useWorkflowStore((s) => s.dsl?.process.steps ?? [])
  const warnings = useMemo(() => computeWarnings(step, allSteps), [step, allSteps])

  if (warnings.length === 0) return null

  return (
    <div className="space-y-1">
      {warnings.map((w) => (
        <div
          key={w.key}
          className={`flex items-start gap-1.5 px-2.5 py-1.5 rounded text-xs
            ${w.severity === 'warn'
              ? 'bg-amber-50 border border-amber-200 text-amber-700'
              : 'bg-blue-50 border border-blue-200 text-blue-600'}`}
        >
          <span className="shrink-0 mt-0.5">{w.severity === 'warn' ? '⚠' : 'ℹ'}</span>
          <span>{w.text}</span>
        </div>
      ))}
    </div>
  )
}
