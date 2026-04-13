/**
 * VariableFlowPanel — visualizes variable ↔ step relationships.
 *
 * Shows a compact flow diagram: which variables flow through which steps.
 * Click a variable to highlight all steps that reference it on the canvas.
 * Click a step badge to navigate to it in the sidebar.
 */
import { useState, useMemo } from 'react'
import { useWorkflowStore } from '../../store/workflow-store'
import { buildVariableFlow } from '../../lib/variable-flow'
import type { VariableFlowNode } from '../../lib/variable-flow'

const TYPE_CLS: Record<string, string> = {
  form:             'bg-blue-100 text-blue-700',
  decision_user:    'bg-amber-100 text-amber-700',
  decision_sistem:  'bg-purple-100 text-purple-700',
  system_action:    'bg-teal-100 text-teal-700',
  end:              'bg-gray-100 text-gray-600',
}

interface Props {
  onHighlightSteps?: (stepNumbers: number[]) => void
  onClose: () => void
}

export function VariableFlowPanel({ onHighlightSteps, onClose }: Props) {
  const dsl = useWorkflowStore((s) => s.dsl)
  const selectStep = useWorkflowStore((s) => s.selectStep)
  const [search, setSearch] = useState('')
  const [selectedVar, setSelectedVar] = useState<string | null>(null)

  const graph = useMemo(() => dsl ? buildVariableFlow(dsl) : null, [dsl])

  if (!dsl || !graph) return null

  const allVars = [...graph.variables.values()]
  const filtered = search.trim()
    ? allVars.filter((v) => v.variableName.toLowerCase().includes(search.toLowerCase()))
    : allVars

  const handleSelectVar = (v: VariableFlowNode) => {
    const name = v.variableName
    if (selectedVar === name) {
      setSelectedVar(null)
      onHighlightSteps?.([])
    } else {
      setSelectedVar(name)
      const stepNums = [...new Set([...v.writers, ...v.readers])]
      onHighlightSteps?.(stepNums)
    }
  }

  const handleStepClick = (stepId: string) => {
    selectStep(stepId)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-16 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[75vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-3">
          <div className="flex-1">
            <h2 className="font-bold text-gray-800 text-sm">Variable Flow Graph</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {graph.usedVariables.length} used · {graph.unusedVariables.length} unused
            </p>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search variables..."
            className="w-48 border border-gray-300 rounded px-2 py-1 text-xs"
          />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        {/* Unused variables warning */}
        {graph.unusedVariables.length > 0 && (
          <div className="px-5 py-2 bg-amber-50 border-b border-amber-100">
            <p className="text-xs text-amber-700">
              <span className="font-semibold">Unused variables: </span>
              {graph.unusedVariables.join(', ')}
            </p>
          </div>
        )}

        {/* Flow list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
          {filtered.map((v) => {
            const isSelected = selectedVar === v.variableName
            const isUnused = v.usages.length === 0
            return (
              <div
                key={v.variableName}
                className={`rounded-lg border transition-colors ${
                  isSelected ? 'border-blue-400 bg-blue-50' :
                  isUnused ? 'border-amber-200 bg-amber-50/50' :
                  'border-gray-100 hover:border-gray-200'
                }`}
              >
                <button
                  onClick={() => handleSelectVar(v)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left"
                >
                  {/* Variable name */}
                  <span className="text-xs font-mono font-medium text-gray-800 w-40 truncate shrink-0" title={v.variableName}>
                    {v.variableName}
                  </span>

                  {/* Type badge */}
                  <span className="text-[9px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 font-bold shrink-0">
                    {v.vtype.length > 10 ? v.vtype.slice(0, 9) + '...' : v.vtype}
                  </span>

                  {/* Flow arrows */}
                  <div className="flex-1 flex items-center gap-1 overflow-hidden">
                    {v.usages.length === 0 ? (
                      <span className="text-[10px] text-amber-500 italic">unused</span>
                    ) : (
                      <>
                        {/* Deduplicate by step number, show step badges */}
                        {[...new Set(v.usages.map((u) => u.stepNumber))].map((num) => {
                          const usage = v.usages.find((u) => u.stepNumber === num)!
                          const isWriter = v.writers.includes(num)
                          const isReader = v.readers.includes(num)
                          return (
                            <span
                              key={num}
                              onClick={(e) => { e.stopPropagation(); handleStepClick(usage.stepId) }}
                              title={`Step #${num} ${usage.stepTitle ?? usage.stepType} — ${isWriter ? 'writes' : ''}${isWriter && isReader ? ' & ' : ''}${isReader ? 'reads' : ''}`}
                              className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded cursor-pointer shrink-0
                                ${TYPE_CLS[usage.stepType] ?? 'bg-gray-100 text-gray-600'}
                                hover:ring-1 hover:ring-blue-400`}
                            >
                              {isWriter && <span className="text-[8px]">W</span>}
                              {isReader && <span className="text-[8px]">R</span>}
                              <span className="font-mono">#{num}</span>
                            </span>
                          )
                        })}
                      </>
                    )}
                  </div>

                  {/* Expand indicator */}
                  <span className="text-gray-300 text-xs shrink-0">{isSelected ? '▴' : '▾'}</span>
                </button>

                {/* Expanded detail */}
                {isSelected && v.usages.length > 0 && (
                  <div className="px-3 pb-2.5 pt-0.5 border-t border-blue-200 space-y-1">
                    {v.usages.map((u, i) => (
                      <button
                        key={i}
                        onClick={() => handleStepClick(u.stepId)}
                        className="w-full flex items-center gap-2 text-left px-2 py-1 rounded hover:bg-white/60"
                      >
                        <span className="text-[10px] font-mono text-gray-400 w-8 shrink-0">#{u.stepNumber}</span>
                        <span className={`text-[10px] px-1 py-0.5 rounded ${TYPE_CLS[u.stepType] ?? ''}`}>
                          {u.stepType}
                        </span>
                        <span className="text-[10px] text-gray-600 flex-1 truncate">{u.stepTitle ?? ''}</span>
                        <span className="text-[9px] text-gray-400">{u.context}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
