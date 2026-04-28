/**
 * api.ts — Typed wrappers for all /api/workflow-builder/* endpoints
 * ============================================================
 * Uses apiClient for dynamic base URL (set in Settings panel).
 * All functions return typed result objects — never throw.
 */
import { apiGet, apiPost } from './apiClient'
import type { ApiResult } from './apiClient'
import type { WorkflowDSL } from '../types/workflow'
import type { WfBuilderMonitorResponse } from '../types/monitor'
import type { TicketListItem } from '../types/monitoring-api'
import type { DraftListItem, DefinitionListItem, MonitorSummary } from '../types/workflow-list'

export type { ApiResult }

// ── Builder endpoints ──────────────────────────────────────

/** POST /validate-xml — validates XML without saving */
export async function validateXml(xml: string, definitionId?: string): Promise<ApiResult<{
  valid: boolean; errors: string[]; warnings: string[]
  stepCount?: number; variableCount?: number
}>> {
  return apiPost('/validate-xml', { xml, definitionId })
}

/** POST /parse-xml — XML string → JSON DSL */
export async function parseXml(
  xml: string,
  processName?: string,
): Promise<ApiResult<{ data: WorkflowDSL; warnings: string[] }>> {
  return apiPost('/parse-xml', { xml, processName })
}

/** POST /generate-xml — JSON DSL → XML string */
export async function generateXml(
  dsl: WorkflowDSL,
): Promise<ApiResult<{ xml: string }>> {
  return apiPost('/generate-xml', { jsonDsl: JSON.stringify(dsl) })
}

/** POST /save — save or update a draft */
export async function saveDraft(params: {
  draftId?: string
  name: string
  dsl: WorkflowDSL
  publish?: boolean
  createdBy?: string
  /** Optional pre-generated XML (frontend output). Backend stores it verbatim. */
  xmlDefinition?: string
}): Promise<ApiResult<{ draftId: string; status: string; publishedDefinitionId?: string }>> {
  return apiPost('/save', {
    draftId:       params.draftId,
    name:          params.name,
    jsonDsl:       JSON.stringify(params.dsl),
    xmlDefinition: params.xmlDefinition,
    publish:       params.publish ?? false,
    createdBy:     params.createdBy ?? '',
  })
}

/** GET /:id — load a saved draft */
export async function getDraft(draftId: string): Promise<ApiResult<{
  draftId: string
  name: string
  status: string
  jsonDsl: string
  xmlDefinition: string
}>> {
  return apiGet(`/${draftId}`)
}

/** GET /:id/preview — XML preview for a draft */
export async function previewXml(draftId: string): Promise<ApiResult<{ xml: string; name: string }>> {
  return apiGet(`/${draftId}/preview`)
}

// ── Monitoring endpoints ────────────────────────────────────

/** GET /monitor/:instanceId — snapshot of a running instance */
export async function monitorInstance(instanceId: string): Promise<ApiResult<WfBuilderMonitorResponse>> {
  return apiGet(`/monitor/${instanceId}`)
}

/** GET /tickets — paginated list of process instances */
export async function listTickets(params?: {
  page?: number
  size?: number
  status?: string
  statusPengajuan?: string
  definitionId?: string
  search?: string
}): Promise<ApiResult<{ content: TicketListItem[]; totalElements: number; page: number; size: number }>> {
  const q = new URLSearchParams()
  if (params?.page !== undefined)  q.set('page', String(params.page))
  if (params?.size !== undefined)  q.set('size', String(params.size))
  if (params?.status)              q.set('status', params.status)
  if (params?.statusPengajuan)     q.set('statusPengajuan', params.statusPengajuan)
  if (params?.definitionId)        q.set('definitionId', params.definitionId)
  if (params?.search)              q.set('search', params.search)
  const qs = q.toString()
  return apiGet(`/tickets${qs ? `?${qs}` : ''}`)
}

/** GET /status-pengajuan-values — distinct display-status labels in use */
export async function listStatusPengajuanValues(
  definitionId?: string,
): Promise<ApiResult<string[]>> {
  const qs = definitionId ? `?definitionId=${encodeURIComponent(definitionId)}` : ''
  return apiGet(`/status-pengajuan-values${qs}`)
}

/** POST /ticket/update-status — update ticket status label */
export async function updateTicketStatus(params: {
  processId: string
  status: string
  catatan?: string
}): Promise<ApiResult<{ processId: string; status: string }>> {
  return apiPost('/ticket/update-status', params)
}

