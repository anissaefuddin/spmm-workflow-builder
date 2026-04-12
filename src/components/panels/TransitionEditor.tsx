/**
 * TransitionEditor — reusable step-transition selects.
 * Renders whichever of true / false / rollback keys are passed.
 * Each row has a navigate (→) button to jump to the target step in canvas.
 */
import type { WorkflowStep } from '../../types/workflow'
import { useWorkflowStore } from '../../store/workflow-store'

interface Props {
  step: WorkflowStep
  /** Which transitions to render. Default: ['true'] */
  show?: ('true' | 'false' | 'rollback')[]
}

const LABEL: Record<string, { text: string; color: string }> = {
  true:     { text: 'Approve / Next', color: 'text-green-700' },
  false:    { text: 'Reject',         color: 'text-red-600'   },
  rollback: { text: 'Rollback',       color: 'text-amber-600' },
}

export function TransitionEditor({ step, show = ['true'] }: Props) {
  const updateStep = useWorkflowStore((s) => s.updateStep)
  const selectStep = useWorkflowStore((s) => s.selectStep)
  const allSteps   = useWorkflowStore((s) => s.dsl?.process.steps ?? [])
  const others     = allSteps.filter((s) => s.id !== step.id)

  const set = (key: 'true' | 'false' | 'rollback', raw: string) => {
    const n = raw === '' ? undefined : parseInt(raw, 10)
    updateStep(step.id, {
      transitions: { ...step.transitions, [key]: n },
    } as Partial<WorkflowStep>)
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-700">
        Transitions
      </div>
      <div className="px-3 pb-3 pt-2 space-y-2 bg-white">
        {show.map((key) => {
          const { text, color } = LABEL[key]
          const targetNum = step.transitions[key]
          const targetStep = targetNum !== undefined
            ? allSteps.find((s) => s.number === targetNum)
            : undefined
          return (
            <div key={key} className="flex items-center gap-2">
              <span className={`text-xs font-semibold shrink-0 w-28 ${color}`}>{text}</span>
              <select
                value={targetNum !== undefined ? String(targetNum) : ''}
                onChange={(e) => set(key, e.target.value)}
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="">— not set —</option>
                {others.map((s) => (
                  <option key={s.id} value={s.number}>
                    #{s.number} · {s.type}{s.title ? ` — ${s.title}` : ''}
                  </option>
                ))}
              </select>
              {targetStep && (
                <button
                  onClick={() => selectStep(targetStep.id)}
                  title={`Go to step #${targetNum}`}
                  className="shrink-0 text-gray-400 hover:text-blue-600 transition-colors text-base leading-none"
                >
                  →
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
