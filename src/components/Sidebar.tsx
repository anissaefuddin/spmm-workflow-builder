import { useWorkflowStore } from '../store/workflow-store'
import { FormStepPanel }      from './panels/FormStepPanel'
import { DecisionUserPanel }  from './panels/DecisionUserPanel'
import { DecisionSistemPanel } from './panels/DecisionSistemPanel'
import { SystemActionPanel }  from './panels/SystemActionPanel'
import { ProcessPanel }       from './panels/ProcessPanel'
import { StepMetaFields }     from './panels/StepMetaFields'
import { TransitionEditor }   from './panels/TransitionEditor'
import type {
  FormStep, DecisionUserStep, DecisionSistemStep,
  SystemActionStep, EndStep,
} from '../types/workflow'

// ── Step type → tab label + color ────────────────────────────
const STEP_TAB: Record<string, { label: string; color: string }> = {
  form:             { label: 'Form',       color: 'text-blue-600 border-blue-500 bg-blue-50' },
  decision_user:    { label: 'Decision',   color: 'text-amber-600 border-amber-500 bg-amber-50' },
  decision_sistem:  { label: 'Sys Check',  color: 'text-purple-600 border-purple-500 bg-purple-50' },
  system_action:    { label: 'System',     color: 'text-teal-600 border-teal-500 bg-teal-50' },
  end:              { label: 'End',        color: 'text-gray-600 border-gray-400 bg-gray-50' },
}

export function Sidebar() {
  const { dsl, selectedStepId, selectStep } = useWorkflowStore()

  if (!dsl) return null

  const selectedStep = selectedStepId
    ? dsl.process.steps.find((s) => s.id === selectedStepId)
    : null

  const tab = selectedStep ? (STEP_TAB[selectedStep.type] ?? STEP_TAB.end) : null

  return (
    <aside className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden">

      {/* ── Tabs ────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-200 shrink-0">
        <button
          onClick={() => selectStep(null)}
          className={`
            flex-1 py-2 text-xs font-semibold uppercase tracking-wide transition-colors
            ${!selectedStepId
              ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}
          `}
        >
          Process
        </button>
        {selectedStep && tab && (
          <button
            className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wide border-b-2 ${tab.color}`}
          >
            {tab.label}
          </button>
        )}
      </div>

      {/* ── Content ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3">
        {!selectedStep && <ProcessPanel />}

        {selectedStep?.type === 'form' && (
          <FormStepPanel step={selectedStep as FormStep} />
        )}
        {selectedStep?.type === 'decision_user' && (
          <DecisionUserPanel step={selectedStep as DecisionUserStep} />
        )}
        {selectedStep?.type === 'decision_sistem' && (
          <DecisionSistemPanel step={selectedStep as DecisionSistemStep} />
        )}
        {selectedStep?.type === 'system_action' && (
          <SystemActionPanel step={selectedStep as SystemActionStep} />
        )}
        {selectedStep?.type === 'end' && (
          <EndStepPanel step={selectedStep as EndStep} />
        )}
      </div>
    </aside>
  )
}

// ── End step panel ───────────────────────────────────────────

function EndStepPanel({ step }: { step: EndStep }) {
  const { updateStep, removeStep } = useWorkflowStore()

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
          Step #
        </label>
        <input
          type="number"
          value={step.number}
          onChange={(e) => updateStep(step.id, { number: parseInt(e.target.value, 10) })}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
        />
      </div>

      <p className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded px-3 py-2">
        Terminal step — no further transitions.
      </p>

      {/* All metadata fields still apply (status, logstart, etc.) */}
      <StepMetaFields step={step} />

      {/* End steps sometimes do have a rollback transition in complex workflows */}
      <TransitionEditor step={step} show={['rollback']} />

      <button
        onClick={() => removeStep(step.id)}
        className="w-full bg-red-50 border border-red-200 text-red-600 rounded px-3 py-1.5 text-sm hover:bg-red-100"
      >
        Delete End Step
      </button>
    </div>
  )
}