// ── Workflow list endpoints ─────────────────────────────────

/** GET /list — all builder drafts (metadata only, no DSL payload) */
export async function listDrafts(): Promise<ApiResult<DraftListItem[]>> {
  return apiGet('/list')
}

/** GET /definitions — all live process definitions (read-only) */
export async function listDefinitions(): Promise<ApiResult<DefinitionListItem[]>> {
  return apiGet('/definitions')
}

/** GET /definitions/:id — XML for one process definition, ready for import */
export async function getDefinitionXml(id: string): Promise<ApiResult<{
  id: string; name: string; version: number; xml: string
}>> {
  return apiGet(`/definitions/${id}`)
}

/** GET /monitor/summary — aggregate counts by status */
export async function getMonitorSummary(): Promise<ApiResult<MonitorSummary>> {
  return apiGet('/monitor/summary')
}

// ── Variable schema endpoint ────────────────────────────────

export interface VariableSchemaField {
  name: string
  type: string
  required: boolean
  description?: string
}

/**
 * GET /variable-schema/{vtype}
 * Optional endpoint — returns the internal field schema for a custom variable type.
 * Falls back gracefully when the endpoint doesn't exist.
 */
export async function getVariableSchema(vtype: string): Promise<ApiResult<{
  vtype: string
  fields: VariableSchemaField[]
}>> {
  return apiGet(`/variable-schema/${encodeURIComponent(vtype)}`)
}

// ── Role config endpoints ──────────────────────────────────

import type { RoleConfigEntry, ButtonMapEntry } from '../types/workflow'

/** GET /roles/{definitionId} — role matrix for a published definition */
export async function getRoleConfig(definitionId: string): Promise<ApiResult<RoleConfigEntry[]>> {
  return apiGet(`/roles/${definitionId}`)
}

/** POST /roles/{definitionId} — save role matrix (on publish) */
export async function saveRoleConfig(
  definitionId: string,
  entries: RoleConfigEntry[],
): Promise<ApiResult<{ ok: boolean; saved: number }>> {
  return apiPost(`/roles/${definitionId}`, entries)
}

// ── Button map endpoints ───────────────────────────────────

/** GET /buttons/{definitionId} — button config for a published definition */
export async function getButtonMap(definitionId: string): Promise<ApiResult<ButtonMapEntry[]>> {
  return apiGet(`/buttons/${definitionId}`)
}

/** POST /buttons/{definitionId} — save button config (on publish) */
export async function saveButtonMap(
  definitionId: string,
  entries: ButtonMapEntry[],
): Promise<ApiResult<{ ok: boolean; saved: number }>> {
  return apiPost(`/buttons/${definitionId}`, entries)
}

// ── Runtime materializer endpoints ─────────────────────────

/** POST /start/{definitionId} — create a process instance from a published definition */
export async function startProcessInstance(
  definitionId: string,
  createdBy?: string,
): Promise<ApiResult<{ processId: string; noTiket: string; firstTaskId: string }>> {
  return apiPost(`/start/${definitionId}`, { createdBy: createdBy ?? 'builder' })
}

/** POST /propagate-variables — push submitted form data into wf_process_variable */
export async function propagateVariables(
  noTiket: string,
  values: Record<string, string>,
): Promise<ApiResult<{ ok: boolean; updated: number }>> {
  return apiPost('/propagate-variables', { noTiket, values })
}

/** GET /introspect/{definitionId} — read-only extraction of steps/variables from XML */
export async function introspectDefinition(definitionId: string): Promise<ApiResult<{
  name: string; roleStart: string; totalSteps: number; totalVariables: number
  steps: Array<{ number: string; type: string; role: string; title: string }>
  variables: Array<{ name: string; vtype: string; value1: string }>
}>> {
  return apiGet(`/introspect/${definitionId}`)
}

// ── Runtime engine endpoints ───────────────────────────────

/** POST /transition — advance a step (complete current → activate next) */
export async function transitionStep(params: {
  noTiket: string
  taskId: string
  action: 'true' | 'false' | 'save' | 'rollback'
  username?: string
  notes?: string
}): Promise<ApiResult<{ action: string; completedTaskId?: string; nextTaskId?: string; nextStep?: string }>> {
  return apiPost('/transition', params)
}

