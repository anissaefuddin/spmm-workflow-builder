/**
 * FormBuilder — visual editor for <variabel> definitions
 * Supports all vtype values found in spme-mahadaly.xml:
 *   String, Number, float, Date, Option, file, custom
 */
import { useState } from 'react'
import { useWorkflowStore } from '../../store/workflow-store'
import type { WorkflowVariable } from '../../types/workflow'
import { VariableEditor } from './VariableEditor'
import { CustomVariableManager } from './CustomVariableManager'

type SubTab = 'variables' | 'custom-types'

export function FormBuilder() {
  const { dsl, addVariable } = useWorkflowStore()
  const [newName, setNewName]   = useState('')
  const [newVtype, setNewVtype] = useState('String')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [subTab, setSubTab]     = useState<SubTab>('variables')

  if (!dsl) return null
  const { variables } = dsl.process

  const VTYPES = ['String', 'Number', 'float', 'Date', 'Option', 'file']

  // Custom Types sub-tab
  if (subTab === 'custom-types') {
    return (
      <div className="flex flex-col h-full">
        <SubTabs active={subTab} onChange={setSubTab} varCount={variables.length} />
        <CustomVariableManager />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <SubTabs active={subTab} onChange={setSubTab} varCount={variables.length} />

      {/* Variable list */}
      <div className="flex-1 overflow-y-auto">
        {variables.length === 0 && (
          <p className="px-4 py-6 text-xs text-gray-400 italic text-center">No variables defined yet</p>
        )}
        {variables.map((v) => (
          <div key={v.name} className="border-b border-gray-100">
            {/* Collapsed header */}
            <button
              onClick={() => setExpanded(expanded === v.name ? null : v.name)}
              className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 text-left"
            >
              <VtypeBadge vtype={v.vtype} />
              <span className="text-sm font-mono font-medium text-gray-800 flex-1 truncate">{v.name}</span>
              {v.required && (
                <span className="text-xs text-red-500 font-bold">*</span>
              )}
              <span className={`text-xs text-gray-400 transition-transform ${expanded === v.name ? 'rotate-180' : ''}`}>▾</span>
            </button>

            {/* Expanded editor */}
            {expanded === v.name && (
              <div className="px-4 pb-3 bg-gray-50 border-t border-gray-100">
                <VariableEditor variable={v} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new variable */}
      <div className="border-t border-gray-200 p-3 bg-white space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase">Add Variable</p>
        <div className="flex gap-1">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
            }}
            placeholder="variable_name"
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm font-mono"
          />
          <select
            value={newVtype}
            onChange={(e) => setNewVtype(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            {VTYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            onClick={handleAdd}
            className="bg-blue-600 text-white rounded px-3 py-1 text-sm hover:bg-blue-700"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )

  function handleAdd() {
    const name = newName.trim()
    if (!name) return
    addVariable(name, '')
    // After adding, we need to also set vtype — do via updateVariable
    useWorkflowStore.getState().updateVariable(name, { vtype: newVtype, value1: '', defaultValue: '' })
    setNewName('')
    setExpanded(name)
  }
}

// ── VtypeBadge ────────────────────────────────────────────────

const VTYPES_STANDARD = ['String', 'Number', 'float', 'Date', 'Option', 'file']

const VTYPE_COLORS: Record<string, string> = {
  String:  'bg-blue-100 text-blue-700',
  Number:  'bg-green-100 text-green-700',
  float:   'bg-teal-100 text-teal-700',
  Date:    'bg-purple-100 text-purple-700',
  Option:  'bg-amber-100 text-amber-700',
  file:    'bg-orange-100 text-orange-700',
}

function VtypeBadge({ vtype }: { vtype: string }) {
  const isCustom = !VTYPES_STANDARD.includes(vtype)
  if (isCustom) {
    return (
      <span
        className="text-xs px-1.5 py-0.5 rounded font-mono font-medium bg-indigo-100 text-indigo-700 flex items-center gap-0.5"
        title={vtype}
      >
        <span>◈</span>
        <span className="max-w-[64px] truncate">{vtype}</span>
      </span>
    )
  }
  const cls = VTYPE_COLORS[vtype] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-mono font-medium ${cls}`}>
      {vtype}
    </span>
  )
}

// ── Sub-tab switcher ──────────────────────────────────────────

function SubTabs({
  active, onChange, varCount,
}: {
  active: SubTab; onChange: (t: SubTab) => void; varCount: number
}) {
  return (
    <div className="flex border-b border-gray-200 bg-gray-50 shrink-0">
      <button
        onClick={() => onChange('variables')}
        className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wide transition-colors
          ${active === 'variables'
            ? 'text-blue-600 border-b-2 border-blue-500 bg-white'
            : 'text-gray-500 hover:text-gray-700'}`}
      >
        Variables ({varCount})
      </button>
      <button
        onClick={() => onChange('custom-types')}
        className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wide transition-colors
          ${active === 'custom-types'
            ? 'text-indigo-600 border-b-2 border-indigo-500 bg-white'
            : 'text-gray-500 hover:text-gray-700'}`}
      >
        ◈ Custom Types
      </button>
    </div>
  )
}
