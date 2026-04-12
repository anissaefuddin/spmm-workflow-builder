import { useEffect, useState } from 'react'
import { useWorkflowStore } from '../store/workflow-store'
import { useWorkflowListStore } from '../store/workflow-list-store'
import { useSettingsStore } from '../store/settings-store'
import { getDraft, getDefinitionXml } from '../services/api'
import { parseXmlToJson } from '../services/workflowXmlParser'
import type { WorkflowDSL, WorkflowStep } from '../types/workflow'
import type { DraftListItem, DefinitionListItem } from '../types/workflow-list'

// ── helpers ────────────────────────────────────────────────

function fmt(ts: string | null) {
  if (!ts) return '—'
  try { return new Date(ts).toLocaleDateString() } catch { return ts }
}

const STATUS_CLS: Record<string, string> = {
  DRAFT:     'bg-amber-100 text-amber-700',
  PUBLISHED: 'bg-green-100 text-green-700',
  ARCHIVED:  'bg-gray-100 text-gray-500',
}

const TYPE_COLOR: Record<WorkflowStep['type'], string> = {
  form:            'bg-blue-100 text-blue-700',
  decision_user:   'bg-amber-100 text-amber-700',
  decision_sistem: 'bg-purple-100 text-purple-700',
  system_action:   'bg-teal-100 text-teal-700',
  end:             'bg-gray-100 text-gray-600',
}

// ── sub-components ──────────────────────────────────────────

function StatCard({ label, value, sub, color = 'text-gray-900' }: {
  label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <p className="text-xs text-gray-500 uppercase font-semibold mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function SectionHeader({ title, count, onRefresh, loading }: {
  title: string; count?: number; onRefresh?: () => void; loading?: boolean
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className="text-sm font-bold text-gray-700">{title}</h2>
      {count !== undefined && (
        <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{count}</span>
      )}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={loading}
          className="ml-auto text-xs text-blue-600 hover:underline disabled:opacity-40"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      )}
    </div>
  )
}

// ── Draft list ──────────────────────────────────────────────

