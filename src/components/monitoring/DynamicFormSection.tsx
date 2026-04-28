/**
 * DynamicFormSection — renders a custom-vtype variable as a real form
 * (not a single text input).
 *
 * Data is fetched via POST /api/workflow-builder/dynamic-form/get and
 * saved via /dynamic-form/save. Both calls proxy to the existing
 * DynamicFormDataService — no workflow transition is triggered.
 *
 * Hierarchy:
 *   List<Map<String, FormKomponen>>           ← top-level rows (level 1)
 *     where a value with tipe="list" holds    ← level 2 children
 *       List<Map<String, FormKomponen>>
 *         where a child can carry a "level3"  ← level 3 grandchildren
 *           value with tipe="list"
 *
 * Editing:
 *   - Scalar leaves are editable inputs by `tipe`
 *   - readonly=true cells render as read-only
 *   - File cells are read-only here (re-upload needs the cms upload pipeline)
 *   - Add/remove rows is intentionally out of scope for v1
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getDynamicForm,
  saveDynamicForm,
  type FormKomponen,
  type FormRow,
} from '../../services/api'

interface Props {
  classObject: string
  noTiket: string
  /** Variable name driving this section (used as the section title). */
  variableName: string
}

// ─────────────────────────────────────────────────────────────
// Type detection
// ─────────────────────────────────────────────────────────────

function tipeOf(v: FormKomponen | undefined): string {
  return ((v?.tipe ?? '') + '').toLowerCase()
}

function isListCell(v: FormKomponen | undefined): boolean {
  return tipeOf(v) === 'list' && Array.isArray(v?.data)
}

function isFileCell(v: FormKomponen | undefined): boolean {
  return tipeOf(v).includes('file')
}

// ─────────────────────────────────────────────────────────────
// Section
// ─────────────────────────────────────────────────────────────

