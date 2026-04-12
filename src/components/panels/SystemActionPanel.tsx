/**
 * SystemActionPanel — property panel for system_action steps.
 *
 * Fields: rawType, inputVariable, viewVariable,
 *         all StepMetaFields (title, role, status, grup, statustiket, logs),
 *         transitions
 */
import type { SystemActionStep } from '../../types/workflow'
import { useWorkflowStore } from '../../store/workflow-store'
import { StepMetaFields } from './StepMetaFields'
import { TransitionEditor } from './TransitionEditor'

interface Props { step: SystemActionStep }

function Field({
  label, value, onChange, placeholder, mono, readOnly,
}: {
  label: string; value: string; onChange?: (v: string) => void
  placeholder?: string; mono?: boolean; readOnly?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        readOnly={readOnly}
        placeholder={placeholder}
        className={`w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400
          ${readOnly ? 'bg-gray-50 text-gray-500 cursor-default' : ''}
          ${mono ? 'font-mono' : ''}
        `}
      />
    </div>
  )
}

export function SystemActionPanel({ step }: Props) {
  const { updateStep, removeStep } = useWorkflowStore()

  return (
    <div className="space-y-3">

      {/* ── Step number (read-only) ─────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
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
        <div className="shrink-0">
          <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">&nbsp;</span>
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-teal-100 text-teal-700 border border-teal-200">
            system
          </span>
        </div>
      </div>

      {/* ── System action type ──────────────────────────────── */}
      <div className="border border-teal-200 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-teal-50 text-xs font-bold uppercase tracking-wide text-teal-700">
          Action Type
        </div>
        <div className="px-3 pb-3 pt-2 space-y-2.5 bg-white">
          <Field
            label="Raw Type"
            value={step.rawType}
            onChange={(v) => updateStep(step.id, { rawType: v } as Partial<SystemActionStep>)}
            placeholder="e.g. system_update_data"
            mono
          />
          <p className="text-xs text-gray-400">
            This is the &lt;type&gt; value written back to XML. Must start with <code>system_</code>.
          </p>
        </div>
      </div>

      {/* ── Variable wiring ────────────────────────────────── */}
      <div className="border border-teal-200 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-teal-50 text-xs font-bold uppercase tracking-wide text-teal-700">
          Variables
        </div>
        <div className="px-3 pb-3 pt-2 space-y-2.5 bg-white">
          <Field
            label="Input Variable (form_data_input)"
            value={step.inputVariable ?? ''}
            onChange={(v) => updateStep(step.id, { inputVariable: v || undefined } as Partial<SystemActionStep>)}
            placeholder="Variable name written by this step"
            mono
          />
          <Field
            label="View Variable (form_data_view)"
            value={step.viewVariable ?? ''}
            onChange={(v) => updateStep(step.id, { viewVariable: v || undefined } as Partial<SystemActionStep>)}
            placeholder="Variable name read by this step"
            mono
          />
        </div>
      </div>

      {/* ── Shared metadata ────────────────────────────────── */}
      <StepMetaFields step={step} />

      {/* ── Transitions ────────────────────────────────────── */}
      <TransitionEditor step={step} show={['true', 'false', 'rollback']} />

      {/* ── Delete ─────────────────────────────────────────── */}
      <button
        onClick={() => removeStep(step.id)}
        className="w-full bg-red-50 border border-red-200 text-red-600 rounded px-3 py-1.5 text-sm hover:bg-red-100"
      >
        Delete Step
      </button>
    </div>
  )
}