function DraftRow({ item, onLoad, isActive }: { item: DraftListItem; onLoad: (d: DraftListItem) => void; isActive?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-gray-800 truncate">{item.name || 'Untitled'}</p>
          {isActive && <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded shrink-0">Active</span>}
        </div>
        <p className="text-xs text-gray-400">
          {item.createdBy && <span className="mr-2">{item.createdBy}</span>}
          Updated {fmt(item.updatedAt)}
        </p>
      </div>
      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${STATUS_CLS[item.status] ?? 'bg-gray-100 text-gray-500'}`}>
        {item.status}
      </span>
      <button
        onClick={() => onLoad(item)}
        className={`px-2.5 py-1 text-xs rounded shrink-0 ${isActive ? 'bg-gray-300 text-gray-600 cursor-default' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
        disabled={isActive}
      >
        {isActive ? 'Loaded' : 'Load'}
      </button>
    </div>
  )
}

// ── Definition list ─────────────────────────────────────────

function DefinitionRow({ item, onImport, isActive }: { item: DefinitionListItem; onImport: (d: DefinitionListItem) => void; isActive?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
          {isActive && <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded shrink-0">Active</span>}
        </div>
        <p className="text-xs text-gray-400">v{item.version} · Updated {fmt(item.updatedAt)}</p>
      </div>
      <button
        onClick={() => onImport(item)}
        className={`px-2.5 py-1 text-xs rounded shrink-0 ${isActive ? 'border border-gray-200 bg-gray-100 text-gray-400 cursor-default' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
        disabled={isActive}
      >
        {isActive ? 'Loaded' : 'Import'}
      </button>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────

export function DashboardPage({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const dsl                = useWorkflowStore((s) => s.dsl)
  const activeDraftId      = useWorkflowStore((s) => s.draftId)
  const activeDraftSource  = useWorkflowStore((s) => s.draftSource)
  const resetDSL           = useWorkflowStore((s) => s.resetDSL)
  const loadDSLFromBackend = useWorkflowStore((s) => s.loadDSLFromBackend)
  const { backendUrl }     = useSettingsStore()

  const {
    drafts, draftsLoading, draftsError,
    definitions, definitionsLoading, definitionsError,
    monitorSummary, monitorLoading,
    fetchDrafts, fetchDefinitions, fetchMonitorSummary, fetchAll,
  } = useWorkflowListStore()

  const [loadingId, setLoadingId]   = useState<string | null>(null)
  const [loadError, setLoadError]   = useState<string | null>(null)

  // Fetch on mount and when backend URL changes
  useEffect(() => { void fetchAll() }, [backendUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load draft into builder ──────────────────────────────

  const handleLoadDraft = async (item: DraftListItem) => {
    setLoadingId(item.draftId)
    setLoadError(null)
    const res = await getDraft(item.draftId)
    setLoadingId(null)
    if (!res.ok) { setLoadError(res.error); return }

    // Prefer JSON DSL; fall back to parsing XML
    let dsl: WorkflowDSL | null = null
    if (res.data.jsonDsl) {
      try { dsl = JSON.parse(res.data.jsonDsl) as WorkflowDSL } catch { /* fall through */ }
    }
    if (!dsl && res.data.xmlDefinition) {
      const parsed = parseXmlToJson(res.data.xmlDefinition, { processName: item.name })
      if (parsed.ok) dsl = parsed.data
      else { setLoadError(`XML parse error: ${parsed.error}`); return }
    }
    if (!dsl) { setLoadError('No DSL or XML found in draft'); return }

    loadDSLFromBackend(dsl, item.draftId, 'draft', item.publishedDefinitionId ?? null)
    onNavigate?.('canvas')
  }

  // ── Import definition XML into builder ───────────────────

  const handleImportDefinition = async (item: DefinitionListItem) => {
    setLoadingId(item.id)
    setLoadError(null)
    const res = await getDefinitionXml(item.id)
    setLoadingId(null)
    if (!res.ok) { setLoadError(res.error); return }

    const parsed = parseXmlToJson(res.data.xml, { processName: item.name })
    if (!parsed.ok) { setLoadError(`XML parse error: ${parsed.error}`); return }

    // Use definitionId as the draftId placeholder so Save will create a NEW draft
    loadDSLFromBackend(parsed.data, item.id, 'definition', item.id)
    onNavigate?.('canvas')
  }

  // ── Current workflow summary (loaded in builder) ─────────

  const stepTypeCounts = dsl
    ? dsl.process.steps.reduce<Record<string, number>>((acc, s) => { acc[s.type] = (acc[s.type] ?? 0) + 1; return acc }, {})
    : {}

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6 space-y-6">

      {/* ── Load error banner ── */}
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 flex items-center gap-2">
          <span className="text-red-700 text-sm flex-1">{loadError}</span>
          <button onClick={() => setLoadError(null)} className="text-red-400 text-xs hover:text-red-600">Dismiss</button>
        </div>
      )}

      {/* ── Monitoring summary ── */}
      {backendUrl && (
        <div>
          <SectionHeader
            title="Live Instances"
            onRefresh={fetchMonitorSummary}
            loading={monitorLoading}
          />
          {monitorSummary ? (
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="Active"    value={monitorSummary.active}    color="text-amber-600" />
              <StatCard label="Completed" value={monitorSummary.completed} color="text-green-600" />
              <StatCard label="Cancelled" value={monitorSummary.cancelled} color="text-red-500" />
              <StatCard label="Total"     value={monitorSummary.total} />
            </div>
          ) : (
            <p className="text-xs text-gray-400">{monitorLoading ? 'Loading…' : 'No data'}</p>
          )}
        </div>
      )}

      {/* ── Builder drafts ── */}
      {backendUrl && (
        <div>
          <SectionHeader
            title="Saved Drafts"
            count={drafts.length}
            onRefresh={fetchDrafts}
            loading={draftsLoading}
          />
          {draftsError && <p className="text-xs text-red-600 mb-2">{draftsError}</p>}
          {drafts.length === 0 && !draftsLoading && !draftsError && (
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-6 text-center">
              <p className="text-xs text-gray-400">No saved drafts yet.</p>
              <p className="text-xs text-gray-400 mt-1">Load a workflow and click <strong>Save</strong> in the toolbar.</p>
            </div>
          )}
          {drafts.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {drafts.map((d) => (
                <div key={d.draftId} className={loadingId === d.draftId ? 'opacity-50 pointer-events-none' : ''}>
                  <DraftRow
                    item={d}
                    onLoad={handleLoadDraft}
                    isActive={activeDraftSource === 'draft' && activeDraftId === d.draftId}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Live definitions ── */}
      {backendUrl && (
        <div>
          <SectionHeader
            title="Live Definitions (wf_process_definition)"
            count={definitions.length}
            onRefresh={fetchDefinitions}
            loading={definitionsLoading}
          />
          {definitionsError && <p className="text-xs text-red-600 mb-2">{definitionsError}</p>}
          {definitions.length === 0 && !definitionsLoading && !definitionsError && (
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-6 text-center">
              <p className="text-xs text-gray-400">No published definitions found.</p>
            </div>
          )}
          {definitions.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {definitions.map((d) => (
                <div key={d.id} className={loadingId === d.id ? 'opacity-50 pointer-events-none' : ''}>
                  <DefinitionRow
                    item={d}
                    onImport={handleImportDefinition}
                    isActive={activeDraftSource === 'definition' && activeDraftId === d.id}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Current workflow in builder ── */}
      {dsl ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-gray-700 mb-1">Currently in Builder</h2>
            <p className="text-lg font-bold text-gray-900">{dsl.process.name}</p>
            <p className="text-xs text-gray-400 font-mono">{dsl.process.id}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Steps"     value={dsl.process.steps.length} />
            <StatCard label="Variables" value={dsl.process.variables.length} />
            <StatCard label="Roles"     value={dsl.process.roles.length} />
            <StatCard label="Groups"    value={dsl.process.listGrup.length} />
          </div>

          {/* Step type breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center">
              <h2 className="text-sm font-bold text-gray-700">Steps</h2>
              <button
                onClick={() => onNavigate?.('canvas')}
                className="ml-auto text-xs text-blue-600 hover:underline"
              >
                Open Canvas →
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {dsl.process.steps.map((step) => (
                <div key={step.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="text-xs font-mono text-gray-400 w-5 text-right">{step.number}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_COLOR[step.type]}`}>{step.type}</span>
                  <span className="text-sm text-gray-700 flex-1 truncate">
                    {'title' in step && step.title ? step.title : `Step ${step.number}`}
                  </span>
                  {step.transitions.true  !== undefined && <span className="text-xs text-green-500 font-mono shrink-0">→{step.transitions.true}</span>}
                  {step.transitions.false !== undefined && <span className="text-xs text-red-400 font-mono shrink-0">→{step.transitions.false}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Step types bar chart */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs font-bold text-gray-600 mb-3">Step Types</p>
            <div className="space-y-2">
              {Object.entries(stepTypeCounts).map(([type, count]) => (
                <div key={type} className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium w-28 shrink-0 ${TYPE_COLOR[type as WorkflowStep['type']]}`}>{type}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                    <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${(count / dsl.process.steps.length) * 100}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 w-4 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* No workflow loaded */
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="text-5xl">⬡</div>
          <h2 className="text-xl font-bold text-gray-700">No Workflow in Builder</h2>
          <p className="text-sm text-gray-500 text-center max-w-xs">
            {backendUrl
              ? 'Load a saved draft above, import a live definition, or start fresh.'
              : 'Import an XML file or start a new workflow. Configure Backend URL in Settings to sync with the server.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={resetDSL}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              New Workflow
            </button>
          </div>
        </div>
      )}

      {/* No backend configured prompt */}
      {!backendUrl && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700 text-center">
          <p className="font-semibold mb-1">Backend not configured</p>
          <p>Open <strong>⚙ Settings</strong> and enter your Spring Boot server URL to enable sync, monitoring and live definitions.</p>
        </div>
      )}
    </div>
  )
}
