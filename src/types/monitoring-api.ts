/** Types for the monitoring / ticket-list API */

export interface TicketListItem {
  processId: string
  noTiket: string
  workflowName: string
  definitionId: string
  statusPengajuan: string
  dibuatOleh: string
  tanggalPengajuan: string | null
  aktifitasTerakhir: string | null
  activeStep: number | null
  status: number   // 0=active, 1=completed, 2=cancelled
}

export const STATUS_LABELS: Record<number, string> = {
  0: 'Active',
  1: 'Completed',
  2: 'Cancelled',
}

export const STATUS_COLORS: Record<number, string> = {
  0: 'bg-amber-100 text-amber-700',
  1: 'bg-green-100 text-green-700',
  2: 'bg-red-100 text-red-700',
}
