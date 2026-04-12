import type { DecisionSistemStep } from '../../types/workflow'
import { useWorkflowStore } from '../../store/workflow-store'
import { DecisionBuilder } from '../DecisionBuilder/DecisionBuilder'
import { StepMetaFields } from './StepMetaFields'
import { TransitionEditor } from './TransitionEditor'

interface Props { step: DecisionSistemStep }

export function DecisionSistemPanel({ step }: Props) {
  const { updateStep, removeStep } = useWorkflowStore()

  return (
    <div className="space-y-3">

      {/* ── Identity ──────────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
          Step #
        </label>
        <input
          type="number"
          value={step.number}
          onChange={(e) => updateStep(step.id, { number: parseInt(e.target.value, 10) } as Partial<DecisionSistemStep>)}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
        />
      </div>

      {/* ── Condition builder ─────────────────────────────────── */}
      <div className="border border-purple-200 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-purple-50 text-xs font-bold uppercase tracking-wide text-purple-700">
          Condition
        </div>
        <div className="px-3 pb-3 pt-2 bg-white">
          <DecisionBuilder stepId={step.id} condition={step.condition} />
        </div>
      </div>

      {/* ── Shared metadata ──────────────────────────────────── */}
      <StepMetaFields step={step} />

      {/* ── Transitions ──────────────────────────────────────── */}
      <TransitionEditor step={step} show={['true', 'false']} />

      {/* ── Delete ───────────────────────────────────────────── */}
      <button
        onClick={() => removeStep(step.id)}
        className="w-full bg-red-50 border border-red-200 text-red-600 rounded px-3 py-1.5 text-sm hover:bg-red-100"
      >
        Delete Step
      </button>
    </div>
  )
}
