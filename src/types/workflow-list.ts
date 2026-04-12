/** Types mirroring the backend list DTOs */

export interface DraftListItem {
  draftId: string
  name: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  createdBy: string | null
  createdAt: string | null
  updatedAt: string | null
  publishedDefinitionId: string | null
}

export interface DefinitionListItem {
  id: string
  name: string
  version: number
  createdAt: string | null
  updatedAt: string | null
}

export interface MonitorSummary {
  active: number
  completed: number
  cancelled: number
  total: number
}
