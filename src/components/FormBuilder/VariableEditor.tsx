/**
 * VariableEditor — inline editor for a single WorkflowVariable.
 * Handles all vtype-specific fields: options list, file template, etc.
 */
import { useWorkflowStore } from '../../store/workflow-store'
import type { WorkflowVariable } from '../../types/workflow'

interface Props {
  variable: WorkflowVariable
}

const VTYPES = ['String', 'Number', 'float', 'Date', 'Option', 'file']
const OPERATORS = ['>', '<', '>=', '<=', '==', '!='] as const

export function VariableEditor({ variable: v }: Props) {
  const { updateVariable, removeVariable } = useWorkflowStore()
  const patch = (p: Partial<WorkflowVariable>) => updateVariable(v.name, p)

  return (
    <div className="space-y-2 pt-2">
      {/* vtype */}
      <Field label="Type">
        <select
          value={v.vtype}
          onChange={(e) => patch({ vtype: e.target.value })}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
        >
          {VTYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          {!VTYPES.includes(v.vtype) && <option value={v.vtype}>{v.vtype} (custom)</option>}
        </select>
      </Field>

      {/* value1 — default/primary value */}
      <Field label={v.vtype === 'Option' ? 'Default Value' : 'Default'}>
        <input
          type={v.vtype === 'Number' || v.vtype === 'float' ? 'number' : 'text'}
          value={v.value1}
          onChange={(e) => patch({ value1: e.target.value, defaultValue: e.target.value })}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
        />
      </Field>

      {/* value2 — options list (only for Option type) */}
      {v.vtype === 'Option' && (
        <Field label="Options (pipe-separated)">
          <input
            type="text"
            value={v.value2 ?? ''}
            onChange={(e) => patch({ value2: e.target.value || undefined })}
            placeholder="Option A|Option B|Option C"
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono"
          />
          {/* Live preview of options */}
          {v.value2 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {v.value2.split('|').map((opt) => (
                <span key={opt} className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded">
                  {opt.trim()}
                </span>
              ))}
            </div>
          )}
        </Field>
      )}

      {/* linkfile — template download (only for file type) */}
      {v.vtype === 'file' && (
        <Field label="Template File Path">
          <input
            type="text"
            value={v.linkfile ?? ''}
            onChange={(e) => patch({ linkfile: e.target.value || undefined })}
            placeholder="template-document/template-name.pdf"
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono"
          />
        </Field>
      )}

      {/* required */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`req-${v.name}`}
          checked={v.required ?? false}
          onChange={(e) => patch({ required: e.target.checked })}
          className="rounded"
        />
        <label htmlFor={`req-${v.name}`} className="text-xs text-gray-600">Required field</label>
      </div>

      {/* Delete */}
      <button
        onClick={() => removeVariable(v.name)}
        className="w-full mt-1 bg-red-50 border border-red-200 text-red-600 rounded px-3 py-1 text-xs hover:bg-red-100"
      >
        Remove Variable
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-0.5">{label}</label>
      {children}
    </div>
  )
}
