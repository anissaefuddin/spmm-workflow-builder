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
}): Promise<ApiResult<{ draftId: string; status: string; publishedDefinitionId?: string }>> {
  return apiPost('/save', {
    draftId:   params.draftId,
    name:      params.name,
    jsonDsl:   JSON.stringify(params.dsl),
    publish:   params.publish ?? false,
    createdBy: params.createdBy ?? '',
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
  definitionId?: string
  search?: string
}): Promise<ApiResult<{ content: TicketListItem[]; totalElements: number; page: number; size: number }>> {
  const q = new URLSearchParams()
  if (params?.page !== undefined)  q.set('page', String(params.page))
  if (params?.size !== undefined)  q.set('size', String(params.size))
  if (params?.status)              q.set('status', params.status)
  if (params?.definitionId)        q.set('definitionId', params.definitionId)
  if (params?.search)              q.set('search', params.search)
  const qs = q.toString()
  return apiGet(`/tickets${qs ? `?${qs}` : ''}`)
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
