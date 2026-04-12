/**
 * MonitorPanel — READ ONLY monitoring view for a running process instance.
 * Shows active step (highlighted on canvas), execution timeline, variable values.
 * STRICT: never mutates any data — reads only via GET endpoints.
 */
import { useState, useCallback } from 'react'
import { monitorInstance } from '../../services/api'
import type { WfBuilderMonitorResponse, TaskHistoryItem } from '../../types/monitor'

interface Props {
  onHighlightStep?: (stepNumber: number | null) => void
}

export function MonitorPanel({ onHighlightStep }: Props) {
  const [instanceId, setInstanceId] = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [data, setData]             = useState<WfBuilderMonitorResponse | null>(null)

  const load = useCallback(async () => {
    const id = instanceId.trim()
    if (!id) return
    setLoading(true)
    setError(null)
    const result = await monitorInstance(id)
    setLoading(false)
    if (result.ok) {
      setData(result.data)
      onHighlightStep?.(result.data.activeStepNumber)
    } else {
      setError(result.error)
      setData(null)
      onHighlightStep?.(null)
    }
  }, [instanceId, onHighlightStep])

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">
          Workflow Monitor
          <span className="ml-2 text-green-600 font-normal normal-case">READ ONLY</span>
        </h3>
      </div>

      {/* Instance ID input */}
      <div className="p-3 border-b border-gray-100">
        <div className="flex gap-1">
          <input
            type="text"
            value={instanceId}
            onChange={(e) => setInstanceId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Process instance ID"
            className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm font-mono"
          />
          <button
            onClick={load}
            disabled={loading || !instanceId.trim()}
            className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm hover:bg-blue-700 disabled:opacity-40"
          >
            {loading ? '…' : 'Load'}
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>

      {/* Content */}
      {data && (
        <div className="flex-1 overflow-y-auto">
          {/* Instance summary */}
          <SummaryCard data={data} />

          {/* Active step */}
          {data.activeStepNumber !== null && (
            <ActiveStepCard data={data} />
          )}

          {/* Variable snapshot */}
          {data.variables.length > 0 && (
            <VariablesCard variables={data.variables} />
          )}

          {/* Timeline */}
          {data.history.length > 0 && (
            <TimelineCard history={data.history} activeStepNumber={data.activeStepNumber} />
          )}
        </div>
      )}

      {!data && !loading && !error && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-gray-400 text-center">
            Enter a process instance ID<br/>to monitor its execution
          </p>
        </div>
      )}
    </div>
  )
}

// ── Sub-cards ─────────────────────────────────────────────────

function SummaryCard({ data }: { data: WfBuilderMonitorResponse }) {
  return (
    <div className="p-3 border-b border-gray-100">
      <p className="text-xs font-bold text-gray-500 uppercase mb-2">Process Info</p>
      <div className="space-y-1">
        <Row label="Workflow"   value={data.workflowName} />
        <Row label="No. Tiket" value={data.noTiket} />
        <Row label="Status"    value={data.status}
             valueClass={data.status === 'COMPLETED' ? 'text-green-600' : 'text-amber-600'} />
        <Row label="Dibuat"    value={data.dibuatOleh} />
        <Row label="Tanggal"   value={data.tanggalPengajuan} />
        <Row label="Steps"     value={`${data.history.filter(h => h.status === 'COMPLETED').length} / ${data.totalSteps} completed`} />
      </div>
    </div>
  )
}

function ActiveStepCard({ data }: { data: WfBuilderMonitorResponse }) {
  return (
    <div className="p-3 border-b border-gray-100 bg-blue-50">
      <p className="text-xs font-bold text-blue-600 uppercase mb-2">Active Step</p>
      <div className="bg-white rounded border border-blue-200 p-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs bg-blue-600 text-white rounded px-1.5 py-0.5 font-mono">
            #{data.activeStepNumber}
          </span>
          <span className="text-xs text-blue-500 uppercase">{data.activeStepType}</span>
        </div>
        <p className="text-sm font-medium text-gray-800">{data.activeStepTitle}</p>
        {data.activeStepRole && (
          <p className="text-xs text-gray-500 mt-0.5">
            Assigned to: <span className="font-medium">{data.activeStepRole}</span>
          </p>
        )}
      </div>
    </div>
  )
}

function VariablesCard({ variables }: { variables: WfBuilderMonitorResponse['variables'] }) {
  return (
    <div className="p-3 border-b border-gray-100">
      <p className="text-xs font-bold text-gray-500 uppercase mb-2">Variables</p>
      <div className="space-y-1">
        {variables.map((v) => (
          <div key={v.name} className="flex items-start gap-2 text-xs">
            <span className="font-mono text-gray-700 w-36 truncate shrink-0">{v.name}</span>
            <span className="text-gray-400">=</span>
            <span className="font-mono text-blue-700 flex-1 truncate">{v.value1 || '(empty)'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TimelineCard({ history, activeStepNumber }: { history: TaskHistoryItem[]; activeStepNumber: number | null }) {
  return (
    <div className="p-3">
      <p className="text-xs font-bold text-gray-500 uppercase mb-3">Execution Timeline</p>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-200" />

        <div className="space-y-3">
          {history.map((item, i) => {
            const isActive = item.stepNumber === activeStepNumber
            const isDone   = item.status === 'COMPLETED'
            const isCancelled = item.status === 'CANCELLED'

            return (
              <div key={item.taskId ?? i} className="flex gap-3 relative">
                {/* Dot */}
                <div className={`
                  w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 z-10 bg-white
                  ${isActive ? 'border-blue-500 bg-blue-50' : isDone ? 'border-green-500' : isCancelled ? 'border-red-400' : 'border-gray-300'}
                `}>
                  <div className={`
                    w-2.5 h-2.5 rounded-full
                    ${isActive ? 'bg-blue-500 animate-pulse' : isDone ? 'bg-green-500' : isCancelled ? 'bg-red-400' : 'bg-gray-300'}
                  `} />
                </div>

                {/* Content */}
                <div className={`flex-1 pb-1 ${isActive ? 'bg-blue-50 -mx-1 px-1 rounded' : ''}`}>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-mono text-gray-400">#{item.stepNumber}</span>
                    <span className="text-xs font-medium text-gray-800 truncate">{item.stepTitle}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  {item.claimBy && (
                    <p className="text-xs text-gray-500">by {item.claimBy}</p>
                  )}
                  {item.completedAt && (
                    <p className="text-xs text-gray-400">{new Date(item.completedAt).toLocaleString()}</p>
                  )}
                  {item.catatan && (
                    <p className="text-xs text-gray-500 italic mt-0.5">"{item.catatan}"</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: TaskHistoryItem['status'] }) {
  const cls =
    status === 'COMPLETED'  ? 'bg-green-100 text-green-700' :
    status === 'CANCELLED'  ? 'bg-red-100 text-red-700' :
                              'bg-amber-100 text-amber-700'
  return <span className={`text-xs px-1 py-0.5 rounded ml-auto ${cls}`}>{status}</span>
}

function Row({ label, value, valueClass = 'text-gray-700' }: { label: string; value?: string | null; valueClass?: string }) {
  return (
    <div className="flex gap-1 text-xs">
      <span className="text-gray-400 w-20 shrink-0">{label}</span>
      <span className={`flex-1 font-medium ${valueClass}`}>{value || '—'}</span>
    </div>
  )
}
