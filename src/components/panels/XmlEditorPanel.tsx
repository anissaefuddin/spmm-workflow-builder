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
import { validateWorkflow } from '../../lib/workflow-validator'
import type { ValidationReport } from '../../lib/workflow-validator'
import { simulate, summarizeSimulation } from '../../lib/workflow-simulator'
import type { SimulationResult } from '../../lib/workflow-simulator'
import { autoFixWorkflow, summarizeAutofix } from '../../lib/workflow-autofix'

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
  const [clientReport, setClientReport] = useState<ValidationReport | null>(null)
  const [simResult, setSimResult] = useState<SimulationResult | null>(null)
  const [autofixMsg, setAutofixMsg] = useState<string | null>(null)
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
  // Runs two checks:
  //   1. Server XML validation (well-formed + active process count)
  //   2. Client-side DSL validation (full checklist: roles, options, decisions, parallel, reachability)
  const handleValidate = useCallback(async () => {
    setValidating(true)
    setValidation(null)
    setClientReport(null)

    // Client-side: parse the XML to DSL, then run full validator
    const parsed = parseXmlToJson(xml, { processName: dsl?.process.name ?? 'workflow' })
    if (parsed.ok) {
      setClientReport(validateWorkflow(parsed.data))
    } else {
      setClientReport({
        valid: false, errors: 1, warnings: 0, infos: 0,
        issues: [{ severity: 'error', category: 'xml', message: parsed.error }],
      })
    }

    // Server-side XML well-formedness + active-process warning
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
  }, [xml, dsl, activeDefinitionId])

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

  // ── Simulate execution paths ──
  const handleSimulate = useCallback(() => {
    if (!dsl) return
    const parsed = parseXmlToJson(xml, { processName: dsl.process.name })
    const target = parsed.ok ? parsed.data : dsl
    const result = simulate(target, { maxPaths: 200, maxDepth: 150 })
    setSimResult(result)
  }, [xml, dsl])

  // ── Auto-Fix: parse current XML → DSL → run autofix → regenerate XML ──
  const handleAutofix = useCallback(() => {
    if (!dsl) return
    const parsed = parseXmlToJson(xml, { processName: dsl.process.name })
    if (!parsed.ok) {
      setAutofixMsg(`Parse error: ${parsed.error}`)
      setTimeout(() => setAutofixMsg(null), 3000)
      return
    }
    const result = autoFixWorkflow(parsed.data)
    if (result.fixedCount === 0 && result.flaggedCount === 0) {
      setAutofixMsg('No issues to fix — workflow is clean')
      setTimeout(() => setAutofixMsg(null), 3000)
      return
    }
    // Regenerate XML from the fixed DSL
    const regen = generateXmlFromJson(result.dsl)
    if (regen.ok) {
      setXml(regen.xml)
      // Refresh the client report so the user sees the improvements
      setClientReport(validateWorkflow(result.dsl))
    }
    setAutofixMsg(`✓ ${summarizeAutofix(result)}`)
    setTimeout(() => setAutofixMsg(null), 5000)
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
    // Send the edited XML verbatim — the user's hand-edited XML is the source
    // of truth here, not the parsed/regenerated version.
    const res = await saveDraft({
      draftId: draftId ?? undefined,
      name: parsed.data.process.name,
      dsl: parsed.data,
      publish,
      xmlDefinition: xml,
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
          <button
            onClick={handleSimulate}
            className="px-3 py-1 text-xs border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50"
            title="Run workflow simulation to detect deadlocks, loops, and premature ends"
          >
            ⚡ Simulate
          </button>
          <button
            onClick={handleAutofix}
            disabled={mode !== 'edit'}
            className="px-3 py-1 text-xs border border-emerald-300 text-emerald-700 rounded hover:bg-emerald-50 disabled:opacity-40"
            title="Apply safe auto-fixes: role format, Option value2, duplicate vars, transition normalization"
          >
            🔧 Auto-Fix
          </button>
          {autofixMsg && (
            <span className={`text-xs ${autofixMsg.startsWith('✓') ? 'text-green-600' : 'text-amber-600'}`}>
              {autofixMsg}
            </span>
          )}
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
                {validation.valid ? '✓ XML Valid' : '✕ XML Invalid'}
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

        {/* Client-side DSL validation report */}
        {clientReport && (
          <div className={`px-5 py-2 border-b text-xs space-y-0.5 max-h-48 overflow-y-auto
            ${clientReport.valid ? 'bg-green-50/50 border-green-200' : 'bg-red-50/50 border-red-200'}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`font-bold ${clientReport.valid ? 'text-green-700' : 'text-red-700'}`}>
                {clientReport.valid ? '✓ DSL Valid' : '✕ DSL Invalid'}
              </span>
              <span className="text-gray-500">
                {clientReport.errors} errors · {clientReport.warnings} warnings · {clientReport.infos} info
              </span>
              <button onClick={() => setClientReport(null)} className="ml-auto text-gray-400 hover:text-gray-600">dismiss</button>
            </div>
            {clientReport.issues.map((issue, i) => {
              const isLogic = issue.category.startsWith('logic:')
              const displayCategory = isLogic ? issue.category.slice(6) : issue.category
              const color =
                issue.severity === 'error' ? 'text-red-600' :
                issue.severity === 'warning' ? 'text-amber-600' : 'text-blue-500'
              const icon =
                issue.severity === 'error' ? '✕' :
                issue.severity === 'warning' ? '⚠' : 'ℹ'
              // Logic issues get a distinctive purple/violet tag so users see runtime-semantic
              // problems separately from structural ones.
              const tagCls = isLogic
                ? 'bg-purple-100 text-purple-700 font-semibold'
                : 'bg-gray-100 text-gray-500'
              return (
                <p key={i} className={`${color} flex gap-1.5 items-start`}>
                  <span className="shrink-0">{icon}</span>
                  <span className={`text-[10px] px-1 rounded shrink-0 ${tagCls}`}>
                    {isLogic && '⚡ '}{displayCategory}
                  </span>
                  <span>{issue.message}</span>
                </p>
              )
            })}
          </div>
        )}

        {/* Simulation result */}
        {simResult && (
          <div className="px-5 py-2 border-b border-indigo-200 bg-indigo-50/50 max-h-48 overflow-y-auto">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-indigo-700">⚡ Execution Simulation</span>
              <span className="text-[10px] text-gray-500">{summarizeSimulation(simResult)}</span>
              <button onClick={() => setSimResult(null)} className="ml-auto text-[10px] text-gray-400 hover:text-gray-600">dismiss</button>
            </div>
            <div className="grid grid-cols-4 gap-2 text-[10px] mb-1.5">
              <div className="bg-white rounded border border-gray-200 px-2 py-1">
                <div className="text-gray-400 uppercase">Paths</div>
                <div className="font-mono font-bold text-gray-800">{simResult.paths.length}</div>
              </div>
              <div className={`rounded border px-2 py-1 ${simResult.deadlocks.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
                <div className="text-gray-400 uppercase">Deadlocks</div>
                <div className={`font-mono font-bold ${simResult.deadlocks.length > 0 ? 'text-red-700' : 'text-gray-800'}`}>
                  {simResult.deadlocks.length}
                </div>
              </div>
              <div className={`rounded border px-2 py-1 ${simResult.infiniteLoops.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
                <div className="text-gray-400 uppercase">Loops</div>
                <div className={`font-mono font-bold ${simResult.infiniteLoops.length > 0 ? 'text-amber-700' : 'text-gray-800'}`}>
                  {simResult.infiniteLoops.length}
                </div>
              </div>
              <div className={`rounded border px-2 py-1 ${simResult.prematureEnds.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
                <div className="text-gray-400 uppercase">Premature</div>
                <div className={`font-mono font-bold ${simResult.prematureEnds.length > 0 ? 'text-red-700' : 'text-gray-800'}`}>
                  {simResult.prematureEnds.length}
                </div>
              </div>
            </div>

            {simResult.deadlocks.length > 0 && (
              <p className="text-[10px] text-red-600">Deadlock at step{simResult.deadlocks.length !== 1 ? 's' : ''}: {simResult.deadlocks.join(', ')}</p>
            )}
            {simResult.infiniteLoops.length > 0 && (
              <p className="text-[10px] text-amber-600">Loop detected involving step{simResult.infiniteLoops.length !== 1 ? 's' : ''}: {simResult.infiniteLoops.join(', ')}</p>
            )}
            {simResult.prematureEnds.length > 0 && (
              <p className="text-[10px] text-red-600">Premature end at step{simResult.prematureEnds.length !== 1 ? 's' : ''}: {simResult.prematureEnds.join(', ')}</p>
            )}

            {/* Path outcome breakdown */}
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(
                simResult.paths.reduce<Record<string, number>>((acc, p) => {
                  acc[p.outcome] = (acc[p.outcome] ?? 0) + 1
                  return acc
                }, {}),
              ).map(([outcome, count]) => (
                <span key={outcome} className="text-[9px] bg-white border border-gray-200 rounded px-1.5 py-0.5 font-mono">
                  {outcome}: {count}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Max concurrency: {simResult.maxConcurrency} · Explored {simResult.totalStatesExplored} states
              {simResult.truncated && ' (truncated)'}
            </p>
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
