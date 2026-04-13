/**
 * CustomVariableManager — browse and inspect custom variable type schemas.
 *
 * Reads from GET /custom-types and GET /variable-schema/{type}.
 * Shows which DSL variables use each custom type.
 * Read-only — does not modify wf_custom_variabel.
 */
import { useState, useEffect, useCallback } from 'react'
import { useSettingsStore } from '../../store/settings-store'
import { useWorkflowStore } from '../../store/workflow-store'
import { apiGet } from '../../services/apiClient'
import { getVariableSchema } from '../../services/api'
import type { VariableSchemaField } from '../../services/api'

const FIELD_TYPE_CLS: Record<string, string> = {
  string:  'bg-gray-100 text-gray-600',
  integer: 'bg-blue-100 text-blue-700',
  uuid:    'bg-purple-100 text-purple-700',
  boolean: 'bg-green-100 text-green-700',
  float:   'bg-teal-100 text-teal-700',
}
function fieldCls(t: string) { return FIELD_TYPE_CLS[t] ?? 'bg-gray-100 text-gray-500' }

export function CustomVariableManager() {
  const backendUrl = useSettingsStore((s) => s.backendUrl)
  const dsl        = useWorkflowStore((s) => s.dsl)

  const [types, setTypes]       = useState<string[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [schema, setSchema]     = useState<VariableSchemaField[] | null>(null)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [search, setSearch]     = useState('')

  const loadTypes = useCallback(async () => {
    if (!backendUrl) { setError('No backend URL'); return }
    setLoading(true)
    setError(null)
    const res = await apiGet<string[]>('/custom-types')
    setLoading(false)
    if (res.ok) setTypes(res.data)
    else setError(res.error)
  }, [backendUrl])

  useEffect(() => { void loadTypes() }, [loadTypes])

  const selectType = async (vtype: string) => {
    if (selected === vtype) { setSelected(null); setSchema(null); return }
    setSelected(vtype)
    setSchema(null)
    setSchemaLoading(true)
    const res = await getVariableSchema(vtype)
    setSchemaLoading(false)
    if (res.ok) setSchema(res.data.fields)
    else setSchema(null)
  }

  // Find DSL variables that use each custom type
  const usageMap = new Map<string, string[]>()
  if (dsl) {
    for (const v of dsl.process.variables) {
      if (!usageMap.has(v.vtype)) usageMap.set(v.vtype, [])
      usageMap.get(v.vtype)!.push(v.name)
    }
  }

  const filtered = search.trim()
    ? types.filter((t) => t.toLowerCase().includes(search.toLowerCase()))
    : types

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">Custom Variable Types</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          {types.length} registered type{types.length !== 1 ? 's' : ''} (from wf_custom_variabel)
        </p>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-gray-100">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search types..."
          className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
        />
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">
          {error}
          <button onClick={loadTypes} className="ml-2 text-blue-600 hover:underline">Retry</button>
        </div>
      )}

      {loading && (
        <div className="px-4 py-6 text-xs text-gray-400 text-center">Loading custom types...</div>
      )}

      {/* Type list */}
      <div className="flex-1 overflow-y-auto">
        {!loading && filtered.length === 0 && (
          <p className="px-4 py-6 text-xs text-gray-400 italic text-center">
            {types.length === 0 ? 'No custom types found' : 'No matching types'}
          </p>
        )}

        {filtered.map((vtype) => {
          const isSelected = selected === vtype
          const usage = usageMap.get(vtype) ?? []
          return (
            <div key={vtype} className="border-b border-gray-100">
              {/* Type header */}
              <button
                onClick={() => selectType(vtype)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors
                  ${isSelected ? 'bg-indigo-50' : ''}`}
              >
                <span className="text-indigo-500 text-xs shrink-0">◈</span>
                <span className="text-xs font-mono text-gray-800 flex-1 truncate" title={vtype}>
                  {vtype}
                </span>
                {usage.length > 0 && (
                  <span className="text-[10px] bg-blue-100 text-blue-600 rounded-full px-1.5 py-0.5 shrink-0">
                    {usage.length} var{usage.length !== 1 ? 's' : ''}
                  </span>
                )}
                <span className={`text-xs text-gray-400 transition-transform ${isSelected ? 'rotate-180' : ''}`}>▾</span>
              </button>

              {/* Expanded detail */}
              {isSelected && (
                <div className="px-4 pb-3 bg-indigo-50/50 border-t border-indigo-100 space-y-3">
                  {/* Schema fields */}
                  {schemaLoading ? (
                    <p className="text-xs text-gray-400 py-2">Loading schema...</p>
                  ) : schema ? (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase mt-2 mb-1">
                        Fields ({schema.length})
                      </p>
                      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                        {schema.map((f) => (
                          <div key={f.name} className="px-3 py-1.5 flex items-center gap-2">
                            <span className="text-xs font-mono text-gray-700 flex-1 truncate">{f.name}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${fieldCls(f.type)}`}>
                              {f.type}
                            </span>
                            {f.required && <span className="text-[9px] text-red-500 font-bold">*</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-600 italic py-2">
                      Schema not available — endpoint may not exist
                    </p>
                  )}

                  {/* DSL usage */}
                  {usage.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">
                        Used by variables
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {usage.map((name) => (
                          <span
                            key={name}
                            className="text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded px-2 py-0.5 font-mono"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
