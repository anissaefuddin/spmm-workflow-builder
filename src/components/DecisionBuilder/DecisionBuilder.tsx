/**
 * DecisionBuilder — visual builder for decision_sistem conditions.
 * Maps to XML: <variabela>, <operator>, <variabelb>
 * Used inside DecisionSistemPanel when the user has a step selected.
 */
import type { SystemCondition, Operator } from '../../types/workflow'
import { useWorkflowStore } from '../../store/workflow-store'

interface Props {
  stepId: string
  condition: SystemCondition
}

const OPERATORS: { value: Operator; label: string; description: string }[] = [
  { value: '>',  label: '>',  description: 'greater than' },
  { value: '<',  label: '<',  description: 'less than' },
  { value: '>=', label: '≥',  description: 'greater or equal' },
  { value: '<=', label: '≤',  description: 'less or equal' },
  { value: '==', label: '=',  description: 'equals' },
  { value: '!=', label: '≠',  description: 'not equals' },
]

export function DecisionBuilder({ stepId, condition }: Props) {
  const { dsl, updateStep } = useWorkflowStore()
  const variables = dsl?.process.variables ?? []

  const patch = (p: Partial<SystemCondition>) =>
    updateStep(stepId, { condition: { ...condition, ...p } } as never)

  const preview = condition.variableA
    ? `${condition.variableA || '?'} ${condition.operator} ${condition.variableB || '?'}`
    : null

  return (
    <div className="space-y-3">
      {/* Title */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase mb-2">Condition Builder</p>
        <p className="text-xs text-gray-400">
          Evaluated automatically by the system — no user interaction required.
        </p>
      </div>

      {/* Variable A */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Variable A (left)</label>
        <select
          value={condition.variableA}
          onChange={(e) => patch({ variableA: e.target.value })}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="">— select variable —</option>
          {variables.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.vtype})
            </option>
          ))}
        </select>
      </div>

      {/* Operator */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Operator</label>
        <div className="grid grid-cols-3 gap-1">
          {OPERATORS.map((op) => (
            <button
              key={op.value}
              onClick={() => patch({ operator: op.value })}
              title={op.description}
              className={`
                border rounded py-1.5 text-sm font-mono font-bold transition-colors
                ${condition.operator === op.value
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-gray-300 hover:border-gray-400 text-gray-600'}
              `}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      {/* Variable B */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Variable B (right)</label>
        <select
          value={condition.variableB}
          onChange={(e) => patch({ variableB: e.target.value })}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="">— select variable —</option>
          {variables.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.vtype})
            </option>
          ))}
        </select>
      </div>

      {/* Live preview */}
      {preview && (
        <div className="bg-purple-50 border border-purple-200 rounded p-2">
          <p className="text-xs text-purple-600 font-medium mb-0.5">Condition preview</p>
          <code className="text-sm font-mono text-purple-800">{preview}</code>
          <p className="text-xs text-purple-400 mt-1">
            Maps to XML: &lt;variabela&gt;, &lt;operator&gt;, &lt;variabelb&gt;
          </p>
        </div>
      )}
    </div>
  )
}
