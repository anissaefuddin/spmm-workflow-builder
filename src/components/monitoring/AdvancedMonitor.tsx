/**
 * AdvancedMonitor — full workflow debugger with:
 *   1. Full step timeline (completed + active + future)
 *   2. Variable evolution table
 *   3. Step detail trace panel
 *   4. Filtering by variable / step / user
 *
 * Uses data from WfBuilderMonitorResponse + the loaded DSL (for future steps).
 */
import { useState, useMemo } from 'react'
import { useWorkflowStore } from '../../store/workflow-store'
import type { TaskHistoryItem, VariableSnapshot } from '../../types/monitor'

interface Props {
  history: TaskHistoryItem[]
  variables: VariableSnapshot[]
  activeStep: number | null
  totalSteps: number
}

// ── Step status enum ──────────────────────────────────────────

type StepState = 'completed' | 'active' | 'cancelled' | 'future' | 'not_started'

interface FullStep {
  number: number
  title: string
  type: string
  state: StepState
  task?: TaskHistoryItem
}

// ── Main Component ────────────────────────────────────────────

export function AdvancedMonitor({ history, variables, activeStep, totalSteps }: Props) {
  const dsl = useWorkflowStore((s) => s.dsl)
  const [selectedStep, setSelectedStep]   = useState<FullStep | null>(null)
  const [varFilter, setVarFilter]         = useState('')
  const [userFilter, setUserFilter]       = useState('')
  const [activeSection, setActiveSection] = useState<'timeline' | 'variables' | 'trace'>('timeline')

  // Build full step list: completed from history + future from DSL
  const fullSteps = useMemo<FullStep[]>(() => {
    const steps: FullStep[] = []
    const seenNumbers = new Set<number>()

    // History items (completed / active / cancelled / not_started)
    for (const h of history) {
      seenNumbers.add(h.stepNumber)
      const state: StepState =
        h.status === 'NOT_STARTED' ? 'not_started' :
        h.stepNumber === activeStep ? 'active' :
        h.status === 'COMPLETED' ? 'completed' :
        h.status === 'CANCELLED' ? 'cancelled' : 'active'
      steps.push({
        number: h.stepNumber,
        title: h.stepTitle || `Step ${h.stepNumber}`,
        type: '',
        state,
        task: h.status !== 'NOT_STARTED' ? h : undefined,
      })
    }

    // Future steps from DSL (not yet reached)
    if (dsl) {
      for (const s of dsl.process.steps) {
        if (!seenNumbers.has(s.number)) {
          steps.push({
            number: s.number,
            title: s.title || `Step ${s.number}`,
            type: s.type,
            state: 'future',
          })
        }
      }
    }

    return steps.sort((a, b) => a.number - b.number)
  }, [history, activeStep, dsl])

  // Unique users for filter dropdown
  const users = useMemo(() => {
    const set = new Set<string>()
    for (const h of history) if (h.claimBy) set.add(h.claimBy)
    return [...set].sort()
  }, [history])

  // Filtered variables
  const filteredVars = useMemo(() => {
    let result = variables
    if (varFilter.trim()) {
      const q = varFilter.toLowerCase()
      result = result.filter((v) => v.name.toLowerCase().includes(q))
    }
    return result
  }, [variables, varFilter])

  // Filtered history
  const filteredHistory = useMemo(() => {
    let result = history
    if (userFilter) result = result.filter((h) => h.claimBy === userFilter)
    return result
  }, [history, userFilter])

  const STATE_CLS: Record<StepState, string> = {
    completed:   'border-green-400 bg-green-50 text-green-800',
    active:      'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-200',
    cancelled:   'border-red-300 bg-red-50 text-red-700',
    future:      'border-gray-300 bg-gray-50 text-gray-400',
    not_started: 'border-dashed border-gray-300 bg-gray-50 text-gray-400',
  }

  const STATE_ICON: Record<StepState, string> = {
    completed:   '✓',
    active:      '●',
    cancelled:   '✕',
    future:      '○',
    not_started: '○',
  }

  return (
    <div className="space-y-4">
      {/* ── Section tabs ──────────────────────────────────────── */}
      <div className="flex gap-1">
        {(['timeline', 'variables', 'trace'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveSection(t)}
            className={`px-3 py-1 text-xs font-semibold rounded transition-colors
              ${activeSection === t
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {t === 'timeline' ? 'Step Timeline' : t === 'variables' ? 'Variable Evolution' : 'Step Trace'}
          </button>
        ))}
      </div>

      {/* ── 1. Full Step Timeline ─────────────────────────────── */}
      {activeSection === 'timeline' && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase">
              Full Workflow Timeline
            </p>
            <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
              {fullSteps.filter((s) => s.state === 'completed').length} of {fullSteps.length} completed
              {fullSteps.every((s) => s.state === 'not_started') && ' (not started)'}
            </span>
          </div>

          {/* Not started message */}
          {fullSteps.every((s) => s.state === 'not_started') && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2 text-center">
              <p className="text-xs text-gray-500">Workflow has not started. Steps shown from definition.</p>
            </div>
          )}

          {/* Horizontal flow */}
          <div className="flex items-center gap-1 overflow-x-auto pb-3">
            {fullSteps.map((step, i) => (
              <div key={step.number} className="flex items-center gap-1 shrink-0">
                {i > 0 && (
                  <div className={`w-6 h-px ${
                    step.state === 'future' ? 'bg-gray-200 border-dashed' : 'bg-gray-300'
                  }`} />
                )}
                <button
                  onClick={() => setSelectedStep(selectedStep?.number === step.number ? null : step)}
                  className={`flex flex-col items-center px-3 py-2 rounded-lg border transition-all min-w-[80px]
                    ${STATE_CLS[step.state]}
                    ${selectedStep?.number === step.number ? 'shadow-md scale-105' : 'hover:shadow-sm'}`}
                >
                  <span className="text-[10px] mb-0.5">{STATE_ICON[step.state]}</span>
                  <span className="text-[10px] font-mono">#{step.number}</span>
                  <span className="text-[10px] font-medium max-w-[72px] truncate">{step.title}</span>
                  {step.task?.decision && (
                    <span className={`text-[8px] px-1 py-0.5 rounded mt-0.5 font-bold
                      ${step.task.decision === 'true' ? 'bg-green-200 text-green-800' :
                        step.task.decision === 'false' ? 'bg-red-200 text-red-800' :
                        'bg-gray-200 text-gray-700'}`}
                    >
                      {step.task.decision === 'true' ? 'YES' : step.task.decision === 'false' ? 'NO' : step.task.decision.toUpperCase()}
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Selected step detail */}
          {selectedStep && (
            <StepTraceCard step={selectedStep} onClose={() => setSelectedStep(null)} />
          )}
        </div>
      )}

      {/* ── 2. Variable Evolution ─────────────────────────────── */}
      {activeSection === 'variables' && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase">Variable Snapshot</p>
            <input
              type="text"
              value={varFilter}
              onChange={(e) => setVarFilter(e.target.value)}
              placeholder="Filter variables..."
              className="ml-auto w-40 border border-gray-300 rounded px-2 py-0.5 text-[10px]"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-1.5 font-semibold text-gray-500 border-b">Variable</th>
                  <th className="text-left px-3 py-1.5 font-semibold text-gray-500 border-b w-16">Type</th>
                  <th className="text-left px-3 py-1.5 font-semibold text-gray-500 border-b">Current Value</th>
                </tr>
              </thead>
              <tbody>
                {filteredVars.map((v) => (
                  <tr key={v.name} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-mono text-gray-700">{v.name}</td>
                    <td className="px-3 py-1.5">
                      <span className="text-[9px] bg-gray-100 text-gray-500 rounded px-1 py-0.5 font-bold">
                        {v.vtype}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-800 max-w-xs truncate" title={v.value1}>
                      {v.value1 || <span className="text-gray-300">(empty)</span>}
                    </td>
                  </tr>
                ))}
                {filteredVars.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-gray-400 italic">
                      No variables{varFilter ? ' match filter' : ''}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 3. Step Trace ─────────────────────────────────────── */}
      {activeSection === 'trace' && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase">Execution Trace</p>
            {users.length > 0 && (
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="ml-auto border border-gray-300 rounded px-2 py-0.5 text-[10px]"
              >
                <option value="">All users</option>
                {users.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            )}
          </div>

          <div className="space-y-2">
            {filteredHistory.length === 0 && (
              <p className="text-xs text-gray-400 italic text-center py-4">No execution history</p>
            )}
            {filteredHistory.map((h, i) => (
              <div
                key={h.taskId ?? i}
                className={`rounded-lg border p-3 transition-colors
                  ${h.stepNumber === activeStep ? 'border-blue-400 bg-blue-50' :
                    h.status === 'COMPLETED' ? 'border-green-200 bg-green-50/30' :
                    h.status === 'CANCELLED' ? 'border-red-200 bg-red-50/30' :
                    'border-gray-200'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono bg-gray-200 text-gray-700 rounded px-1.5 py-0.5">
                    #{h.stepNumber}
                  </span>
                  <span className="text-xs font-medium text-gray-800 flex-1 truncate">{h.stepTitle}</span>
                  <span className={`text-[10px] px-1 py-0.5 rounded font-bold
                    ${h.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                      h.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'}`}>
                    {h.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-gray-500">
                  <span>Role: <span className="text-gray-700">{h.role || '—'}</span></span>
                  <span>User: <span className="text-gray-700">{h.claimBy || '—'}</span></span>
                  {h.createdAt && <span>Started: {new Date(h.createdAt).toLocaleString()}</span>}
                  {h.completedAt && <span>Completed: {new Date(h.completedAt).toLocaleString()}</span>}
                </div>

                {h.decision && (
                  <div className="mt-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold
                      ${h.decision === 'true' ? 'bg-green-100 text-green-700' :
                        h.decision === 'false' ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'}`}>
                      Decision: {h.decision === 'true' ? 'Approved' : h.decision === 'false' ? 'Rejected' : h.decision}
                    </span>
                  </div>
                )}

                {h.catatan && (
                  <p className="text-[10px] text-gray-500 italic mt-1">Note: "{h.catatan}"</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Step Trace Card ───────────────────────────────────────────

function StepTraceCard({ step, onClose }: { step: FullStep; onClose: () => void }) {
  const h = step.task

  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono bg-gray-200 text-gray-700 rounded px-1.5 py-0.5">
            #{step.number}
          </span>
          <span className="text-sm font-medium text-gray-800">{step.title}</span>
          {step.type && (
            <span className="text-[10px] text-gray-400">{step.type}</span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
      </div>

      {step.state === 'future' ? (
        <p className="text-xs text-gray-400 italic">This step has not been reached yet.</p>
      ) : h ? (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-400">Status: </span>
              <span className={`px-1 py-0.5 rounded text-[10px] font-bold
                ${h.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                  h.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                  'bg-amber-100 text-amber-700'}`}>
                {h.status}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Role: </span>
              <span className="text-gray-700">{h.role || '—'}</span>
            </div>
            <div>
              <span className="text-gray-400">User: </span>
              <span className="text-gray-700">{h.claimBy || '—'}</span>
            </div>
            {h.decision && (
              <div>
                <span className="text-gray-400">Decision: </span>
                <span className={`px-1 py-0.5 rounded text-[10px] font-bold
                  ${h.decision === 'true' ? 'bg-green-100 text-green-700' :
                    h.decision === 'false' ? 'bg-red-100 text-red-700' :
                    'bg-blue-100 text-blue-700'}`}>
                  {h.decision === 'true' ? 'Approved' : h.decision === 'false' ? 'Rejected' : h.decision}
                </span>
              </div>
            )}
          </div>

          {h.createdAt && (
            <p className="text-[10px] text-gray-400">
              {new Date(h.createdAt).toLocaleString()}
              {h.completedAt && ` → ${new Date(h.completedAt).toLocaleString()}`}
            </p>
          )}

          {h.catatan && (
            <div className="bg-white border border-gray-100 rounded px-2 py-1.5">
              <p className="text-[10px] text-gray-400 mb-0.5">Notes:</p>
              <p className="text-xs text-gray-700 italic">"{h.catatan}"</p>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
