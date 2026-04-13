/**
 * VariableEditor — inline editor for a single WorkflowVariable.
 * Handles all vtype-specific fields: options list, file template, etc.
 * Custom types get a full structure inspector (schema from backend or inferred from JSON).
 */
import { useState, useMemo } from 'react'
import { useWorkflowStore } from '../../store/workflow-store'
import { useSettingsStore } from '../../store/settings-store'
import { getVariableSchema } from '../../services/api'
import type { VariableSchemaField } from '../../services/api'
import type { WorkflowVariable } from '../../types/workflow'
import { VariableUsageTracker } from './VariableUsageTracker'
import { analyzeVariableRemoval, hasImpact } from '../../lib/impact-analysis'
import { ImpactModal } from '../panels/ImpactModal'

interface Props {
  variable: WorkflowVariable
}

const STANDARD_VTYPES = ['String', 'Number', 'float', 'Date', 'Option', 'file']

// ── Infer primitive type from a JSON value ────────────────────
function inferJsonFieldType(value: unknown): string {
  if (value === null || value === '') return 'String'
  if (typeof value === 'boolean') return 'Boolean'
  if (typeof value === 'number') return Number.isInteger(value) ? 'Number' : 'float'
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'Date'
    if (/\.(pdf|docx?|xlsx?|png|jpe?g)$/i.test(value)) return 'file'
    return 'String'
  }
  if (Array.isArray(value)) return 'Array'
  if (typeof value === 'object') return 'Object'
  return 'String'
}

// ── Field type badge colors ───────────────────────────────────
const FIELD_TYPE_CLS: Record<string, string> = {
  String:  'bg-gray-100 text-gray-600',
  Number:  'bg-blue-100 text-blue-700',
  float:   'bg-blue-100 text-blue-700',
  Date:    'bg-green-100 text-green-700',
  Boolean: 'bg-purple-100 text-purple-700',
  file:    'bg-orange-100 text-orange-700',
  Object:  'bg-rose-100 text-rose-700',
  Array:   'bg-teal-100 text-teal-700',
}
function fieldTypeCls(t: string) { return FIELD_TYPE_CLS[t] ?? 'bg-gray-100 text-gray-500' }

// ── Custom Type Inspector ─────────────────────────────────────

