/**
 * ImpactModal — warning dialog shown before destructive edits.
 *
 * Displays which steps are affected and lets the user confirm or cancel.
 */
import type { ImpactReport } from '../../lib/impact-analysis'
import { useWorkflowStore } from '../../store/workflow-store'

interface Props {
  report: ImpactReport
  onConfirm: () => void
  onCancel: () => void
}

const TYPE_ICON: Record<string, string> = {
  form:             '📋',
  decision_user:    '◇',
  decision_sistem:  '⬡',
  system_action:    '⚙',
  end:              '◉',
}

export function ImpactModal({ report, onConfirm, onCancel }: Props) {
  const selectStep = useWorkflowStore((s) => s.selectStep)
  const isCritical = report.severity === 'critical'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className={`px-5 py-4 border-b ${isCritical ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">{isCritical ? '⚠' : '⚡'}</span>
            <h2 className={`font-bold text-sm ${isCritical ? 'text-red-800' : 'text-amber-800'}`}>
              Impact Analysis
            </h2>
          </div>
          <p className={`text-xs mt-1 ${isCritical ? 'text-red-700' : 'text-amber-700'}`}>
            {report.summary}
          </p>
        </div>

        {/* Affected steps */}
        {report.affectedSteps.length > 0 && (
          <div className="px-5 py-3 max-h-60 overflow-y-auto">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Affected Steps</p>
            <div className="space-y-1.5">
              {report.affectedSteps.map((a) => (
                <button
                  key={a.stepId}
                  onClick={() => selectStep(a.stepId)}
                  className="w-full flex items-start gap-2 p-2 rounded border border-gray-100 hover:bg-gray-50 text-left transition-colors"
                >
                  <span className="text-xs shrink-0 mt-0.5">{TYPE_ICON[a.stepType] ?? '•'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-gray-500">#{a.stepNumber}</span>
                      <span className="text-xs font-medium text-gray-800 truncate">
                        {a.stepTitle || a.stepType}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{a.reason}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-1.5 text-sm rounded font-medium text-white
              ${isCritical ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
          >
            {isCritical ? 'Delete Anyway' : 'Proceed'}
          </button>
        </div>
      </div>
    </div>
  )
}
