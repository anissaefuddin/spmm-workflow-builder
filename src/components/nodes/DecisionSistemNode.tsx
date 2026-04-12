import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { DecisionSistemStep } from '../../types/workflow'
import { useWorkflowStore } from '../../store/workflow-store'

interface NodeData {
  step: DecisionSistemStep
  label: string
  onMainPath?: boolean
}

function DecisionSistemNode({ data, selected }: NodeProps<NodeData>) {
  const selectStep = useWorkflowStore((s) => s.selectStep)
  const { step, onMainPath } = data
  const { variableA, operator, variableB } = step.condition

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
            ? 'border-purple-600 shadow-purple-200 shadow-lg ring-2 ring-purple-100'
            : onMainPath
            ? 'border-purple-500 shadow-purple-100 shadow-md'
            : 'border-purple-400 hover:border-purple-500 hover:shadow-md'}
        `}
      >
        {/* Header */}
        <div className={`
          px-3 py-1.5 rounded-t-xl flex items-center gap-2
          ${onMainPath ? 'bg-purple-600' : 'bg-purple-50 border-b border-purple-200'}
        `}>
          {/* Hexagon/system icon */}
          <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
            <polygon
              points="6,0 11,3 11,9 6,12 1,9 1,3"
              fill={onMainPath ? 'white' : '#9333ea'}
            />
          </svg>
          <span className={`text-xs font-bold uppercase tracking-wide
            ${onMainPath ? 'text-white' : 'text-purple-700'}`}>
            System Check
          </span>
          {onMainPath && (
            <span className="text-xs bg-white/20 text-white px-1 rounded">main</span>
          )}
          <span className={`text-xs ml-auto font-mono
            ${onMainPath ? 'text-purple-100' : 'text-purple-500'}`}>
            #{step.number}
          </span>
        </div>

        {/* Condition display */}
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-center gap-1.5 bg-purple-50 rounded-lg px-2 py-1.5">
            <span className="text-xs font-mono text-gray-700 truncate max-w-[70px]" title={variableA}>
              {variableA || '?'}
            </span>
            <span className="text-xs font-bold text-purple-600 bg-white border border-purple-200 px-1 rounded shrink-0">
              {operator}
            </span>
            <span className="text-xs font-mono text-gray-700 truncate max-w-[70px]" title={variableB}>
              {variableB || '?'}
            </span>
          </div>

          {/* Branch indicators */}
          <div className="flex gap-2 mt-2">
            {step.transitions.true !== undefined && (
              <span className="text-xs bg-green-50 border border-green-200 text-green-700 px-1.5 py-0.5 rounded font-medium">
                T → {step.transitions.true}
              </span>
            )}
            {step.transitions.false !== undefined && (
              <span className="text-xs bg-red-50 border border-red-200 text-red-700 px-1.5 py-0.5 rounded font-medium">
                F → {step.transitions.false}
              </span>
            )}
          </div>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white"
      />
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

export default memo(DecisionSistemNode)
