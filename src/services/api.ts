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
