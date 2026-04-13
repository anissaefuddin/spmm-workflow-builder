/**
 * MonitoringPage — Full monitoring with ticket list + detail.
 * READ ONLY for most data; allows status update via safe adapter endpoint.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { listTickets, monitorInstance, updateTicketStatus, transitionStep, forceTransitionStep, resolveFileUrl } from '../services/api'
import { useSettingsStore } from '../store/settings-store'
import { useWorkflowListStore } from '../store/workflow-list-store'
import type { TicketListItem } from '../types/monitoring-api'
import type { WfBuilderMonitorResponse, TaskHistoryItem, VariableSnapshot } from '../types/monitor'
import { STATUS_COLORS, STATUS_LABELS } from '../types/monitoring-api'
import { DebugTimeline } from '../components/monitoring/DebugTimeline'
import { AdvancedMonitor } from '../components/monitoring/AdvancedMonitor'

// ─────────────────────────────────────────────────────────────
// Variable type badge colors (mirrors VariablePicker)
// ─────────────────────────────────────────────────────────────

const TYPE_CLS: Record<string, string> = {
  String:  'bg-gray-100 text-gray-600',
  Number:  'bg-blue-100 text-blue-700',
  float:   'bg-blue-100 text-blue-700',
  Date:    'bg-green-100 text-green-700',
  Option:  'bg-amber-100 text-amber-700',
  file:    'bg-purple-100 text-purple-700',
}
function typeBadgeCls(vtype: string) { return TYPE_CLS[vtype] ?? 'bg-gray-100 text-gray-500' }

// ─────────────────────────────────────────────────────────────
// Variable viewer
// ─────────────────────────────────────────────────────────────

function VariableViewer({ variables }: { variables: VariableSnapshot[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (variables.length === 0) {
    return (
      <div>
        <SectionHeader label="Variables" count={0} />
        <p className="text-xs text-gray-400 italic">No variable data available</p>
      </div>
    )
  }

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  const isFileType = (vtype: string) => {
    const t = vtype.toLowerCase()
    return t === 'file' || t === 'multiple_file' || t.includes('file')
  }

  const renderValue = (v: VariableSnapshot) => {
    // File type — show file actions
    if (isFileType(v.vtype)) {
      return <FileVariableView variable={v} />
    }

    const val = v.value1
    if (!val) return <span className="text-gray-300 text-xs">(empty)</span>

    // Try JSON pretty-print
    if ((val.startsWith('{') || val.startsWith('[')) && val.length > 10) {
      try {
        const parsed = JSON.parse(val)
        return (
          <pre className="text-xs font-mono bg-gray-100 border border-gray-200 rounded p-2 mt-1 overflow-auto max-h-32 whitespace-pre-wrap">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        )
      } catch { /* not JSON */ }
    }

    // Long text — expandable
    if (val.length > 100) {
      const isExpanded = expanded.has(v.name)
      return (
        <div className="mt-0.5">
          <span className="text-xs text-gray-800 break-words">
            {isExpanded ? val : `${val.slice(0, 100)}…`}
          </span>
          <button
            onClick={() => toggle(v.name)}
            className="text-[10px] text-blue-500 hover:underline ml-1 shrink-0"
          >
            {isExpanded ? 'less' : 'more'}
          </button>
        </div>
      )
    }

    return <span className="text-xs font-medium text-gray-800 break-words">{val}</span>
  }

  return (
    <div>
      <SectionHeader label="Variables" count={variables.length} />
      <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-100">
        {variables.map((v) => (
          <div key={v.name} className="px-3 py-2">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-mono text-gray-700 flex-1 truncate" title={v.name}>
                {v.name}
              </span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${typeBadgeCls(v.vtype)}`}>
                {v.vtype}
              </span>
            </div>
            {renderValue(v)}
            {/* Option type: show available choices */}
            {v.vtype === 'Option' && v.value2 && (
              <p className="text-[10px] text-gray-400 mt-0.5">
                Options: {v.value2.split('|').join(' · ')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// File variable viewer with preview / download
// ─────────────────────────────────────────────────────────────

function FileVariableView({ variable: v }: { variable: VariableSnapshot }) {
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [previewable, setPreviewable] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const filePath = v.value2 || v.value1
  const displayName = v.value1 || v.value2 || '(no file)'

  const handleResolve = async () => {
    if (!filePath) return
    setLoading(true)
    const res = await resolveFileUrl(filePath)
    setLoading(false)
    if (res.ok) {
      setFileUrl(res.data.url)
      setFileName(res.data.fileName)
      setPreviewable(res.data.previewable)
    }
  }

  if (!filePath || filePath.trim() === '') {
    return <span className="text-gray-300 text-xs">(no file uploaded)</span>
  }

  return (
    <div className="mt-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-700 truncate flex-1" title={displayName}>
          {displayName}
        </span>
        {!fileUrl ? (
          <button
            onClick={handleResolve}
            disabled={loading}
            className="text-[10px] text-blue-500 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50 disabled:opacity-40"
          >
            {loading ? '…' : 'Load URL'}
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50"
            >
              View
            </a>
            <a
              href={fileUrl}
              download={fileName ?? undefined}
              className="text-[10px] text-green-600 border border-green-200 rounded px-1.5 py-0.5 hover:bg-green-50"
            >
              Download
            </a>
            {previewable && (
              <button
                onClick={() => setShowPreview(true)}
                className="text-[10px] text-purple-600 border border-purple-200 rounded px-1.5 py-0.5 hover:bg-purple-50"
              >
                Preview
              </button>
            )}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {showPreview && fileUrl && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-8">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center px-4 py-3 border-b border-gray-200">
              <h3 className="font-bold text-gray-800 text-sm flex-1 truncate">{fileName}</h3>
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline mr-3"
              >
                Open in new tab
              </a>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600 text-lg">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {fileName?.toLowerCase().endsWith('.pdf') ? (
                <iframe src={fileUrl} className="w-full h-full min-h-[500px]" title={fileName} />
              ) : (
                <img src={fileUrl} alt={fileName ?? ''} className="max-w-full mx-auto" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      {count !== undefined && (
        <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 font-medium">
          {count}
        </span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Ticket list panel
// ─────────────────────────────────────────────────────────────

function TicketList({
  onSelect,
  selectedId,
  definitionId,
}: {
  onSelect: (t: TicketListItem) => void
  selectedId: string | null
  definitionId?: string
}) {
  const { backendUrl } = useSettingsStore()
  const definitions        = useWorkflowListStore((s) => s.definitions)
  const definitionsLoading = useWorkflowListStore((s) => s.definitionsLoading)
  const fetchDefinitions   = useWorkflowListStore((s) => s.fetchDefinitions)

  const [tickets, setTickets]     = useState<TicketListItem[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage]           = useState(0)
  const [total, setTotal]         = useState(0)

  // Local workflow dropdown — initialised from prop, overrideable by user
  const [selectedDefId, setSelectedDefId] = useState<string>(definitionId ?? '')

  // Request-id guard — prevents stale API responses from overwriting newer results
  const reqId = useRef(0)

  const PAGE_SIZE = 20

  // Sync dropdown when the external prop changes (e.g. user loads a workflow)
  useEffect(() => { setSelectedDefId(definitionId ?? '') }, [definitionId])

  // Ensure definitions list is populated
  useEffect(() => {
    if (definitions.length === 0 && backendUrl && !definitionsLoading) {
      void fetchDefinitions()
    }
  }, [backendUrl, definitions.length, definitionsLoading, fetchDefinitions])

  const load = useCallback(async () => {
    if (!backendUrl) {
      setError('No Backend URL — open Settings to configure')
      return
    }
    // Bump the request counter and capture this call's id.
    // If a newer request completes first, we discard this stale result.
    const thisId = ++reqId.current
    setLoading(true)
    setError(null)
    const res = await listTickets({
      page,
      size: PAGE_SIZE,
      search: search.trim() || undefined,
      status: filterStatus || undefined,
      definitionId: selectedDefId || undefined,
    })
    if (reqId.current !== thisId) return  // stale — a newer request is in flight
    setLoading(false)
    if (res.ok) {
      setTickets(res.data.content)
      setTotal(res.data.totalElements)
    } else {
      setError(res.error)
    }
  }, [backendUrl, page, search, filterStatus, selectedDefId])

  // Reset to page 0 when filters change
  useEffect(() => { setPage(0) }, [selectedDefId])
  useEffect(() => { void load() }, [load])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Find the selected definition name for the badge
  const activeDefName = selectedDefId
    ? definitions.find((d) => d.id === selectedDefId)?.name ?? selectedDefId.slice(0, 8) + '…'
    : null

  return (
    <div className="flex flex-col h-full border-r border-gray-200 bg-white w-96 shrink-0">

      {/* ── Workflow filter ─────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2 border-b border-gray-100 space-y-1">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Workflow
        </label>
        <select
          value={selectedDefId}
          onChange={(e) => { setSelectedDefId(e.target.value); setPage(0) }}
          disabled={definitionsLoading}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">All Workflows</option>
          {definitions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}{d.version > 1 ? ` (v${d.version})` : ''}
            </option>
          ))}
        </select>
        {activeDefName && (
          <div className="flex items-center gap-1 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            <span className="text-[10px] text-blue-600 font-medium truncate">{activeDefName}</span>
            <button
              onClick={() => setSelectedDefId('')}
              className="text-[10px] text-gray-400 hover:text-red-500 ml-auto shrink-0"
              title="Clear filter"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ── Search + status filter ───────────────────────────── */}
      <div className="p-3 border-b border-gray-100 space-y-2">
        <div className="flex gap-1">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            placeholder="Search ticket / user…"
            className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs"
          />
          <button
            onClick={load}
            disabled={loading}
            className="bg-blue-600 text-white rounded px-3 py-1.5 text-xs hover:bg-blue-700 disabled:opacity-40"
          >
            {loading ? '…' : 'Search'}
          </button>
        </div>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(0) }}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs"
        >
          <option value="">All statuses</option>
          <option value="0">Active</option>
          <option value="1">Completed</option>
          <option value="2">Cancelled</option>
        </select>
      </div>

      {error && (
        <div className="px-3 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">{error}</div>
      )}

      {/* ── Ticket list ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
        {tickets.length === 0 && !loading && !error && (
          <div className="p-4 text-xs text-gray-400 text-center">No tickets found</div>
        )}
        {loading && tickets.length === 0 && (
          <div className="p-4 text-xs text-gray-400 text-center">Loading…</div>
        )}
        {tickets.map((t) => (
          <button
            key={t.processId}
            onClick={() => onSelect(t)}
            className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors
              ${selectedId === t.processId ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs font-mono font-bold text-gray-800 truncate">{t.noTiket}</span>
              <span className={`text-xs px-1 py-0.5 rounded ml-auto shrink-0 ${STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABELS[t.status] ?? t.status}
              </span>
            </div>
            <p className="text-xs text-gray-600 truncate">{t.workflowName || '—'}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-400 truncate">{t.dibuatOleh}</span>
              {t.tanggalPengajuan && (
                <span className="text-xs text-gray-300 shrink-0">{t.tanggalPengajuan}</span>
              )}
            </div>
            {t.statusPengajuan && (
              <span className="text-xs text-gray-500 italic">{t.statusPengajuan}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Pagination ───────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 text-xs text-gray-500">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="disabled:opacity-40 hover:text-gray-700"
          >
            ← Prev
          </button>
          <span>{page + 1} / {totalPages} ({total} total)</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="disabled:opacity-40 hover:text-gray-700"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Ticket detail panel
// ─────────────────────────────────────────────────────────────

const ALLOWED_STATUSES = ['Draft', 'Menunggu', 'Diproses', 'Selesai', 'Dibatalkan', 'Ditolak']

function TicketDetail({
  ticket,
  onHighlightStep,
}: {
  ticket: TicketListItem
  onHighlightStep?: (n: number | null) => void
}) {
  const [data, setData]               = useState<WfBuilderMonitorResponse | null>(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [statusDraft, setStatusDraft] = useState('')
  const [catatan, setCatatan]         = useState('')
  const [updating, setUpdating]       = useState(false)
  const [updateMsg, setUpdateMsg]     = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'normal' | 'debug' | 'advanced'>('normal')

  const loadDetail = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await monitorInstance(ticket.processId)
    setLoading(false)
    if (res.ok) {
      setData(res.data)
      setStatusDraft(res.data.status ?? '')
      onHighlightStep?.(res.data.activeStepNumber)
    } else {
      setError(res.error)
      setData(null)
    }
  }, [ticket.processId, onHighlightStep])

  useEffect(() => { void loadDetail() }, [loadDetail])

  const handleStatusUpdate = async () => {
    if (!statusDraft.trim()) return
    setUpdating(true)
    setUpdateMsg(null)
    const res = await updateTicketStatus({
      processId: ticket.processId,
      status: statusDraft,
      catatan: catatan.trim() || undefined,
    })
    setUpdating(false)
    if (res.ok) {
      setUpdateMsg('Status updated')
      setCatatan('')
      setTimeout(() => setUpdateMsg(null), 3000)
      void loadDetail()
    } else {
      setUpdateMsg(`Error: ${res.error}`)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
        Loading…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-xs text-red-600 p-4">
        <p>{error}</p>
        <button onClick={loadDetail} className="text-blue-600 hover:underline">Retry</button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="p-4 space-y-4">

        {/* ── 1. Ticket Info ─────────────────────────────────── */}
        <div className="flex items-start gap-3 pb-3 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-mono text-gray-400">{data.noTiket}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded shrink-0
                ${data.status === 'Selesai' ? 'bg-green-100 text-green-700' :
                  data.status === 'Dibatalkan' || data.status === 'Ditolak' ? 'bg-red-100 text-red-700' :
                  'bg-amber-100 text-amber-700'}`}
              >
                {data.status}
              </span>
            </div>
            <h2 className="text-sm font-bold text-gray-900">{data.workflowName}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {data.dibuatOleh} · {data.tanggalPengajuan}
            </p>
            {data.catatanTerakhir && (
              <p className="text-xs text-gray-400 italic mt-1">"{data.catatanTerakhir}"</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {(['normal', 'debug', 'advanced'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`text-[10px] rounded px-2 py-1 border transition-colors font-medium
                  ${viewMode === mode
                    ? mode === 'advanced' ? 'bg-indigo-600 text-white border-indigo-700'
                    : mode === 'debug' ? 'bg-purple-600 text-white border-purple-700'
                    : 'bg-gray-600 text-white border-gray-700'
                    : 'text-gray-500 border-gray-200 hover:bg-gray-50'}`}
              >
                {mode === 'normal' ? 'Normal' : mode === 'debug' ? 'Debug' : 'Advanced'}
              </button>
            ))}
            <button
              onClick={loadDetail}
              className="text-xs text-blue-500 hover:text-blue-700 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50 ml-1"
            >
              ↻
            </button>
          </div>
        </div>

        {/* ── 2. Active Step / Not Started ─────────────────── */}
        {data.activeStepNumber !== null ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold text-blue-600">Active Step</span>
              <span className="ml-auto text-xs text-blue-400">
                {data.totalSteps > 0 && `${data.activeStepNumber} of ${data.totalSteps}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-blue-600 text-white rounded px-1.5 py-0.5 font-mono shrink-0">
                #{data.activeStepNumber}
              </span>
              <span className="text-xs text-blue-500 shrink-0">{data.activeStepType}</span>
              <span className="text-sm font-medium text-gray-800 truncate">{data.activeStepTitle}</span>
            </div>
            {data.activeStepRole && (
              <p className="text-xs text-gray-500 mt-1">
                <span className="font-medium">Assigned to:</span> {data.activeStepRole}
              </p>
            )}
            {data.aktifitasTerakhir && (
              <p className="text-xs text-gray-400 mt-0.5">Last activity: {data.aktifitasTerakhir}</p>
            )}
          </div>
        ) : data.history.length > 0 && data.history.every((h) => h.status === 'NOT_STARTED') ? (
          <NotStartedPanel data={data} />
        ) : null}

        {/* ── 3. Controls: Step Transition + Status ──────────── */}
        <StepTransitionPanel
          data={data}
          statusDraft={statusDraft}
          setStatusDraft={setStatusDraft}
          catatan={catatan}
          setCatatan={setCatatan}
          updating={updating}
          updateMsg={updateMsg}
          onStatusUpdate={handleStatusUpdate}
          onRefresh={loadDetail}
        />

        {/* ── 3b. Force Step (Admin) ──────────────────────── */}
        {data.history.length > 0 && data.history.some((h) => h.taskId) && (
          <ForceStepPanel data={data} onRefresh={loadDetail} />
        )}

        {/* ── 4–5. Variables + Timeline (normal / debug / advanced) */}
        {viewMode === 'advanced' ? (
          <AdvancedMonitor
            history={data.history}
            variables={data.variables}
            activeStep={data.activeStepNumber}
            totalSteps={data.totalSteps}
          />
        ) : viewMode === 'debug' ? (
          <DebugTimeline
            history={data.history}
            variables={data.variables}
            activeStep={data.activeStepNumber}
          />
        ) : (
          <>
            <VariableViewer variables={data.variables} />
            {data.history.length > 0 && (
              <div>
                <SectionHeader label="Timeline" count={data.history.length} />
                <TimelineList history={data.history} activeStep={data.activeStepNumber} />
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Step transition + status control panel
// ─────────────────────────────────────────────────────────────

function StepTransitionPanel({
  data, statusDraft, setStatusDraft, catatan, setCatatan,
  updating, updateMsg, onStatusUpdate, onRefresh,
}: {
  data: WfBuilderMonitorResponse
  statusDraft: string; setStatusDraft: (v: string) => void
  catatan: string; setCatatan: (v: string) => void
  updating: boolean; updateMsg: string | null
  onStatusUpdate: () => void; onRefresh: () => void
}) {
  const [transitioning, setTransitioning] = useState(false)
  const [transitionMsg, setTransitionMsg] = useState<string | null>(null)

  // Find the active task from history
  const activeTask = data.history.find((h) => h.status === 'PENDING' && h.taskId)

  const handleTransition = async (action: 'true' | 'false' | 'save' | 'rollback') => {
    if (!activeTask?.taskId || !data.noTiket) return
    setTransitioning(true)
    setTransitionMsg(null)
    const res = await transitionStep({
      noTiket: data.noTiket,
      taskId: activeTask.taskId,
      action,
      username: data.dibuatOleh?.split('|')[0] || 'builder',
      notes: catatan.trim() || undefined,
    })
    setTransitioning(false)
    if (res.ok) {
      setTransitionMsg(`Step ${action === 'true' ? 'approved' : action === 'false' ? 'rejected' : action}`)
      setCatatan('')
      setTimeout(() => { setTransitionMsg(null); onRefresh() }, 1000)
    } else {
      setTransitionMsg(`Error: ${res.error}`)
    }
  }

  return (
    <div className="space-y-2">
      {/* Step Transition (only when there's an active task) */}
      {activeTask && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-blue-700">Advance Step</span>
            <span className="text-[10px] text-blue-400 font-mono">#{activeTask.stepNumber} · {activeTask.stepTitle}</span>
          </div>
          <div className="flex gap-1.5 mb-2">
            <button
              onClick={() => handleTransition('true')}
              disabled={transitioning}
              className="flex-1 px-2 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40"
            >
              Approve
            </button>
            <button
              onClick={() => handleTransition('false')}
              disabled={transitioning}
              className="flex-1 px-2 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-40"
            >
              Reject
            </button>
            <button
              onClick={() => handleTransition('save')}
              disabled={transitioning}
              className="px-2 py-1.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-40"
            >
              Save
            </button>
          </div>
          <input
            type="text"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="Note (optional)…"
            className="w-full border border-blue-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
          {transitionMsg && (
            <p className={`text-xs mt-1.5 ${transitionMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {transitionMsg}
            </p>
          )}
        </div>
      )}

      {/* Status Update (display label only) */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-xs font-semibold text-amber-700 mb-2">Update Display Status</p>
        <div className="flex gap-2">
          <select
            value={statusDraft}
            onChange={(e) => setStatusDraft(e.target.value)}
            className="flex-1 border border-amber-300 rounded px-2 py-1.5 text-xs bg-white"
          >
            {ALLOWED_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            {!ALLOWED_STATUSES.includes(statusDraft) && statusDraft && (
              <option value={statusDraft}>{statusDraft}</option>
            )}
          </select>
          <button
            onClick={onStatusUpdate}
            disabled={updating}
            className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-40"
          >
            {updating ? '…' : 'Save'}
          </button>
        </div>
        {updateMsg && (
          <p className={`text-xs mt-1.5 ${updateMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
            {updateMsg}
          </p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Force step panel (admin override)
// ─────────────────────────────────────────────────────────────

function ForceStepPanel({ data, onRefresh }: { data: WfBuilderMonitorResponse; onRefresh: () => void }) {
  const [open, setOpen] = useState(false)
  const [targetTaskId, setTargetTaskId] = useState('')
  const [notes, setNotes] = useState('')
  const [forcing, setForcing] = useState(false)
  const [forceMsg, setForceMsg] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  // Only steps that have a taskId (real runtime tasks)
  const steps = data.history.filter((h) => h.taskId)

  const handleForce = async () => {
    if (!targetTaskId || !data.noTiket) return
    setShowConfirm(false)
    setForcing(true)
    setForceMsg(null)
    const res = await forceTransitionStep({
      noTiket: data.noTiket,
      targetTaskId,
      username: data.dibuatOleh?.split('|')[0] || 'admin',
      notes: notes.trim() || undefined,
    })
    setForcing(false)
    if (res.ok) {
      setForceMsg(`Jumped to step ${res.data.activatedStep}`)
      setNotes('')
      setTargetTaskId('')
      setTimeout(() => { setForceMsg(null); onRefresh() }, 1500)
    } else {
      setForceMsg(`Error: ${res.error}`)
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Force Step (Admin)
        </span>
        <span className="text-xs text-gray-400">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-2 bg-white space-y-2">
          <p className="text-[10px] text-amber-600">
            Override workflow flow. Use with caution — this bypasses normal transition rules.
          </p>
          <select
            value={targetTaskId}
            onChange={(e) => setTargetTaskId(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs"
          >
            <option value="">— select target step —</option>
            {steps.map((s) => (
              <option key={s.taskId} value={s.taskId!}>
                #{s.stepNumber} · {s.stepTitle} ({s.status})
              </option>
            ))}
          </select>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reason for force jump…"
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
          />
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!targetTaskId || forcing}
            className="w-full px-3 py-1.5 text-xs bg-red-50 border border-red-200 text-red-600 rounded hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {forcing ? 'Jumping…' : 'Jump to Step'}
          </button>
          {forceMsg && (
            <p className={`text-xs ${forceMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {forceMsg}
            </p>
          )}

          {/* Confirmation modal */}
          {showConfirm && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
                <h3 className="font-bold text-red-800 text-sm mb-2">Confirm Force Jump</h3>
                <p className="text-xs text-gray-600 mb-1">
                  This will deactivate all currently active steps and force-activate the selected target.
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  Target: <span className="font-mono font-bold">{steps.find((s) => s.taskId === targetTaskId)?.stepTitle}</span>
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleForce}
                    className="flex-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Force Jump
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Not-started panel
// ─────────────────────────────────────────────────────────────

function NotStartedPanel({ data }: { data: WfBuilderMonitorResponse }) {
  // Determine if runtime tasks actually exist (status NOT_STARTED means XML fallback)
  const hasRuntimeTasks = data.history.some((h) => h.taskId != null)

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
      <div className="text-2xl mb-2 text-gray-300">◷</div>
      <p className="text-sm font-medium text-gray-500">
        {hasRuntimeTasks
          ? 'Workflow is initialized but waiting for first action'
          : 'No runtime data yet — steps shown from definition'}
      </p>
      <p className="text-xs text-gray-400 mt-1">
        {data.totalSteps} step{data.totalSteps !== 1 ? 's' : ''} defined.
        {hasRuntimeTasks
          ? ' Tasks are created but none have been activated.'
          : ' Variables show default values from the XML definition.'}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Timeline list
// ─────────────────────────────────────────────────────────────

function TimelineList({ history, activeStep }: { history: TaskHistoryItem[]; activeStep: number | null }) {
  return (
    <div className="relative">
      <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-200" />
      <div className="space-y-3">
        {history.map((item, i) => {
          const isActive     = item.stepNumber === activeStep
          const isDone       = item.status === 'COMPLETED'
          const isCancelled  = item.status === 'CANCELLED'
          const isNotStarted = item.status === 'NOT_STARTED'
          return (
            <div key={item.taskId ?? i} className="flex gap-3 relative">
              <div className={`
                w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 z-10 bg-white
                ${isActive ? 'border-blue-500 bg-blue-50' : isDone ? 'border-green-500' : isCancelled ? 'border-red-400' : isNotStarted ? 'border-dashed border-gray-300' : 'border-gray-300'}
              `}>
                <div className={`w-2.5 h-2.5 rounded-full
                  ${isActive ? 'bg-blue-500 animate-pulse' : isDone ? 'bg-green-500' : isCancelled ? 'bg-red-400' : isNotStarted ? 'bg-gray-200' : 'bg-gray-300'}
                `} />
              </div>
              <div className={`flex-1 pb-1 ${isActive ? 'bg-blue-50 -mx-1 px-1 rounded' : ''}`}>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-mono text-gray-400">#{item.stepNumber}</span>
                  <span className="text-xs font-medium text-gray-800 truncate flex-1">{item.stepTitle}</span>
                  <StatusBadge status={item.status} />
                </div>
                {item.role && <p className="text-xs text-gray-400">{item.role}</p>}
                {item.claimBy && <p className="text-xs text-gray-500">by {item.claimBy}</p>}
                {item.completedAt && (
                  <p className="text-xs text-gray-400">{new Date(item.completedAt).toLocaleString()}</p>
                )}
                {item.catatan && (
                  <p className="text-xs text-gray-500 italic mt-0.5">"{item.catatan}"</p>
                )}
                {item.decision && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 inline-block
                    ${item.decision === 'true' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                  >
                    {item.decision === 'true' ? 'Approved' : item.decision === 'false' ? 'Rejected' : item.decision}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: TaskHistoryItem['status'] }) {
  const cls =
    status === 'COMPLETED'   ? 'bg-green-100 text-green-700' :
    status === 'CANCELLED'   ? 'bg-red-100 text-red-700' :
    status === 'NOT_STARTED' ? 'bg-gray-100 text-gray-400' :
                               'bg-amber-100 text-amber-700'
  return <span className={`text-[10px] px-1 py-0.5 rounded shrink-0 ${cls}`}>{status}</span>
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export function MonitoringPage({
  onHighlightStep,
  filterDefinitionId,
}: {
  onHighlightStep?: (n: number | null) => void
  filterDefinitionId?: string
}) {
  const [selected, setSelected] = useState<TicketListItem | null>(null)

  // Clear selected ticket when workflow filter changes
  useEffect(() => { setSelected(null) }, [filterDefinitionId])

  return (
    <div className="flex h-full overflow-hidden">
      <TicketList
        onSelect={setSelected}
        selectedId={selected?.processId ?? null}
        definitionId={filterDefinitionId}
      />
      <div className="flex-1 overflow-hidden flex flex-col">
        {selected ? (
          <TicketDetail ticket={selected} onHighlightStep={onHighlightStep} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-xs">
              <div className="text-4xl mb-3 text-gray-200">◷</div>
              <p className="text-sm font-medium text-gray-500">Select a ticket to view details</p>
              <p className="text-xs text-gray-400 mt-1">
                Use the workflow filter to narrow results
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
