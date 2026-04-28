/**
 * VariableFormEditor — type-aware form for viewing and editing
 * wf_process_variable rows of a ticket WITHOUT triggering any
 * workflow step transition.
 *
 * Persists via the existing POST /api/workflow-builder/propagate-variables
 * endpoint, which only updates variable_value1 / updated_at.
 *
 * Field mapping:
 *   - Option       → <select> from value2 ("Ya|Revisi Data" or "Ya/Yes|...")
 *   - Number/float → <input type="number">
 *   - Date         → <input type="date"> (round-trip yyyy-MM-dd, dd-MM-yyyy, dd/MM/yyyy)
 *   - file         → read-only with View/Download (replace requires the
 *                    full upload pipeline which is out of scope here)
 *   - String/other → <textarea> if long, else <input type="text">
 */
import { useMemo, useState } from 'react'
import { propagateVariables, resolveFileUrl } from '../../services/api'
import type { VariableSnapshot } from '../../types/monitor'
import { DynamicFormSection } from './DynamicFormSection'

interface Props {
  noTiket: string
  variables: VariableSnapshot[]
  onSaved?: () => void
}

const TYPE_CLS: Record<string, string> = {
  String:  'bg-gray-100 text-gray-600',
  Number:  'bg-blue-100 text-blue-700',
  float:   'bg-blue-100 text-blue-700',
  Date:    'bg-green-100 text-green-700',
  Option:  'bg-amber-100 text-amber-700',
  file:    'bg-purple-100 text-purple-700',
}

function typeBadgeCls(vtype: string) {
  return TYPE_CLS[vtype] ?? 'bg-gray-100 text-gray-500'
}

function isFileType(vtype: string) {
  const t = (vtype ?? '').toLowerCase()
  return t === 'file' || t === 'multiple_file' || t === 'multiplefile' || t.includes('file')
}

function isOptionType(vtype: string) {
  return (vtype ?? '').toLowerCase() === 'option'
}

function isNumberType(vtype: string) {
  const t = (vtype ?? '').toLowerCase()
  return t === 'number' || t === 'float' || t === 'integer' || t === 'double'
}

function isDateType(vtype: string) {
  return (vtype ?? '').toLowerCase() === 'date'
}

/**
 * "Custom" vtypes are anything not in the known scalar/file set.
 * They map 1:1 to a wf_custom_variabel.class_object and are rendered
 * with DynamicFormSection (multi-row, multi-level form).
 */
const KNOWN_SCALAR_TYPES = new Set([
  'string', 'text', 'textarea',
  'number', 'integer', 'float', 'double',
  'date', 'datetime',
  'option', 'select',
  'boolean', 'checkbox', 'checkboxfix', 'rating',
  'uuid',
])

function isCustomType(vtype: string) {
  const t = (vtype ?? '').toLowerCase()
  if (!t) return false
  if (KNOWN_SCALAR_TYPES.has(t)) return false
  if (isFileType(vtype)) return false
  return true
}

/** Parse `value2` from an Option variable into [{value, label}]. */
function parseOptions(value2: string | null): { value: string; label: string }[] {
  if (!value2) return []
  return value2.split('|').map((seg) => {
    const trimmed = seg.trim()
    if (trimmed.includes('/')) {
      const [v, l] = trimmed.split('/')
      return { value: v.trim(), label: (l ?? v).trim() }
    }
    return { value: trimmed, label: trimmed }
  })
}

/** Convert any of the common stored formats to yyyy-MM-dd for <input type=date>. */
function toDateInputValue(v: string): string {
  if (!v) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  const m = v.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return ''
}

