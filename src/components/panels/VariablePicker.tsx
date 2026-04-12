/**
 * VariablePicker — searchable chip-based variable selector.
 *
 * Shows selected variables as removable chips with a type badge.
 * Provides a search input that filters unselected variables.
 * Pure display component — caller owns the selected list.
 */
import { useState, useRef } from 'react'
import type { WorkflowVariable } from '../../types/workflow'

// ── Type badge colors ─────────────────────────────────────────
const TYPE_CLS: Record<string, string> = {
  String:  'bg-gray-100 text-gray-600',
  Number:  'bg-blue-100 text-blue-700',
  float:   'bg-blue-100 text-blue-700',
  Date:    'bg-green-100 text-green-700',
  Option:  'bg-amber-100 text-amber-700',
  file:    'bg-purple-100 text-purple-700',
}
function typeCls(vtype: string) { return TYPE_CLS[vtype] ?? 'bg-gray-100 text-gray-500' }

// ── Accent themes ──────────────────────────────────────────��──
const ACCENT = {
  blue:   { chip: 'bg-blue-50 border-blue-200 text-blue-800',   remove: 'text-blue-300 hover:text-blue-600', ring: 'focus:ring-blue-400' },
  amber:  { chip: 'bg-amber-50 border-amber-200 text-amber-800', remove: 'text-amber-300 hover:text-amber-600', ring: 'focus:ring-amber-400' },
  gray:   { chip: 'bg-gray-50 border-gray-200 text-gray-700',   remove: 'text-gray-300 hover:text-gray-600', ring: 'focus:ring-gray-400' },
  teal:   { chip: 'bg-teal-50 border-teal-200 text-teal-800',   remove: 'text-teal-300 hover:text-teal-600', ring: 'focus:ring-teal-400' },
}

interface Props {
  /** Currently selected variable names */
  selected: string[]
  /** Pool of all available variables (unselected ones shown in dropdown) */
  available: WorkflowVariable[]
  onAdd: (name: string) => void
  onRemove: (name: string) => void
  accent?: keyof typeof ACCENT
  placeholder?: string
  emptyText?: string
}

export function VariablePicker({
  selected,
  available,
  onAdd,
  onRemove,
  accent = 'blue',
  placeholder = 'Search variables…',
  emptyText = 'No variables available',
}: Props) {
  const [query, setQuery] = useState('')
  const [open,  setOpen]  = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const a = ACCENT[accent]

  const unselected = available.filter(
    (v) => !selected.includes(v.name) &&
           v.name.toLowerCase().includes(query.toLowerCase())
  )

  const handleAdd = (name: string) => {
    onAdd(name)
    setQuery('')
    inputRef.current?.focus()
  }

  return (
    <div className="space-y-1.5">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((name) => {
            const vtype = available.find((v) => v.name === name)?.vtype
            return (
              <span
                key={name}
                className={`inline-flex items-center gap-1 border rounded-full pl-2 pr-1 py-0.5 text-xs font-medium ${a.chip}`}
              >
                <span className="truncate max-w-[120px]" title={name}>{name}</span>
                {vtype && (
                  <span className={`text-[9px] px-1 py-0.5 rounded-full font-bold ${typeCls(vtype)}`}>
                    {vtype}
                  </span>
                )}
                <button
                  onClick={() => onRemove(name)}
                  className={`ml-0.5 font-bold text-sm leading-none ${a.remove}`}
                  title={`Remove ${name}`}
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* Search + dropdown */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className={`w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 ${a.ring}`}
        />

        {open && (
          <div className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
            {unselected.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">
                {available.length === 0 ? emptyText : 'No matching variables'}
              </p>
            ) : (
              unselected.map((v) => (
                <button
                  key={v.name}
                  onMouseDown={() => handleAdd(v.name)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm text-gray-800 flex-1 truncate">{v.name}</span>
                  <span className={`text-[9px] px-1 py-0.5 rounded font-bold shrink-0 ${typeCls(v.vtype)}`}>
                    {v.vtype}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
