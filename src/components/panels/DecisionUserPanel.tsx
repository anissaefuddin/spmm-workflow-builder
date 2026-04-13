import type { DecisionUserStep, DecisionKeyMap } from '../../types/workflow'
import { useWorkflowStore } from '../../store/workflow-store'
import { StepMetaFields } from './StepMetaFields'
import { TransitionEditor } from './TransitionEditor'
import { DecisionKeyEditor } from './DecisionKeyEditor'
import { StepValidation } from './StepValidation'
import { VariablePicker } from './VariablePicker'
import { ButtonMapEditor } from './ButtonMapEditor'

interface Props { step: DecisionUserStep }

export function DecisionUserPanel({ step }: Props) {
  const { updateStep, removeStep, dsl } = useWorkflowStore()
  const variables = dsl?.process.variables ?? []

  return (
    <div className="space-y-3">

      {/* ── Validation warnings ──────────────────────────────── */}
      <StepValidation step={step} />

      {/* ── Identity ──────────────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="w-20 shrink-0">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Step #</label>
          <input
            type="number"
            value={step.number}
            onChange={(e) => updateStep(step.id, { number: parseInt(e.target.value, 10) } as Partial<DecisionUserStep>)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Decision Rule</label>
          <input
            type="text"
            value={step.rule}
            onChange={(e) => updateStep(step.id, { rule: e.target.value } as Partial<DecisionUserStep>)}
            placeholder="e.g. Apakah anda menyetujui?"
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
      </div>

      {/* ── View fields ───────────────────────────────────────── */}
      <div className="border border-amber-200 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-amber-50 text-xs font-bold uppercase tracking-wide text-amber-700">
          View Fields (shown to reviewer)
        </div>
        <div className="px-3 pb-3 pt-2 bg-white">
          <VariablePicker
            selected={step.viewFields}
            available={variables}
            onAdd={(name) => {
              if (step.viewFields.includes(name)) return
              updateStep(step.id, { viewFields: [...step.viewFields, name] } as Partial<DecisionUserStep>)
            }}
            onRemove={(name) => {
              updateStep(step.id, {
                viewFields: step.viewFields.filter((f) => f !== name),
              } as Partial<DecisionUserStep>)
            }}
            accent="amber"
            emptyText="No variables defined in process"
          />
        </div>
      </div>

      {/* ── Action Buttons ───────────────────────────────────── */}
      <div className="border border-amber-200 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-amber-50 text-xs font-bold uppercase tracking-wide text-amber-700">
          Action Buttons
        </div>
        <div className="px-3 pb-3 pt-2 bg-white">
          <DecisionKeyEditor
            value={step.decisionKey as unknown as DecisionKeyMap}
            onChange={(v) => updateStep(step.id, { decisionKey: v } as Partial<DecisionUserStep>)}
          />
        </div>
      </div>

      {/* ── Button Config (wf_button_map) ───────────────────── */}
      <ButtonMapEditor stepNumber={step.number} />

      {/* ── Shared metadata ──────────────────────────────────── */}
      <StepMetaFields step={step} />

      {/* ── Transitions ──────────────────────────────────────── */}
      <TransitionEditor step={step} show={['true', 'false', 'rollback']} />

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
