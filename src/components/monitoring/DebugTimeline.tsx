/**
 * DebugTimeline — step-by-step runtime debugger.
 *
 * Shows a horizontal/vertical timeline of executed steps with:
 *   - Variable values at each step
 *   - Decision results
 *   - User actions and notes
 *
 * Uses data already fetched by TicketDetail (WfBuilderMonitorResponse).
 */
import { useState } from 'react'
import type { TaskHistoryItem, VariableSnapshot } from '../../types/monitor'

interface Props {
  history: TaskHistoryItem[]
  variables: VariableSnapshot[]
  activeStep: number | null
}

function decisionLabel(d: string | null): { text: string; cls: string } | null {
  if (!d) return null
  if (d === 'true')  return { text: 'Approved', cls: 'bg-green-100 text-green-700' }
  if (d === 'false') return { text: 'Rejected', cls: 'bg-red-100 text-red-700' }
  if (d === 'save')  return { text: 'Saved', cls: 'bg-gray-100 text-gray-600' }
  return { text: d, cls: 'bg-blue-100 text-blue-700' }
}

export function DebugTimeline({ history, variables, activeStep }: Props) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [varSearch, setVarSearch] = useState('')

  const filteredVars = varSearch.trim()
    ? variables.filter((v) => v.name.toLowerCase().includes(varSearch.toLowerCase()))
    : variables

  return (
    <div className="space-y-4">
      {/* Step-by-step timeline */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase">Step Execution Timeline</p>
          <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
            {history.length} steps
          </span>
        </div>

        {/* Horizontal step flow */}
        <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-3">
          {history.map((item, i) => {
            const isActive     = item.stepNumber === activeStep
            const isDone       = item.status === 'COMPLETED'
            const isCancelled  = item.status === 'CANCELLED'
            const isNotStarted = item.status === 'NOT_STARTED'
            const decision     = decisionLabel(item.decision)

            return (
              <div key={item.taskId ?? i} className="flex items-center gap-1 shrink-0">
                {i > 0 && (
                  <div className={`w-4 h-px ${isDone ? 'bg-green-400' : isCancelled ? 'bg-red-300' : isNotStarted ? 'bg-gray-200 border-dashed' : 'bg-gray-300'}`} />
                )}
                <button
                  onClick={() => setExpandedStep(expandedStep === (item.taskId ?? String(i)) ? null : (item.taskId ?? String(i)))}
                  className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg border transition-all text-center min-w-[72px]
                    ${isActive ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' :
                      isDone ? 'border-green-300 bg-green-50' :
                      isCancelled ? 'border-red-200 bg-red-50' :
                      isNotStarted ? 'border-dashed border-gray-200 bg-gray-50' :
                      'border-gray-200 bg-white hover:bg-gray-50'}`}
                >
                  <span className="text-[10px] font-mono text-gray-400">#{item.stepNumber}</span>
                  <span className="text-[10px] font-medium text-gray-700 max-w-[64px] truncate">
                    {item.stepTitle || `Step ${item.stepNumber}`}
                  </span>
                  {decision && (
                    <span className={`text-[8px] px-1 py-0.5 rounded mt-0.5 font-bold ${decision.cls}`}>
                      {decision.text}
                    </span>
                  )}
                  {isActive && (
                    <span className="text-[8px] text-blue-600 font-bold mt-0.5">ACTIVE</span>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {/* Expanded step detail */}
        {expandedStep && (() => {
          const item = history.find((h) => (h.taskId ?? '') === expandedStep)
          if (!item) return null
          const decision = decisionLabel(item.decision)
          return (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono bg-gray-200 text-gray-700 rounded px-1.5 py-0.5">
                    #{item.stepNumber}
                  </span>
                  <span className="text-sm font-medium text-gray-800">{item.stepTitle}</span>
                </div>
                <button onClick={() => setExpandedStep(null)} className="text-gray-400 hover:text-gray-600 text-xs">
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-400">Role:</span>
                  <span className="ml-1 text-gray-700">{item.role || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Claimed by:</span>
                  <span className="ml-1 text-gray-700">{item.claimBy || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Status:</span>
                  <span className={`ml-1 px-1 py-0.5 rounded text-[10px] font-bold
                    ${item.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                      item.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'}`}>
                    {item.status}
                  </span>
                </div>
                {decision && (
                  <div>
                    <span className="text-gray-400">Decision:</span>
                    <span className={`ml-1 px-1 py-0.5 rounded text-[10px] font-bold ${decision.cls}`}>
                      {decision.text}
                    </span>
                  </div>
                )}
              </div>

              {item.createdAt && (
                <p className="text-[10px] text-gray-400">
                  Created: {new Date(item.createdAt).toLocaleString()}
                  {item.completedAt && ` · Completed: ${new Date(item.completedAt).toLocaleString()}`}
                </p>
              )}

              {item.catatan && (
                <div className="bg-white border border-gray-100 rounded px-2 py-1.5">
                  <p className="text-[10px] text-gray-400 mb-0.5">Notes:</p>
                  <p className="text-xs text-gray-700 italic">"{item.catatan}"</p>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* Variable snapshot */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase">Variable Snapshot</p>
          <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
            {variables.length} vars
          </span>
          <input
            type="text"
            value={varSearch}
            onChange={(e) => setVarSearch(e.target.value)}
            placeholder="Filter..."
            className="ml-auto w-32 border border-gray-300 rounded px-1.5 py-0.5 text-[10px]"
          />
        </div>

        <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-48 overflow-y-auto">
          {filteredVars.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-400 italic">
              {variables.length === 0 ? 'No variables' : 'No matches'}
            </p>
          )}
          {filteredVars.map((v) => (
            <div key={v.name} className="px-3 py-1.5 flex items-center gap-2">
              <span className="text-xs font-mono text-gray-600 w-40 truncate shrink-0" title={v.name}>
                {v.name}
              </span>
              <span className="text-[9px] bg-gray-200 text-gray-500 rounded px-1 py-0.5 font-bold shrink-0">
                {v.vtype}
              </span>
              <span className="text-xs text-gray-800 flex-1 truncate" title={v.value1}>
                {v.value1 || <span className="text-gray-300">(empty)</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
