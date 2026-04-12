import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { SystemActionStep } from '../../types/workflow'
import { useWorkflowStore } from '../../store/workflow-store'

interface NodeData {
  step: SystemActionStep
  label: string
  onMainPath?: boolean
}

// Extract a human-readable action name from rawType e.g. "system_update_data" → "Update Data"
function humanize(rawType: string): string {
  return rawType
    .replace(/^system_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function SystemActionNode({ data, selected }: NodeProps<NodeData>) {
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
            ? 'border-teal-600 shadow-teal-200 shadow-lg ring-2 ring-teal-100'
            : onMainPath
            ? 'border-teal-500 shadow-teal-100 shadow-md'
            : 'border-teal-400 hover:border-teal-500 hover:shadow-md'}
        `}
      >
        {/* Header */}
        <div className={`
          px-3 py-1.5 rounded-t-xl flex items-center gap-2
          ${onMainPath ? 'bg-teal-600' : 'bg-teal-50 border-b border-teal-200'}
        `}>
          {/* Gear icon (simple SVG) */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <circle cx="12" cy="12" r="3" stroke={onMainPath ? 'white' : '#0d9488'} strokeWidth="2"/>
            <path
              d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M16.9 16.9l2.1 2.1M4.9 19.1l2.1-2.1M16.9 7.1l2.1-2.1"
              stroke={onMainPath ? 'white' : '#0d9488'}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span className={`text-xs font-bold uppercase tracking-wide
            ${onMainPath ? 'text-white' : 'text-teal-700'}`}>
            System
          </span>
          {onMainPath && (
            <span className="text-xs bg-white/20 text-white px-1 rounded">main</span>
          )}
          <span className={`text-xs ml-auto font-mono
            ${onMainPath ? 'text-teal-100' : 'text-teal-500'}`}>
            #{step.number}
          </span>
        </div>

        {/* Body */}
        <div className="px-3 py-2.5">
          <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">
            {label}
          </p>
          {label !== humanize(step.rawType) && (
            <p className="text-xs font-mono text-gray-400 mt-1 truncate" title={step.rawType}>
              {step.rawType}
            </p>
          )}
          {(step.inputVariable || step.viewVariable) && (
            <div className="mt-1.5 flex gap-1 flex-wrap">
              {step.inputVariable && (
                <span className="text-xs bg-teal-50 text-teal-600 border border-teal-200 px-1 rounded">
                  in: {step.inputVariable}
                </span>
              )}
              {step.viewVariable && (
                <span className="text-xs bg-gray-50 text-gray-500 border border-gray-200 px-1 rounded">
                  view: {step.viewVariable}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-teal-500 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-teal-500 !border-2 !border-white"
      />
    </div>
  )
}

export default memo(SystemActionNode)