/** GET /runtime/{noTiket} — full workflow context aggregated from all DB tables */
export async function getFullRuntimeContext(noTiket: string): Promise<ApiResult<{
  process: Record<string, unknown>
  steps: Array<{
    taskId: string; step: string; type: string; title: string
    role: string; claimBy: string; status: string; isActive: boolean
    statusTampil: string; createdAt: string | null; completedAt: string | null
    nextStepYes: string | null; nextStepNo: string | null; nextStepRollback: string | null
    logUsername?: string; logDecision?: string; logNotes?: string; logOccurredAt?: string
    decisionResult?: string
  }>
  variables: Array<{
    name: string; type: string; value: string; value2: string | null
    isReadonly: boolean; updatedAt: string | null
  }>
  groups: Array<{ grup: string; urutan: number; status: boolean }>
  logs: Array<{
    taskId: string; username: string; decision: string; notes: string
    title: string; occurredAt: string | null
  }>
  activeTaskId: string | null
  totalSteps: number
}>> {
  return apiGet(`/runtime/${encodeURIComponent(noTiket)}`)
}

// ── Force transition + File resolver endpoints ─────────────

// ── SPME timeline (logs + groups + per-task viewer access) ─

export interface SpmeTimelineLog {
  taskId: string
  username: string | null
  decision: string | null
  notes: string | null
  title: string | null
  occurredAt: string | null
}

export interface SpmeTimelineGroup {
  grup: string
  urutan: number
  status: boolean | null
  lastUpdate: string | null
}

export interface SpmeTimelineTask {
  taskId: string
  step: string
  title: string | null
  type: string | null
  role: string | null
  status: number
  statusTampil: string | null
  claimBy: string | null
  createdAt: string | null
  completedAt: string | null
  rawViewer: string | null
  allowedRoles: string[]
  unrestricted: boolean
  allowed: boolean | null
  reason: string
}

/**
 * POST /spme-timeline
 * Combined data source: task logs, phase groups, and per-task viewer access.
 * Strict case-insensitive exact-token match against wf_task.view_acces_role
 * (does NOT use the legacy substring contains() check).
 */
export async function getSpmeTimeline(params: {
  noTiket: string
  /** Optional. When supplied, every task gets `allowed`/`reason` populated. */
  role?: string
}): Promise<ApiResult<{
  ok: boolean
  noTiket: string
  role: string | null
  lastUpdate: number | null
  logs: SpmeTimelineLog[]
  groups: SpmeTimelineGroup[]
  tasks: SpmeTimelineTask[]
}>> {
  return apiPost('/spme-timeline', {
    noTiket: params.noTiket,
    role:    params.role ?? '',
  })
}

/** POST /release-claim — null out claim_by so the ticket re-opens for any allowed user */
export async function releaseTaskClaim(params: {
  noTiket: string
  taskId: string
  username?: string
  notes?: string
}): Promise<ApiResult<{
  ok: boolean
  noTiket: string
  taskId: string
  previousClaim: string
  status: number
}>> {
  return apiPost('/release-claim', params)
}

/** POST /force-transition — admin override: jump to any step */
export async function forceTransitionStep(params: {
  noTiket: string
  targetTaskId: string
  username?: string
  notes?: string
}): Promise<ApiResult<{ activatedTaskId: string; activatedStep: string; deactivatedTasks: string[] }>> {
  return apiPost('/force-transition', params)
}

/** GET /files/{noTiket} — resolve file URLs for all file-type variables */
export async function resolveProcessFiles(noTiket: string): Promise<ApiResult<Array<{
  variableName: string; variableType: string
  fileName: string; url: string; previewable: boolean
}>>> {
  return apiGet(`/files/${encodeURIComponent(noTiket)}`)
}

/** POST /resolve-file — resolve a single file path to a presigned URL */
export async function resolveFileUrl(path: string): Promise<ApiResult<{
  fileName: string; url: string; previewable: boolean
}>> {
  return apiPost('/resolve-file', { path })
}

// ── Dynamic form (custom variable types) ──────────────────

/**
 * A single rendered cell — mirrors backend `FormKomponen`.
 * `data` is either a scalar OR a `List<Record<string, FormKomponen>>` when tipe="list"
 * (nested level-2 rows; level-3 rows live under a `level3` key inside each level-2 row).
 */
export interface FormKomponen {
  data: unknown
  tipe: string
  filename: string | null
  readonly: boolean
}

export type FormRow = Record<string, FormKomponen>