export function DynamicFormSection({ classObject, noTiket, variableName }: Props) {
  const [open, setOpen]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [rows, setRows]         = useState<FormRow[]>([])
  const [dirty, setDirty]       = useState(false)
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState<string | null>(null)
  const fetched = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await getDynamicForm({ classObject, noTiket })
    setLoading(false)
    if (res.ok) {
      setRows(res.data)
      setDirty(false)
      fetched.current = true
    } else {
      setError(res.error)
    }
  }, [classObject, noTiket])

  // Lazy-load on first open
  useEffect(() => {
    if (open && !fetched.current && !loading) void load()
  }, [open, loading, load])

  const setRowCell = (rowIdx: number, path: (string | number)[], next: FormKomponen) => {
    setRows((prev) => {
      const copy = structuredClone(prev) as FormRow[]
      // Walk the path: even-indexed entries are field names, odd-indexed are array indices.
      let target: any = copy[rowIdx]
      for (let i = 0; i < path.length - 1; i++) {
        target = target[path[i]]
        if (target == null) return prev
      }
      target[path[path.length - 1]] = next
      return copy
    })
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg(null)
    const res = await saveDynamicForm({ classObject, noTiket, payload: rows })
    setSaving(false)
    if (res.ok) {
      setSaveMsg(`Saved ${res.data.saved.length} row${res.data.saved.length === 1 ? '' : 's'}`)
      setRows(res.data.saved)
      setDirty(false)
      setTimeout(() => setSaveMsg(null), 3000)
    } else {
      setSaveMsg(`Error: ${res.error}`)
    }
  }

  return (
    <div className="border border-purple-200 rounded-lg overflow-hidden bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-purple-50 hover:bg-purple-100 transition-colors"
      >
        <span className="text-xs font-mono text-purple-900 flex-1 text-left truncate" title={variableName}>
          {variableName}
        </span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-bold shrink-0" title={classObject}>
          {classObject}
        </span>
        <span className="text-xs text-purple-400 shrink-0">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="p-3 space-y-3">
          {loading && <p className="text-xs text-gray-400 italic">Loading form…</p>}
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 flex items-center gap-2">
              <span className="flex-1">Error: {error}</span>
              <button
                onClick={load}
                className="text-blue-600 hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <p className="text-xs text-gray-400 italic">No rows for this form yet.</p>
          )}

          {!loading && !error && rows.length > 0 && (
            <>
              <div className="space-y-3">
                {rows.map((row, idx) => (
                  <RowCard
                    key={idx}
                    row={row}
                    rowIdx={idx}
                    onChange={(path, next) => setRowCell(idx, path, next)}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2 border-t border-gray-100 pt-2 mt-2">
                <span className="text-xs text-gray-500">
                  {dirty ? 'Unsaved changes' : 'No changes'}
                </span>
                {saveMsg && (
                  <span className={`text-xs ${saveMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                    {saveMsg}
                  </span>
                )}
                <div className="ml-auto flex gap-1.5">
                  <button
                    onClick={load}
                    disabled={loading || saving}
                    className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-40"
                  >
                    Reload
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!dirty || saving}
                    className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Row card — one map<string, FormKomponen>
// ─────────────────────────────────────────────────────────────

function RowCard({
  row,
  rowIdx,
  onChange,
  depth = 0,
}: {
  row: FormRow
  rowIdx: number
  onChange: (path: (string | number)[], next: FormKomponen) => void
  depth?: number
}) {
  const entries = useMemo(() => Object.entries(row), [row])
  const scalars = entries.filter(([, v]) => !isListCell(v))
  const lists   = entries.filter(([, v]) =>  isListCell(v))

  return (
    <div className={`border ${depth === 0 ? 'border-gray-200' : 'border-gray-100'} rounded ${depth === 0 ? 'bg-gray-50' : 'bg-white'} p-2`}>
      {depth === 0 && (
        <div className="text-[10px] text-gray-400 font-semibold mb-1.5">Row #{rowIdx + 1}</div>
      )}

      {/* Scalar fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {scalars.map(([key, cell]) => (
          <ScalarField
            key={key}
            label={key}
            cell={cell}
            onChange={(next) => onChange([key, 'data'], { ...cell, data: next })}
          />
        ))}
      </div>

      {/* Nested list cells */}
      {lists.map(([key, cell]) => {
        const items = (cell.data as FormRow[]) ?? []
        return (
          <div key={key} className="mt-2">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              {key} <span className="text-gray-400 font-normal">({items.length})</span>
            </div>
            <div className="space-y-2 pl-2 border-l-2 border-gray-200">
              {items.length === 0 && (
                <div className="text-[10px] italic text-gray-300">no entries</div>
              )}
              {items.map((child, ci) => (
                <RowCard
                  key={ci}
                  row={child}
                  rowIdx={ci}
                  depth={depth + 1}
                  onChange={(subPath, next) => onChange([key, 'data', ci, ...subPath], next)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Per-cell input
// ─────────────────────────────────────────────────────────────

const READONLY_TIPES = new Set(['uuid'])

function ScalarField({
  label,
  cell,
  onChange,
}: {
  label: string
  cell: FormKomponen
  onChange: (next: unknown) => void
}) {
  const tipe = tipeOf(cell)
  const value = cell.data
  const readOnly = cell.readonly === true || READONLY_TIPES.has(tipe)

  const baseInputCls = `w-full border border-gray-300 rounded px-2 py-1 text-xs ${readOnly ? 'bg-gray-100 text-gray-500' : 'bg-white'} focus:outline-none focus:ring-1 focus:ring-purple-400`

  let control: JSX.Element
  if (isFileCell(cell)) {
    const fname = cell.filename || (typeof value === 'string' ? value : '')
    control = (
      <div className="text-xs text-gray-600 italic flex items-center gap-2">
        <span className="truncate">{fname || '(no file)'}</span>
        <span className="text-[9px] text-gray-400">read-only</span>
      </div>
    )
  } else if (tipe === 'textarea' || tipe === 'text') {
    control = (
      <textarea
        value={(value as string) ?? ''}
        readOnly={readOnly}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        className={baseInputCls}
      />
    )
  } else if (tipe === 'number' || tipe === 'integer' || tipe === 'float' || tipe === 'double') {
    control = (
      <input
        type="number"
        value={(value as number | string | null) ?? ''}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={baseInputCls}
      />
    )
  } else if (tipe === 'date' || tipe === 'datetime') {
    const v = typeof value === 'string' ? value.slice(0, 10) : ''
    control = (
      <input
        type="date"
        value={v}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className={baseInputCls}
      />
    )
  } else if (tipe === 'checkbox' || tipe === 'checkboxfix' || tipe === 'boolean') {
    control = (
      <input
        type="checkbox"
        checked={value === true || value === 'true' || value === 1 || value === '1'}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded"
      />
    )
  } else if (tipe === 'rating') {
    const num = typeof value === 'number' ? value : Number(value) || 0
    control = (
      <input
        type="number"
        min={0}
        max={5}
        step={0.5}
        value={num || ''}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={baseInputCls}
      />
    )
  } else {
    // string / uuid / unknown
    control = (
      <input
        type="text"
        value={(value as string) ?? ''}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className={baseInputCls}
      />
    )
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[10px] font-mono text-gray-600 truncate flex-1" title={label}>
          {label}
        </span>
        <span className="text-[9px] text-gray-400 shrink-0">{tipe || 'string'}</span>
      </div>
      {control}
    </div>
  )
}
