import { useRef, useState, useEffect } from 'react'
import { useWorkflowStore } from '../store/workflow-store'
import { useWorkflowListStore } from '../store/workflow-list-store'
import { useSettingsStore } from '../store/settings-store'
import { parseXmlToJson } from '../services/workflowXmlParser'
import { generateXmlFromJson } from '../services/workflowXmlGenerator'
import { saveDraft, saveRoleConfig, saveButtonMap } from '../services/api'
import type { StepType } from '../types/workflow'

interface ToolbarProps {
  onOpenSettings?: () => void
  /** Current active tab — used to disable context-inappropriate buttons */
  activeTab?: string
  /** Open variable flow analysis panel */
  onOpenVarFlow?: () => void
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function Toolbar({ onOpenSettings, activeTab, onOpenVarFlow }: ToolbarProps) {
  const { dsl, loadDSL, resetDSL, addStep, draftId, setDraftId, setActiveDefinitionId, undo, redo, canUndo, canRedo } = useWorkflowStore()
  const fetchAll = useWorkflowListStore((s) => s.fetchAll)
  const backendUrl = useSettingsStore((s) => s.backendUrl)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Keyboard shortcuts: Ctrl+Z / Ctrl+Shift+Z ──────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [undo, redo])

  const [error, setError]       = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [xmlPreview, setXmlPreview] = useState<string | null>(null)
  const [showJson, setShowJson] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveMsg, setSaveMsg]   = useState('')

  const handleImportXml = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const xml = ev.target?.result as string
      const result = parseXmlToJson(xml, { processName: file.name.replace(/\.xml$/, '') })
      if (result.ok) {
        loadDSL(result.data)
        setWarnings(result.warnings)
        setError(null)
      } else {
        setError(result.error)
        setWarnings(result.warnings)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleExportXml = () => {
    if (!dsl) return
    const result = generateXmlFromJson(dsl)
    if (result.ok) { setXmlPreview(result.xml); setError(null) }
    else            setError(result.error)
  }

  const downloadXml = () => {
    if (!dsl) return
    const result = generateXmlFromJson(dsl)
    if (!result.ok) { setError(result.error); return }
    triggerDownload(result.xml, `${dsl.process.name.replace(/\s+/g, '_')}.xml`, 'application/xml')
  }

  const downloadJson = () => {
    if (!dsl) return
    triggerDownload(
      JSON.stringify(dsl, null, 2),
      `${dsl.process.name.replace(/\s+/g, '_')}_dsl.json`,
      'application/json',
    )
  }

  const handleSave = async (publish = false) => {
    if (!dsl || !backendUrl) return
    setSaveState('saving')
    setSaveMsg('')
    // Pre-generate XML on the frontend so the backend stores our correct output
    // verbatim (preserves <required> positioning, raw form_data JSON, etc.)
    const genRes = generateXmlFromJson(dsl)
    if (!genRes.ok) {
      setSaveState('error')
      setSaveMsg(`XML generation failed: ${genRes.error}`)
      return
    }
    const res = await saveDraft({
      draftId: draftId ?? undefined,
      name:    dsl.process.name,
      dsl,
      publish,
      xmlDefinition: genRes.xml,
    })
    if (res.ok) {
      const newId = res.data.draftId
      setDraftId(newId)

      // CRITICAL: persist publishedDefinitionId to store after publish
      // This ensures subsequent saves/publishes UPDATE the existing definition
      // instead of creating a duplicate.
      const defId = res.data.publishedDefinitionId
      if (defId) {
        setActiveDefinitionId(defId)
      }

      // Sync role config + button map on publish
      if (publish && defId) {
        if (dsl.process.roleConfig?.length)  void saveRoleConfig(defId, dsl.process.roleConfig)
        if (dsl.process.buttonMap?.length)   void saveButtonMap(defId, dsl.process.buttonMap)
      }

      setSaveState('saved')
      setSaveMsg(publish ? `Published · ${(defId ?? newId).slice(0, 8)}…` : `Saved · ${newId.slice(0, 8)}…`)
      void fetchAll()
      setTimeout(() => setSaveState('idle'), 3000)
    } else {
      setSaveState('error')
      setSaveMsg(res.error)
    }
  }

  // Builder actions (export, add step) are only available in the Canvas tab
  const canEdit = !activeTab || activeTab === 'canvas'
  const editTitle = 'Only available in Canvas tab'

  const stepTypes: { type: StepType; label: string; color: string }[] = [
    { type: 'form',            label: '+ Form',          color: 'bg-blue-500 hover:bg-blue-600' },
    { type: 'decision_user',   label: '+ User Decision', color: 'bg-amber-500 hover:bg-amber-600' },
    { type: 'decision_sistem', label: '+ Sys Check',     color: 'bg-purple-500 hover:bg-purple-600' },
    { type: 'system_action',   label: '+ System Action', color: 'bg-teal-600 hover:bg-teal-700' },
    { type: 'end',             label: '+ End',           color: 'bg-gray-600 hover:bg-gray-700' },
  ]

  return (
    <>
      <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 shadow-sm flex-shrink-0">
        {/* Brand */}
        <div className="flex items-center gap-2 mr-4">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-black">WF</span>
          </div>
          <span className="font-bold text-gray-800 text-sm">SPMM Workflow Builder</span>
        </div>

        {/* Undo / Redo */}
        {dsl && (
          <>
            <div className="w-px h-6 bg-gray-200" />
            <button
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="px-2 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ↩
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              className="px-2 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ↪
            </button>
          </>
        )}

        <div className="w-px h-6 bg-gray-200" />

        {/* Import / Export */}
        <input ref={fileRef} type="file" accept=".xml" className="hidden" onChange={handleImportXml} />
        <button
          onClick={() => fileRef.current?.click()}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
        >
          Import XML
        </button>
        <button
          onClick={handleExportXml}
          disabled={!dsl || !canEdit}
          title={!canEdit ? editTitle : undefined}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Preview XML
        </button>
        <button
          onClick={downloadXml}
          disabled={!dsl || !canEdit}
          title={!canEdit ? editTitle : undefined}
          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Export XML
        </button>
        <button
          onClick={downloadJson}
          disabled={!dsl || !canEdit}
          title={!canEdit ? editTitle : undefined}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Export JSON DSL
        </button>
        <button
          onClick={() => setShowJson(!showJson)}
          disabled={!dsl || !canEdit}
          title={!canEdit ? editTitle : undefined}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {showJson ? 'Hide JSON' : 'View JSON'}
        </button>
        {dsl && (
          <button
            onClick={onOpenVarFlow}
            disabled={!canEdit}
            title={!canEdit ? editTitle : 'Variable flow analysis — see which steps use which variables'}
            className="px-3 py-1.5 text-sm border border-purple-300 rounded hover:bg-purple-50 text-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Var Flow
          </button>
        )}

        {/* Save to backend */}
        {dsl && backendUrl && (
          <>
            <div className="w-px h-6 bg-gray-200" />
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSave(false)}
                disabled={saveState === 'saving'}
                className={`px-3 py-1.5 text-sm rounded font-medium transition-colors disabled:opacity-40
                  ${saveState === 'saved' ? 'bg-green-600 text-white'
                  : saveState === 'error' ? 'bg-red-100 border border-red-300 text-red-700'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
              >
                {saveState === 'saving' ? 'Saving…'
                 : saveState === 'saved' ? 'Saved ✓'
                 : draftId ? 'Update' : 'Save'}
              </button>
              <button
                onClick={() => { if (window.confirm('Publish workflow? This will create a live process definition.')) handleSave(true) }}
                disabled={saveState === 'saving'}
                className="px-3 py-1.5 text-sm rounded font-medium bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
                title="Save draft AND publish to wf_process_definition (syncs role config + button map)"
              >
                Publish
              </button>
              {saveState === 'error' && (
                <span className="text-xs text-red-600 max-w-xs truncate" title={saveMsg}>{saveMsg}</span>
              )}
              {saveState === 'saved' && (
                <span className="text-xs text-green-600 font-mono">{saveMsg}</span>
              )}
            </div>
          </>
        )}

        <div className="w-px h-6 bg-gray-200" />

        {/* Add Step buttons */}
        {dsl && stepTypes.map(({ type, label, color }) => (
          <button
            key={type}
            onClick={() => canEdit ? addStep(type) : undefined}
            disabled={!canEdit}
            title={!canEdit ? editTitle : undefined}
            className={`px-3 py-1.5 text-sm text-white rounded transition-opacity
              ${canEdit ? color : 'bg-gray-400 cursor-not-allowed opacity-40'}`}
          >
            {label}
          </button>
        ))}

        {/* New + Settings */}
        <div className="ml-auto flex items-center gap-2">
          {draftId && (
            <span className="text-xs text-gray-400 font-mono hidden md:block" title={draftId}>
              #{draftId.slice(0, 8)}
            </span>
          )}
          <button
            onClick={() => {
              if (window.confirm('Start a new blank workflow? Unsaved changes will be lost.')) resetDSL()
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
          >
            New
          </button>
          <button onClick={onOpenSettings} title="Settings"
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700">
            ⚙ Settings
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2">
          <span className="text-red-700 text-sm font-medium">Error:</span>
          <span className="text-red-700 text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 text-xs">Dismiss</button>
        </div>
      )}

      {warnings.length > 0 && !error && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-start gap-2">
          <span className="text-amber-700 text-xs font-semibold shrink-0 mt-0.5">
            {warnings.length} warning{warnings.length > 1 ? 's' : ''}:
          </span>
          <span className="text-amber-700 text-xs flex-1">{warnings.join(' · ')}</span>
          <button onClick={() => setWarnings([])} className="ml-auto text-amber-500 text-xs shrink-0">Dismiss</button>
        </div>
      )}

      {xmlPreview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-full">
            <div className="flex items-center px-4 py-3 border-b border-gray-200">
              <h2 className="font-bold text-gray-800">XML Preview</h2>
              <button onClick={downloadXml}
                className="ml-auto mr-2 px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">
                Download
              </button>
              <button onClick={() => setXmlPreview(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-gray-700 bg-gray-50">{xmlPreview}</pre>
          </div>
        </div>
      )}

      {showJson && dsl && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-full">
            <div className="flex items-center px-4 py-3 border-b border-gray-200">
              <h2 className="font-bold text-gray-800">JSON DSL</h2>
              <button onClick={downloadJson}
                className="ml-auto mr-2 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                Download
              </button>
              <button onClick={() => setShowJson(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-gray-700 bg-gray-50">
              {JSON.stringify(dsl, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  )
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