/** POST /dynamic-form/get — fetch hierarchical form data for a custom vtype. */
export async function getDynamicForm(params: {
  classObject: string
  noTiket: string
  returnEmptyForm?: boolean
}): Promise<ApiResult<FormRow[]>> {
  return apiPost('/dynamic-form/get', {
    classObject: params.classObject,
    noTiket: params.noTiket,
    returnEmptyForm: params.returnEmptyForm ?? true,
  })
}

/** POST /dynamic-form/save — persist edited rows. Does not advance workflow. */
export async function saveDynamicForm(params: {
  classObject: string
  noTiket: string
  payload: FormRow[]
}): Promise<ApiResult<{ ok: boolean; saved: FormRow[] }>> {
  return apiPost('/dynamic-form/save', {
    classObject: params.classObject,
    noTiket: params.noTiket,
    payload: params.payload,
  })
}

// ── Task regeneration (latest XML → existing ticket) ───────

/**
 * POST /apply-task-fixes
 * Granular fix-up: patches existing wf_task rows in place, optionally inserts
 * missing steps, optionally removes orphaned ones, and optionally backfills
 * variables introduced by the latest XML. Does NOT call EvalTask / advance
 * the workflow.
 */
export async function applyTaskFixes(params: {
  noTiket: string
  patchFields?: boolean
  addMissingSteps?: boolean
  removeOrphanedTasks?: boolean
  addMissingVariables?: boolean
}): Promise<ApiResult<{
  ok: boolean
  noTiket: string
  workflowName: string
  oldVersion: number
  newVersion: number
  definitionRepointed: boolean
  patchedTasks: number
  patchedFields: number
  addedSteps: number
  removedSteps: number
  addedVariables: number
  patches: Array<{ step: string; taskId: string; fields: string[] }>
}>> {
  return apiPost('/apply-task-fixes', {
    noTiket:             params.noTiket,
    patchFields:         params.patchFields         ?? true,
    addMissingSteps:     params.addMissingSteps     ?? true,
    removeOrphanedTasks: params.removeOrphanedTasks ?? false,
    addMissingVariables: params.addMissingVariables ?? true,
  })
}

/** GET /tasks-diff/{noTiket} — field-by-field diff between wf_task and latest XML. */
export interface FieldDiff {
  field: string
  xml: string
  db: string
}

export interface StepDiff {
  step: string
  taskId: string
  title: string
  fields: FieldDiff[]
}

export async function getTasksDiff(noTiket: string): Promise<ApiResult<{
  ok: boolean
  noTiket: string
  workflowName: string
  currentVersion: number
  latestVersion: number
  comparedAgainst: string
  totalStepsInXml: number
  totalTasksInDb: number
  inSync: boolean
  missingInTasks: string[]
  missingInXml: string[]
  differingSteps: number
  totalFieldDiffs: number
  differences: StepDiff[]
}>> {
  return apiGet(`/tasks-diff/${encodeURIComponent(noTiket)}`)
}

/** GET /version-check/{noTiket} — compare ticket's definition vs latest. */
export async function checkTicketVersion(noTiket: string): Promise<ApiResult<{
  ok: boolean
  noTiket: string
  workflowName: string
  currentDefinitionId: string
  currentVersion: number
  currentUpdatedAt: string | null
  latestDefinitionId: string
  latestVersion: number
  latestUpdatedAt: string | null
  outdated: boolean
}>> {
  return apiGet(`/version-check/${encodeURIComponent(noTiket)}`)
}

/**
 * POST /regenerate-tasks
 * Rebuilds wf_task rows for an existing ticket from the latest published
 * version of its workflow definition. Runtime state (status, claim_by,
 * completed_at, catatan) is preserved per step number. New variables in
 * the latest XML are backfilled when addMissingVariables=true (default).
 */
export async function regenerateTasks(params: {
  noTiket: string
  addMissingVariables?: boolean
}): Promise<ApiResult<{
  ok: boolean
  noTiket: string
  oldDefinitionId: string
  oldVersion: number
  newDefinitionId: string
  newVersion: number
  alreadyLatest: boolean
  regeneratedTasks: number
  regeneratedDecisions: number
  preservedActiveStep: string | null
  addedSteps: string[]
  removedSteps: string[]
  newVariablesAdded: number
  warnings: string[]
}>> {
  return apiPost('/regenerate-tasks', {
    noTiket: params.noTiket,
    addMissingVariables: params.addMissingVariables ?? true,
  })
}
