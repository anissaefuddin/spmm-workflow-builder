import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { FormStep } from '../../types/workflow'
import { useWorkflowStore } from '../../store/workflow-store'

interface NodeData {
  step: FormStep
  label: string
  onMainPath?: boolean
}

function FormNode({ data, selected }: NodeProps<NodeData>) {
  const selectStep = useWorkflowStore((s) => s.selectStep)
  const { step, label, onMainPath } = data
  const fieldCount = step.formFields.length

  return (
    <div
      onClick={() => selectStep(step.id)}
      className="cursor-pointer"
      style={{ width: 220 }}
    >
      <div
        className={`
          rounded-xl border-2 bg-white shadow-sm transition-shadow
          ${selected
            ? 'border-blue-600 shadow-blue-200 shadow-lg ring-2 ring-blue-100'
            : onMainPath
            ? 'border-blue-500 shadow-blue-100 shadow-md'
            : 'border-blue-300 hover:border-blue-400 hover:shadow-md'}
        `}
      >
        {/* Header */}
        <div className={`
          px-3 py-1.5 rounded-t-xl flex items-center gap-2
          ${onMainPath ? 'bg-blue-600' : 'bg-blue-50 border-b border-blue-200'}
        `}>
          <span className={`text-xs font-bold uppercase tracking-wide
            ${onMainPath ? 'text-white' : 'text-blue-700'}`}>
            Form
          </span>
          {onMainPath && (
            <span className="text-xs bg-white/20 text-white px-1 rounded">main</span>
          )}
          <span className={`text-xs ml-auto font-mono
            ${onMainPath ? 'text-blue-100' : 'text-blue-400'}`}>
            #{step.number}
          </span>
        </div>

        {/* Body */}
        <div className="px-3 py-2.5">
          <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">{label}</p>
          {step.role && (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-xs text-gray-400">Role:</span>
              <span className="text-xs font-medium text-blue-600 truncate">{step.role}</span>
            </div>
          )}
          {fieldCount > 0 && (
            <div className="mt-1.5">
              <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                {fieldCount} field{fieldCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />
    </div>
  )
}

export default memo(FormNode)
