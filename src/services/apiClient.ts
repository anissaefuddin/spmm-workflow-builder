/**
 * apiClient.ts — Dynamic HTTP client
 * ============================================================
 * Reads base URL from settings store at call time.
 * All functions return typed result objects — never throw.
 */
import { getBackendBase } from '../store/settings-store'

export interface ApiOk<T>  { ok: true;  data: T;      warnings?: string[] }
export interface ApiErr    { ok: false; error: string; warnings?: string[] }
export type ApiResult<T>   = ApiOk<T> | ApiErr

const PREFIX = '/api/workflow-builder'

function buildUrl(path: string): string {
  const base = getBackendBase()
  return `${base}${PREFIX}${path}`
}

export async function apiPost<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(buildUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (json.ok === false) return { ok: false, error: json.error ?? 'Unknown error', warnings: json.warnings }
    return { ok: true, data: json as T, warnings: json.warnings }
  } catch (e) {
    return { ok: false, error: networkError(e) }
  }
}

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(buildUrl(path))
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` }
    const json = await res.json()
    if (json.ok === false) return { ok: false, error: json.error ?? 'Unknown error' }
    return { ok: true, data: json as T }
  } catch (e) {
    return { ok: false, error: networkError(e) }
  }
}

/** Ping to verify the backend is reachable — uses the /ping endpoint on the workflow builder controller */
export async function pingBackend(): Promise<{ reachable: boolean; error?: string }> {
  const base = getBackendBase()
  if (!base) return { reachable: false, error: 'No URL configured' }

  try {
    const res = await fetch(`${base}${PREFIX}/ping`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) return { reachable: true }
    return { reachable: false, error: `Server returned HTTP ${res.status}` }
  } catch (e) {
    const msg = String(e)
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
      return {
        reachable: false,
        error: `Cannot connect to ${base} — server may be down or CORS not configured`,
      }
    }
    if (msg.includes('AbortError') || msg.includes('timeout')) {
      return { reachable: false, error: 'Connection timed out after 5 s' }
    }
    return { reachable: false, error: msg }
  }
}

function networkError(e: unknown): string {
  const msg = String(e)
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    const base = getBackendBase()
    return base
      ? `Cannot reach backend at ${base} — check Backend URL in Settings`
      : 'No Backend URL configured — open Settings to set it'
  }
  return msg
}