function CustomTypeInspector({
  variable,
  onPatch,
}: {
  variable: WorkflowVariable
  onPatch: (p: Partial<WorkflowVariable>) => void
}) {
  const backendUrl = useSettingsStore((s) => s.backendUrl)
  const [open, setOpen]       = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchMsg, setFetchMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [serverFields, setServerFields] = useState<VariableSchemaField[] | null>(null)

  // Infer schema from value1 if it parses as a JSON object
  const inferredFields = useMemo<VariableSchemaField[] | null>(() => {
    const raw = variable.value1?.trim()
    if (!raw || !raw.startsWith('{')) return null
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) return null
      return Object.entries(parsed).map(([name, val]) => ({
        name,
        type: inferJsonFieldType(val),
        required: false,
      }))
    } catch {
      return null
    }
  }, [variable.value1])

  const activeFields = serverFields ?? inferredFields
  const schemaSource = serverFields ? 'server' : inferredFields ? 'inferred' : null

  const fetchSchema = async () => {
    if (!backendUrl) {
      setFetchMsg({ ok: false, text: 'No backend URL — open Settings' })
      return
    }
    setFetching(true)
    setFetchMsg(null)
    const res = await getVariableSchema(variable.vtype)
    setFetching(false)
    if (res.ok) {
      setServerFields(res.data.fields)
      setFetchMsg({ ok: true, text: `${res.data.fields.length} fields loaded` })
    } else {
      setFetchMsg({ ok: false, text: 'Schema not found on backend' })
    }
  }

  return (
    <div className="border border-indigo-200 rounded-lg overflow-hidden mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-indigo-50 text-xs font-semibold text-indigo-700 text-left hover:bg-indigo-100 transition-colors"
      >
        <span className="text-indigo-400">◈</span>
        <span className="flex-1">Custom Type Structure</span>
        {activeFields && (
          <span className="text-[10px] bg-indigo-200 text-indigo-700 rounded-full px-1.5 py-0.5 font-bold">
            {activeFields.length} fields
          </span>
        )}
        <span className="text-indigo-300">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-2 bg-white space-y-2">
          {/* Full type name */}
          <div className="bg-indigo-50 rounded px-2 py-1.5">
            <p className="text-[10px] font-semibold text-indigo-400 uppercase mb-0.5">Type ID</p>
            <p className="text-xs font-mono text-indigo-800 break-all">{variable.vtype}</p>
          </div>

          {/* Schema fields */}
          {activeFields ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 mb-1">
                <p className="text-[10px] font-semibold text-gray-400 uppercase">
                  {schemaSource === 'server' ? 'Schema (from server)' : 'Inferred from default value'}
                </p>
                {schemaSource === 'inferred' && (
                  <span className="text-[9px] bg-amber-100 text-amber-600 rounded px-1 py-0.5">auto</span>
                )}
              </div>
              <div className="bg-gray-50 rounded border border-gray-200 divide-y divide-gray-100">
                {activeFields.map((f) => (
                  <div key={f.name} className="flex items-center gap-2 px-2 py-1.5">
                    <span className="text-xs font-mono text-gray-700 flex-1 truncate">{f.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${fieldTypeCls(f.type)}`}>
                      {f.type}
                    </span>
                    {f.required && (
                      <span className="text-[10px] text-red-500 font-bold shrink-0">*</span>
                    )}
                    {f.description && (
                      <span className="text-[10px] text-gray-400 truncate max-w-[80px]" title={f.description}>
                        {f.description}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400 italic bg-gray-50 rounded px-3 py-2">
              No structure inferred. Enter a JSON example in "Default Value" to auto-detect fields,
              or click "Load from backend" below.
            </div>
          )}

          {/* Fetch from backend */}
          <div className="flex items-center gap-2">
            <button
              onClick={fetchSchema}
              disabled={fetching}
              className="text-xs text-indigo-600 border border-indigo-200 rounded px-2 py-1 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {fetching ? '…' : '↓ Load from backend'}
            </button>
            {fetchMsg && (
              <span className={`text-[10px] ${fetchMsg.ok ? 'text-green-600' : 'text-amber-600'}`}>
                {fetchMsg.text}
              </span>
            )}
            {serverFields && (
              <button
                onClick={() => { setServerFields(null); setFetchMsg(null) }}
                className="text-[10px] text-gray-400 hover:text-red-500 ml-auto"
              >
                ✕ clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main editor ───────────────────────────────────────────────

export function VariableEditor({ variable: v }: Props) {
  const { updateVariable, removeVariable } = useWorkflowStore()
  const dsl = useWorkflowStore((s) => s.dsl)
  const [impactReport, setImpactReport] = useState<ReturnType<typeof analyzeVariableRemoval> | null>(null)
  const patch = (p: Partial<WorkflowVariable>) => updateVariable(v.name, p)

  const isCustomType = !STANDARD_VTYPES.includes(v.vtype)

  const handleRemove = () => {
    if (!dsl) { removeVariable(v.name); return }
    const report = analyzeVariableRemoval(v.name, dsl)
    if (hasImpact(report)) {
      setImpactReport(report)
    } else {
      removeVariable(v.name)
    }
  }

  return (
    <div className="space-y-2 pt-2">
      {/* vtype */}
      <Field label="Type">
        <select
          value={v.vtype}
          onChange={(e) => patch({ vtype: e.target.value })}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
        >
          {STANDARD_VTYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          {isCustomType && (
            <option value={v.vtype}>{v.vtype} (custom)</option>
          )}
        </select>
      </Field>

      {/* value1 — JSON textarea for custom, regular input for standard */}
      {isCustomType ? (
        <Field label="Default Value (JSON structure)">
          <textarea
            value={v.value1}
            onChange={(e) => patch({ value1: e.target.value, defaultValue: e.target.value })}
            placeholder={`{"field1": "", "skor": 0, "catatan": ""}`}
            rows={3}
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono resize-y focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <p className="text-[10px] text-gray-400 mt-0.5">
            Enter a JSON example to show field structure below
          </p>
        </Field>
      ) : (
        <Field label={v.vtype === 'Option' ? 'Default Value' : 'Default'}>
          <input
            type={v.vtype === 'Number' || v.vtype === 'float' ? 'number' : 'text'}
            value={v.value1}
            onChange={(e) => patch({ value1: e.target.value, defaultValue: e.target.value })}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </Field>
      )}

      {/* Custom type structure inspector */}
      {isCustomType && (
        <CustomTypeInspector variable={v} onPatch={patch} />
      )}

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

      {/* Usage tracker — shows which steps reference this variable */}
      <VariableUsageTracker variableName={v.name} />

      {/* Delete (with impact analysis guard) */}
      <button
        onClick={handleRemove}
        className="w-full mt-1 bg-red-50 border border-red-200 text-red-600 rounded px-3 py-1 text-xs hover:bg-red-100"
      >
        Remove Variable
      </button>

      {impactReport && (
        <ImpactModal
          report={impactReport}
          onConfirm={() => { removeVariable(v.name); setImpactReport(null) }}
          onCancel={() => setImpactReport(null)}
        />
      )}
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
