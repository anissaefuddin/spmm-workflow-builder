/**
 * XmlEditorPanel — live XML editor for advanced workflow editing.
 *
 * Modes:
 *   - View: readonly display of current XML
 *   - Edit: editable textarea with syntax feedback
 *
 * Actions:
 *   - Validate: calls POST /validate-xml
 *   - Preview Changes: parses XML to DSL, diffs against current DSL
 *   - Save Draft: saves XML to wf_builder_draft (no publish)
 *   - Publish: saves + publishes (with active-process warning)
 *
 * Safety:
 *   - Does NOT overwrite runtime data
 *   - Does NOT modify wf_process / wf_task
 *   - Publish creates a new version in wf_process_definition
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useWorkflowStore } from '../../store/workflow-store'
import { useSettingsStore } from '../../store/settings-store'
import { generateXmlFromJson } from '../../services/workflowXmlGenerator'
import { parseXmlToJson } from '../../services/workflowXmlParser'
import { apiPost } from '../../services/apiClient'
import { saveDraft } from '../../services/api'
import { compareDSL } from '../../lib/dsl-diff'
import type { DiffEntry } from '../../lib/dsl-diff'

interface Props {
  onClose?: () => void
}

type EditorMode = 'view' | 'edit'

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  stepCount?: number
  variableCount?: number
}

export function XmlEditorPanel({ onClose }: Props) {
  const dsl = useWorkflowStore((s) => s.dsl)
  const loadDSL = useWorkflowStore((s) => s.loadDSL)
  const draftId = useWorkflowStore((s) => s.draftId)
  const setDraftId = useWorkflowStore((s) => s.setDraftId)
  const activeDefinitionId = useWorkflowStore((s) => s.activeDefinitionId)
  const backendUrl = useSettingsStore((s) => s.backendUrl)

  const [mode, setMode] = useState<EditorMode>('view')
  const [xml, setXml] = useState('')
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [diff, setDiff] = useState<DiffEntry[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Generate XML from current DSL on open
  useEffect(() => {
    if (!dsl) return
    const result = generateXmlFromJson(dsl)
    if (result.ok) setXml(result.xml)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Validate XML ──
  const handleValidate = useCallback(async () => {
    setValidating(true)
    setValidation(null)
    const res = await apiPost<ValidationResult>('/validate-xml', {
      xml,
      definitionId: activeDefinitionId ?? undefined,
    })
    setValidating(false)
    if (res.ok) {
      setValidation(res.data)
    } else {
      setValidation({ valid: false, errors: [res.error], warnings: [] })
    }
  }, [xml, activeDefinitionId])

  // ── Preview Changes (diff) ──
  const handlePreviewDiff = useCallback(() => {
    if (!dsl) return
    const parsed = parseXmlToJson(xml, { processName: dsl.process.name })
    if (!parsed.ok) {
      setValidation({ valid: false, errors: [parsed.error], warnings: parsed.warnings })
      return
    }
    setDiff(compareDSL(dsl, parsed.data))
  }, [xml, dsl])

  // ── Save Draft (no publish) ──
  const handleSaveDraft = useCallback(async (publish = false) => {
    if (!dsl || !backendUrl) return

    // Validate first
    const vRes = await apiPost<ValidationResult>('/validate-xml', { xml })
    if (vRes.ok && !vRes.data.valid) {
      setValidation(vRes.data)
      return
    }

    // Parse to DSL so we can save both xml + jsonDsl
    const parsed = parseXmlToJson(xml, { processName: dsl.process.name })
    if (!parsed.ok) {
      setSaveMsg(`Parse error: ${parsed.error}`)
      return
    }

    setSaving(true)
    setSaveMsg(null)
    const res = await saveDraft({
      draftId: draftId ?? undefined,
      name: parsed.data.process.name,
      dsl: parsed.data,
      publish,
    })
    setSaving(false)

    if (res.ok) {
      setDraftId(res.data.draftId)
      loadDSL(parsed.data) // update canvas with the edited DSL
      setSaveMsg(publish
        ? `Published v${res.data.publishedDefinitionId?.slice(0, 8) ?? ''}…`
        : `Draft saved · ${res.data.draftId.slice(0, 8)}…`)
      // Clear after 3s
      setTimeout(() => setSaveMsg(null), 3000)
    } else {
      setSaveMsg(`Error: ${res.error}`)
    }
  }, [xml, dsl, draftId, backendUrl, loadDSL, setDraftId])

  // ── Keyboard: Ctrl+S to save ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && mode === 'edit') {
        e.preventDefault()
        void handleSaveDraft(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mode, handleSaveDraft])

  if (!dsl) return null

  const lineCount = xml.split('\n').length

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center px-5 py-3 border-b border-gray-200 gap-3 shrink-0">
          <h2 className="font-bold text-gray-800 text-sm flex-1">XML Editor</h2>

          {/* Mode toggle */}
          <div className="flex gap-0.5 bg-gray-100 rounded p-0.5">
            {(['view', 'edit'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors
                  ${mode === m ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {m === 'view' ? 'View' : 'Edit'}
              </button>
            ))}
          </div>

          {/* Line count */}
          <span className="text-[10px] text-gray-400 font-mono">{lineCount} lines</span>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 bg-gray-50">
          <button
            onClick={handleValidate}
            disabled={validating}
            className="px-3 py-1 text-xs border border-blue-300 text-blue-700 rounded hover:bg-blue-50 disabled:opacity-40"
          >
            {validating ? '…' : 'Validate'}
          </button>
          <button
            onClick={handlePreviewDiff}
            disabled={mode !== 'edit'}
            className="px-3 py-1 text-xs border border-purple-300 text-purple-700 rounded hover:bg-purple-50 disabled:opacity-40"
          >
            Preview Changes
          </button>
          <div className="flex-1" />
          <button
            onClick={() => handleSaveDraft(false)}
            disabled={saving || mode !== 'edit'}
            className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40"
          >
            {saving ? '…' : 'Save Draft'}
          </button>
          <button
            onClick={() => {
              if (window.confirm('Publish this XML? This creates a new process definition version.')) {
                void handleSaveDraft(true)
              }
            }}
            disabled={saving || mode !== 'edit'}
            className="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40"
          >
            Publish
          </button>
          {saveMsg && (
            <span className={`text-xs ${saveMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {saveMsg}
            </span>
          )}
        </div>

        {/* Validation results */}
        {validation && (
          <div className={`px-5 py-2 border-b text-xs space-y-0.5
            ${validation.valid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-2">
              <span className={`font-bold ${validation.valid ? 'text-green-700' : 'text-red-700'}`}>
                {validation.valid ? '✓ Valid' : '✕ Invalid'}
              </span>
              {validation.stepCount !== undefined && (
                <span className="text-gray-500">{validation.stepCount} steps · {validation.variableCount} variables</span>
              )}
              <button onClick={() => setValidation(null)} className="ml-auto text-gray-400 hover:text-gray-600">dismiss</button>
            </div>
            {validation.errors.map((e, i) => (
              <p key={i} className="text-red-600">Error: {e}</p>
            ))}
            {validation.warnings.map((w, i) => (
              <p key={i} className="text-amber-600">Warning: {w}</p>
            ))}
          </div>
        )}

        {/* Diff preview */}
        {diff && (
          <div className="px-5 py-2 border-b border-purple-200 bg-purple-50 max-h-40 overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-purple-700">
                {diff.length === 0 ? 'No changes detected' : `${diff.length} change${diff.length > 1 ? 's' : ''}`}
              </span>
              <button onClick={() => setDiff(null)} className="text-[10px] text-gray-400 hover:text-gray-600">dismiss</button>
            </div>
            {diff.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                <span className={`font-bold w-14 shrink-0
                  ${d.action === 'added' ? 'text-green-600' : d.action === 'removed' ? 'text-red-600' : 'text-blue-600'}`}>
                  {d.action === 'added' ? '+ ADD' : d.action === 'removed' ? '- DEL' : '~ MOD'}
                </span>
                <span className="text-gray-600 font-medium">[{d.category}]</span>
                <span className="text-gray-800">{d.label}</span>
                {d.detail && <span className="text-gray-400 truncate">{d.detail}</span>}
              </div>
            ))}
          </div>
        )}

        {/* XML editor */}
        <div className="flex-1 overflow-hidden relative">
          <textarea
            ref={textareaRef}
            value={xml}
            onChange={(e) => mode === 'edit' ? setXml(e.target.value) : undefined}
            readOnly={mode === 'view'}
            spellCheck={false}
            className={`w-full h-full p-4 font-mono text-xs leading-relaxed resize-none focus:outline-none
              ${mode === 'view'
                ? 'bg-gray-50 text-gray-700 cursor-default'
                : 'bg-white text-gray-900'}`}
            style={{ tabSize: 2 }}
          />
        </div>
      </div>
    </div>
  )
}
