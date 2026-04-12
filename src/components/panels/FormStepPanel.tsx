import type { FormStep } from '../../types/workflow'
import { useWorkflowStore } from '../../store/workflow-store'
import { StepMetaFields } from './StepMetaFields'
import { TransitionEditor } from './TransitionEditor'
import { FieldListBuilder } from './FieldListBuilder'
import { DecisionKeyEditor } from './DecisionKeyEditor'
import { StepValidation } from './StepValidation'
import { VariablePicker } from './VariablePicker'

interface Props { step: FormStep }

export function FormStepPanel({ step }: Props) {
  const { updateStep, removeStep, dsl } = useWorkflowStore()
  const variables = dsl?.process.variables ?? []

  // Exclude variables already used in the sibling field to prevent duplicates
  const usedInView  = Object.keys(step.formDataView  ?? {})
  const usedInInput = Object.keys(step.formDataInput ?? {})
  const availableForInput = variables.filter((v) => !usedInView.includes(v.name))
  const availableForView  = variables.filter((v) => !usedInInput.includes(v.name))

  return (
    <div className="space-y-3">

      {/* ── Validation warnings ──────────────────────────────── */}
      <StepValidation step={step} />

      {/* ── Identity ──────────────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="w-20 shrink-0">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
            Step #
          </label>
          <input
            type="number"
            value={step.number}
            onChange={(e) => updateStep(step.id, { number: parseInt(e.target.value, 10) } as Partial<FormStep>)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
            Tahap
          </label>
          <input
            type="text"
            value={step.tahap ?? ''}
            onChange={(e) => updateStep(step.id, { tahap: e.target.value || undefined } as Partial<FormStep>)}
            placeholder="e.g. pengajuan"
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
      </div>

      {/* ── Form Fields ──────────────────────────────────────── */}
      <div className="border border-blue-200 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-blue-50 text-xs font-bold uppercase tracking-wide text-blue-700">
          Form Fields
        </div>
        <div className="px-3 pb-3 pt-2 bg-white">
          <VariablePicker
            selected={step.formFields}
            available={variables}
            onAdd={(name) => {
              if (step.formFields.includes(name)) return
              updateStep(step.id, {
                formFields: [...step.formFields, name],
                formData:   { ...step.formData, [name]: '' },
              } as Partial<FormStep>)
            }}
            onRemove={(name) => {
              const fields = step.formFields.filter((f) => f !== name)
              const data   = { ...step.formData }
              delete data[name]
              updateStep(step.id, { formFields: fields, formData: data } as Partial<FormStep>)
            }}
            accent="blue"
            emptyText="No variables defined in process"
          />
        </div>
      </div>

      {/* ── Data Mappings ────────────────────────────────────── */}
      <div className="border border-blue-200 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-blue-50 text-xs font-bold uppercase tracking-wide text-blue-700">
          Data Mappings
        </div>
        <div className="px-3 pb-3 pt-2 bg-white space-y-4">
          <FieldListBuilder
            label="Input Fields"
            description="Writable fields the user fills in (form_data_input)"
            value={step.formDataInput}
            available={availableForInput}
            onChange={(v) => updateStep(step.id, { formDataInput: v } as Partial<FormStep>)}
            accent="blue"
          />
          <FieldListBuilder
            label="View Fields"
            description="Read-only fields shown for context (form_data_view)"
            value={step.formDataView}
            available={availableForView}
            onChange={(v) => updateStep(step.id, { formDataView: v } as Partial<FormStep>)}
            accent="gray"
          />
        </div>
      </div>

      {/* ── Action Buttons ───────────────────────────────────── */}
      <div className="border border-blue-200 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-blue-50 text-xs font-bold uppercase tracking-wide text-blue-700">
          Action Buttons
        </div>
        <div className="px-3 pb-3 pt-2 bg-white">
          <DecisionKeyEditor
            value={step.decisionKey}
            onChange={(v) => updateStep(step.id, { decisionKey: v } as Partial<FormStep>)}
          />
        </div>
      </div>

      {/* ── Shared metadata ──────────────────────────────────── */}
      <StepMetaFields step={step} />

      {/* ── Transitions ──────────────────────────────────────── */}
      <TransitionEditor step={step} show={['true', 'rollback']} />

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
