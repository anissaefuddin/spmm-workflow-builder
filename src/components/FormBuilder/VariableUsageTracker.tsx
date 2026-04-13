/**
 * VariableUsageTracker — shows which steps reference a variable.
 *
 * Scans formDataInput, formDataView, formFields, viewFields, and
 * decision_sistem conditions across all steps in the current DSL.
 * Pure frontend — no API call needed.
 */
import { useMemo } from 'react'
import { useWorkflowStore } from '../../store/workflow-store'
import type {
  WorkflowStep, FormStep, DecisionUserStep, DecisionSistemStep,
} from '../../types/workflow'

interface Usage {
  stepNumber: number
  stepType: string
  stepTitle?: string
  field: string  // e.g. "formDataInput", "viewFields", "condition.variableA"
}

function findUsages(variableName: string, steps: WorkflowStep[]): Usage[] {
  const usages: Usage[] = []

  for (const step of steps) {
    const base = { stepNumber: step.number, stepType: step.type, stepTitle: step.title }

    switch (step.type) {
      case 'form': {
        const s = step as FormStep
        if (s.formFields.includes(variableName))
          usages.push({ ...base, field: 'formFields' })
        if (s.formDataInput && variableName in s.formDataInput)
          usages.push({ ...base, field: 'formDataInput' })
        if (s.formDataView && variableName in s.formDataView)
          usages.push({ ...base, field: 'formDataView' })
        break
      }
      case 'decision_user': {
        const s = step as DecisionUserStep
        if (s.viewFields.includes(variableName))
          usages.push({ ...base, field: 'viewFields' })
        break
      }
      case 'decision_sistem': {
        const s = step as DecisionSistemStep
        if (s.condition.variableA === variableName)
          usages.push({ ...base, field: 'condition.variableA' })
        if (s.condition.variableB === variableName)
          usages.push({ ...base, field: 'condition.variableB' })
        break
      }
    }
  }

  return usages
}

// ── Field label map ──────────────────────────────────────────
const FIELD_LABEL: Record<string, string> = {
  formFields:          'input field',
  formDataInput:       'writable data',
  formDataView:        'view data',
  viewFields:          'view field',
  'condition.variableA': 'condition left',
  'condition.variableB': 'condition right',
}

const TYPE_ICON: Record<string, string> = {
  form:             '📋',
  decision_user:    '◇',
  decision_sistem:  '⬡',
  system_action:    '⚙',
  end:              '◉',
}

export function VariableUsageTracker({ variableName }: { variableName: string }) {
  const steps = useWorkflowStore((s) => s.dsl?.process.steps ?? [])
  const selectStep = useWorkflowStore((s) => s.selectStep)

  const usages = useMemo(() => findUsages(variableName, steps), [variableName, steps])

  if (usages.length === 0) {
    return (
      <div className="text-[10px] text-gray-400 italic mt-1">
        Not referenced in any step
      </div>
    )
  }

  return (
    <div className="mt-1">
      <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">
        Used in {usages.length} step{usages.length !== 1 ? 's' : ''}
      </p>
      <div className="space-y-0.5">
        {usages.map((u, i) => {
          const targetStep = steps.find((s) => s.number === u.stepNumber)
          return (
            <button
              key={i}
              onClick={() => targetStep && selectStep(targetStep.id)}
              className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-left hover:bg-gray-100 transition-colors group"
            >
              <span className="text-[10px] shrink-0">{TYPE_ICON[u.stepType] ?? '•'}</span>
              <span className="text-[10px] font-mono text-gray-500">#{u.stepNumber}</span>
              <span className="text-[10px] text-gray-600 flex-1 truncate">
                {u.stepTitle || u.stepType}
              </span>
              <span className="text-[9px] text-gray-400 shrink-0">
                {FIELD_LABEL[u.field] ?? u.field}
              </span>
              <span className="text-[10px] text-blue-400 opacity-0 group-hover:opacity-100 shrink-0">→</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
