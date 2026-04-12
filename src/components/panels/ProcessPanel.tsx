import { useState } from 'react'
import { useWorkflowStore } from '../../store/workflow-store'

export function ProcessPanel() {
  const { dsl, setProcessName, setRoleStart, addRole, removeRole, addVariable, removeVariable, updateVariable } =
    useWorkflowStore()
  const [newRole, setNewRole] = useState('')
  const [newVarName, setNewVarName] = useState('')
  const [newVarDefault, setNewVarDefault] = useState('')

  if (!dsl) return null

  const { process } = dsl

  return (
    <div className="space-y-5">
      {/* Process Name */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Process Name</label>
        <input
          type="text"
          value={process.name}
          onChange={(e) => setProcessName(e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
        />
      </div>

      {/* Role Start */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Role Start</label>
        <input
          type="text"
          value={process.roleStart ?? ''}
          onChange={(e) => setRoleStart(e.target.value)}
          placeholder="e.g. user"
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
        />
        <p className="text-xs text-gray-400 mt-1">Maps to &lt;rolestart&gt; in XML</p>
      </div>

      {/* Roles */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Roles</label>
        <div className="space-y-1 mb-2">
          {process.roles.map((r) => (
            <div key={r.name} className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1 border border-gray-200">
              <span className="text-sm flex-1 font-medium">{r.name}</span>
              <button
                onClick={() => removeRole(r.name)}
                className="text-red-400 hover:text-red-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>
          ))}
          {process.roles.length === 0 && (
            <p className="text-xs text-gray-400 italic">No roles defined</p>
          )}
        </div>
        <div className="flex gap-1">
          <input
            type="text"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { addRole(newRole.trim()); setNewRole('') }
            }}
            placeholder="Role name"
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
          />
          <button
            onClick={() => { addRole(newRole.trim()); setNewRole('') }}
            className="bg-gray-700 text-white rounded px-2 py-1 text-sm hover:bg-gray-800"
          >
            Add
          </button>
        </div>
      </div>

      {/* Variables */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Variables</label>
        <div className="space-y-1 mb-2">
          {process.variables.map((v) => (
            <div key={v.name} className="flex items-center gap-1 bg-gray-50 rounded px-2 py-1 border border-gray-200">
              <span className="text-sm font-mono font-medium text-gray-700 w-28 truncate">{v.name}</span>
              <span className="text-gray-300 text-xs">=</span>
              <input
                type="text"
                value={v.defaultValue}
                onChange={(e) => updateVariable(v.name, { defaultValue: e.target.value })}
                placeholder="default"
                className="flex-1 border-0 bg-transparent text-xs text-gray-500 focus:outline-none"
              />
              <button
                onClick={() => removeVariable(v.name)}
                className="text-red-400 hover:text-red-600 text-xs font-bold ml-1"
              >
                ✕
              </button>
            </div>
          ))}
          {process.variables.length === 0 && (
            <p className="text-xs text-gray-400 italic">No variables defined</p>
          )}
        </div>
        <div className="flex gap-1">
          <input
            type="text"
            value={newVarName}
            onChange={(e) => setNewVarName(e.target.value)}
            placeholder="var name"
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm font-mono"
          />
          <input
            type="text"
            value={newVarDefault}
            onChange={(e) => setNewVarDefault(e.target.value)}
            placeholder="default"
            className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
          />
          <button
            onClick={() => {
              const n = newVarName.trim()
              if (!n) return
              addVariable(n, newVarDefault)
              setNewVarName('')
              setNewVarDefault('')
            }}
            className="bg-gray-700 text-white rounded px-2 py-1 text-sm hover:bg-gray-800"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
