import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { EndStep } from '../../types/workflow'
import { useWorkflowStore } from '../../store/workflow-store'

interface NodeData {
  step: EndStep
  label: string
  onMainPath?: boolean
}

function EndNode({ data, selected }: NodeProps<NodeData>) {
  const selectStep = useWorkflowStore((s) => s.selectStep)
  const { step, onMainPath } = data

  return (
    <div
      onClick={() => selectStep(step.id)}
      className="cursor-pointer flex flex-col items-center"
      style={{ width: 100 }}
    >
      {/* Outer ring */}
      <div
        className={`
          w-[80px] h-[80px] rounded-full border-4 flex items-center justify-center transition-shadow
          ${selected
            ? 'border-gray-700 shadow-gray-300 shadow-xl ring-2 ring-gray-200'
            : onMainPath
            ? 'border-gray-700 shadow-gray-200 shadow-md'
            : 'border-gray-400 hover:border-gray-600 hover:shadow-md'}
          bg-white
        `}
      >
        {/* Inner filled circle */}
        <div className={`
          w-[44px] h-[44px] rounded-full
          ${onMainPath ? 'bg-gray-800' : 'bg-gray-400'}
        `} />
      </div>

      {/* Label below */}
      <span className="text-xs font-bold text-gray-600 mt-1 tracking-widest uppercase">
        {step.number > 0 ? `End #${step.number}` : 'End'}
      </span>

      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-gray-500 !border-2 !border-white"
      />
    </div>
  )
}

export default memo(EndNode)