export function VariableFormEditor({ noTiket, variables, onSaved }: Props) {
  // Initial values come from props; user edits live in `edits`.
  const initial = useMemo(() => {
    const m = new Map<string, string>()
    for (const v of variables) m.set(v.name, v.value1 ?? '')
    return m
  }, [variables])

  const [edits, setEdits]       = useState<Map<string, string>>(new Map())
  const [filter, setFilter]     = useState('')
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState<string | null>(null)

  const dirty = edits.size > 0

  const setEdit = (name: string, value: string) => {
    setEdits((prev) => {
      const next = new Map(prev)
      const original = initial.get(name) ?? ''
      if (value === original) next.delete(name)
      else next.set(name, value)
      return next
    })
  }

  const reset = () => {
    setEdits(new Map())
    setSaveMsg(null)
  }

  const save = async () => {
    if (!dirty) return
    setSaving(true)
    setSaveMsg(null)
    const payload: Record<string, string> = {}
    edits.forEach((v, k) => { payload[k] = v })
    const res = await propagateVariables(noTiket, payload)
    setSaving(false)
    if (res.ok) {
      setSaveMsg(`Saved ${res.data.updated} variable${res.data.updated === 1 ? '' : 's'}`)
      setEdits(new Map())
      setTimeout(() => setSaveMsg(null), 3000)
      onSaved?.()
    } else {
      setSaveMsg(`Error: ${res.error}`)
    }
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return variables
    return variables.filter((v) =>
      v.name.toLowerCase().includes(q) || (v.value1 ?? '').toLowerCase().includes(q)
    )
  }, [variables, filter])

  // Split into scalar vs custom-type. Custom-type variables get rendered
  // as DynamicFormSection (multi-row, multi-level). Scalars stay in the
  // existing grid above so simple Option/Date/file fields look the same.
  const scalarVars = useMemo(() => filtered.filter((v) => !isCustomType(v.vtype)), [filtered])
  const customVars = useMemo(() => filtered.filter((v) =>  isCustomType(v.vtype)), [filtered])

  if (variables.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
        <p className="text-xs text-gray-400 italic">No variables for this ticket</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header + actions */}
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Variable Form Editor
        </p>
        <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 font-medium">
          {variables.length}
        </span>
        <span className="text-[10px] text-indigo-600 ml-auto">
          Saves directly to wf_process_variable · does not advance workflow
        </span>
      </div>

      {/* Filter */}
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name or value…"
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />

      {/* Scalar fields */}
      {scalarVars.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {scalarVars.map((v) => {
            const current = edits.has(v.name) ? edits.get(v.name)! : (v.value1 ?? '')
            const changed = edits.has(v.name)
            return (
              <div key={v.name} className={`px-3 py-2 ${changed ? 'bg-indigo-50/40' : ''}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-gray-700 flex-1 truncate" title={v.name}>
                    {v.name}
                  </span>
                  {changed && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold shrink-0">
                      EDITED
                    </span>
                  )}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${typeBadgeCls(v.vtype)}`}>
                    {v.vtype}
                  </span>
                </div>
                <FieldControl
                  variable={v}
                  value={current}
                  onChange={(nv) => setEdit(v.name, nv)}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Custom-type variables → real dynamic forms */}
      {customVars.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">
            Dynamic forms ({customVars.length})
          </p>
          {customVars.map((v) => (
            <DynamicFormSection
              key={v.name}
              variableName={v.name}
              classObject={v.vtype}
              noTiket={noTiket}
            />
          ))}
        </div>
      )}

      {/* Sticky action bar */}
      <div className="sticky bottom-0 bg-white pt-2 -mx-1 px-1">
        <div className="flex items-center gap-2 border-t border-gray-100 pt-2">
          <span className="text-xs text-gray-500">
            {dirty ? `${edits.size} pending change${edits.size === 1 ? '' : 's'}` : 'No changes'}
          </span>
          {saveMsg && (
            <span className={`text-xs ${saveMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {saveMsg}
            </span>
          )}
          <div className="ml-auto flex gap-1.5">
            <button
              onClick={reset}
              disabled={!dirty || saving}
              className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reset
            </button>
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Per-field input
// ─────────────────────────────────────────────────────────────

function FieldControl({
  variable: v,
  value,
  onChange,
}: {
  variable: VariableSnapshot
  value: string
  onChange: (v: string) => void
}) {
  if (isFileType(v.vtype)) {
    return <FileFieldReadOnly variable={v} />
  }

  if (isOptionType(v.vtype)) {
    const options = parseOptions(v.value2)
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
      >
        <option value="">— select —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )
  }

  if (isDateType(v.vtype)) {
    const dateValue = toDateInputValue(value)
    return (
      <input
        type="date"
        value={dateValue}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
    )
  }

  if (isNumberType(v.vtype)) {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
    )
  }

  // Default: text or textarea (auto-grow for long content)
  const isLong = (value?.length ?? 0) > 80 || (value ?? '').includes('\n')
  if (isLong) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.min(8, Math.max(2, value.split('\n').length))}
        className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
    )
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
    />
  )
}

// ─────────────────────────────────────────────────────────────
// Read-only file display (replacement requires the full upload pipeline)
// ─────────────────────────────────────────────────────────────

function FileFieldReadOnly({ variable: v }: { variable: VariableSnapshot }) {
  const [fileUrl, setFileUrl]       = useState<string | null>(null)
  const [fileName, setFileName]     = useState<string | null>(null)
  const [previewable, setPreviewable] = useState(false)
  const [loading, setLoading]       = useState(false)

  const filePath = v.value2 || v.value1
  const displayName = v.value1 || v.value2 || '(no file)'

  const handleResolve = async () => {
    if (!filePath) return
    setLoading(true)
    const res = await resolveFileUrl(filePath)
    setLoading(false)
    if (res.ok) {
      setFileUrl(res.data.url)
      setFileName(res.data.fileName)
      setPreviewable(res.data.previewable)
    }
  }

  if (!filePath || filePath.trim() === '') {
    return <span className="text-gray-300 text-xs italic">(no file uploaded)</span>
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-700 truncate flex-1" title={displayName}>
        {displayName}
      </span>
      {!fileUrl ? (
        <button
          onClick={handleResolve}
          disabled={loading}
          className="text-[10px] text-blue-500 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50 disabled:opacity-40 shrink-0"
        >
          {loading ? '…' : 'Load URL'}
        </button>
      ) : (
        <div className="flex items-center gap-1 shrink-0">
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50"
          >
            View
          </a>
          <a
            href={fileUrl}
            download={fileName ?? undefined}
            className="text-[10px] text-green-600 border border-green-200 rounded px-1.5 py-0.5 hover:bg-green-50"
          >
            Download
          </a>
          {previewable && (
            <span className="text-[10px] text-purple-500 italic">previewable</span>
          )}
        </div>
      )}
      <span className="text-[9px] text-gray-400 italic shrink-0">read-only</span>
    </div>
  )
}
