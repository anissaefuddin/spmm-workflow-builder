import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { DecisionUserStep } from '../../types/workflow'
import { useWorkflowStore } from '../../store/workflow-store'

interface NodeData {
  step: DecisionUserStep
  label: string
  onMainPath?: boolean
}

function DecisionUserNode({ data, selected }: NodeProps<NodeData>) {
  const selectStep = useWorkflowStore((s) => s.selectStep)
  const { step, label, onMainPath } = data

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
            ? 'border-amber-600 shadow-amber-200 shadow-lg ring-2 ring-amber-100'
            : onMainPath
            ? 'border-amber-500 shadow-amber-100 shadow-md'
            : 'border-amber-400 hover:border-amber-500 hover:shadow-md'}
        `}
      >
        {/* Header */}
        <div className={`
          px-3 py-1.5 rounded-t-xl flex items-center gap-2
          ${onMainPath ? 'bg-amber-500' : 'bg-amber-50 border-b border-amber-200'}
        `}>
          {/* Diamond icon */}
          <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
            <polygon
              points="6,0 12,6 6,12 0,6"
              fill={onMainPath ? 'white' : '#d97706'}
            />
          </svg>
          <span className={`text-xs font-bold uppercase tracking-wide
            ${onMainPath ? 'text-white' : 'text-amber-700'}`}>
            User Decision
          </span>
          {onMainPath && (
            <span className="text-xs bg-white/20 text-white px-1 rounded">main</span>
          )}
          <span className={`text-xs ml-auto font-mono
            ${onMainPath ? 'text-amber-100' : 'text-amber-500'}`}>
            #{step.number}
          </span>
        </div>

        {/* Body */}
        <div className="px-3 py-2.5">
          <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">
            {label}
          </p>
          {step.role && (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-xs text-gray-400">Role:</span>
              <span className="text-xs font-medium text-amber-600 truncate">{step.role}</span>
            </div>
          )}

          {/* Approve / Reject branch indicators */}
          <div className="flex gap-2 mt-2">
            {step.transitions.true !== undefined && (
              <span className="text-xs bg-green-50 border border-green-200 text-green-700 px-1.5 py-0.5 rounded font-medium">
                ✓ → {step.transitions.true}
              </span>
            )}
            {step.transitions.false !== undefined && (
              <span className="text-xs bg-red-50 border border-red-200 text-red-700 px-1.5 py-0.5 rounded font-medium">
                ✗ → {step.transitions.false}
              </span>
            )}
          </div>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white"
      />
      {/* Two source handles: true (left-ish) and false (right-ish) */}
      <Handle
        id="true"
        type="source"
        position={Position.Bottom}
        style={{ left: '35%' }}
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white"
      />
      <Handle
        id="false"
        type="source"
        position={Position.Bottom}
        style={{ left: '65%' }}
        className="!w-3 !h-3 !bg-red-500 !border-2 !border-white"
      />
    </div>
  )
}

export default memo(DecisionUserNode)
