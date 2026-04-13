/**
 * ButtonMapEditor — editor for wf_button_map entries.
 *
 * Configures action buttons per role for a given step.
 * Data stored in DSL as process.buttonMap[] and synced
 * to wf_button_map on publish.
 */
import { useState } from 'react'
import { useWorkflowStore } from '../../store/workflow-store'
import type { ButtonMapEntry } from '../../types/workflow'

interface Props {
  /** Current step number — used as stepCondition filter */
  stepNumber: number
}

export function ButtonMapEditor({ stepNumber }: Props) {
  const dsl       = useWorkflowStore((s) => s.dsl)
  const updateDSL = useWorkflowStore((s) => s.loadDSL)
  const [adding, setAdding] = useState(false)

  if (!dsl) return null

  const allButtons = dsl.process.buttonMap ?? []
  const roles      = dsl.process.roles

  // Filter buttons relevant to this step
  const stepButtons = allButtons.filter(
    (b) => b.stepCondition === String(stepNumber),
  )

  const updateButtons = (updated: ButtonMapEntry[]) => {
    // Replace only entries for this step; keep others
    const others = allButtons.filter((b) => b.stepCondition !== String(stepNumber))
    updateDSL({
      ...dsl,
      process: { ...dsl.process, buttonMap: [...others, ...updated] },
    })
  }

  const addButton = (roleCode: string) => {
    updateButtons([
      ...stepButtons,
      {
        roleCode,
        buttonLabel: '',
        buttonUrl: '',
        stepCondition: String(stepNumber),
      },
    ])
    setAdding(false)
  }

  const updateEntry = (index: number, patch: Partial<ButtonMapEntry>) => {
    const updated = stepButtons.map((b, i) => (i === index ? { ...b, ...patch } : b))
    updateButtons(updated)
  }

  const removeEntry = (index: number) => {
    updateButtons(stepButtons.filter((_, i) => i !== index))
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-700">
          Button Config
        </span>
        <span className="text-[10px] text-gray-400">
          {stepButtons.length} button{stepButtons.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="px-3 pb-3 pt-2 bg-white space-y-2">
        {stepButtons.length === 0 && !adding && (
          <p className="text-xs text-gray-400 italic">
            No custom buttons configured for this step.
          </p>
        )}

        {stepButtons.map((btn, i) => (
          <div
            key={i}
            className="border border-gray-100 rounded-lg p-2 space-y-1.5 bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">
                {btn.roleCode || '(no role)'}
              </span>
              <button
                onClick={() => removeEntry(i)}
                className="text-[10px] text-red-400 hover:text-red-600"
              >
                remove
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="block text-[10px] text-gray-500">Label</label>
                <input
                  type="text"
                  value={btn.buttonLabel}
                  onChange={(e) => updateEntry(i, { buttonLabel: e.target.value })}
                  placeholder="e.g. Approve"
                  className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500">URL</label>
                <input
                  type="text"
                  value={btn.buttonUrl}
                  onChange={(e) => updateEntry(i, { buttonUrl: e.target.value })}
                  placeholder="/api/action"
                  className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono"
                />
              </div>
            </div>
            {/* Role selector */}
            <div>
              <label className="block text-[10px] text-gray-500">Role</label>
              <select
                value={btn.roleCode}
                onChange={(e) => updateEntry(i, { roleCode: e.target.value })}
                className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs"
              >
                <option value="">— any role —</option>
                {roles.map((r) => (
                  <option key={r.name} value={r.name}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>
        ))}

        {/* Add button UI */}
        {adding ? (
          <div className="flex gap-1">
            <select
              onChange={(e) => { if (e.target.value) addButton(e.target.value) }}
              className="flex-1 border border-gray-300 rounded px-1.5 py-1 text-xs"
              defaultValue=""
            >
              <option value="">— pick role —</option>
              {roles.map((r) => (
                <option key={r.name} value={r.name}>{r.name}</option>
              ))}
              <option value="">Any role</option>
            </select>
            <button
              onClick={() => setAdding(false)}
              className="text-xs text-gray-400 hover:text-gray-600 px-2"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => roles.length > 0 ? setAdding(true) : addButton('')}
            className="w-full text-xs text-blue-600 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50"
          >
            + Add Button
          </button>
        )}

        <p className="text-[10px] text-gray-400">
          Buttons are synced to wf_button_map on publish.
        </p>
      </div>
    </div>
  )
}
