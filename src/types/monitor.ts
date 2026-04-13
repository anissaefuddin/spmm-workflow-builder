// ── Monitor response types (mirrors WfBuilderMonitorResponse.java) ──

export interface TaskHistoryItem {
  taskId: string
  stepNumber: number
  stepTitle: string
  role: string
  claimBy: string
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'NOT_STARTED'
  createdAt: string | null
  completedAt: string | null
  catatan: string | null
  decision: string | null
}

export interface VariableSnapshot {
  name: string
  value1: string
  value2: string | null
  vtype: string
}

export interface WfBuilderMonitorResponse {
  instanceId: string
  noTiket: string
  status: string
  dibuatOleh: string
  tanggalPengajuan: string
  aktifitasTerakhir: string
  catatanTerakhir: string
  activeStepNumber: number | null
  activeStepType: string | null
  activeStepTitle: string | null
  activeStepRole: string | null
  history: TaskHistoryItem[]
  variables: VariableSnapshot[]
  workflowName: string
  definitionId: string
  totalSteps: number
}
