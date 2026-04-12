/**
 * DecisionKeyEditor — visual editor for a FormStep's decision_key.
 *
 * The decision_key on form steps holds the action button labels:
 *   { "true": "Lanjutkan", "false": "Tolak", "save": "Simpan" }
 *
 * Renders each as a labeled text input with a colored preview badge.
 * Generates the JSON object automatically — no textarea needed.
 *
 * XML round-trip:
 *   UI inputs  ←→  DecisionKeyMap  ←→  <decision_key>{"true":"...","false":"..."}</decision_key>
 */
import type { DecisionKeyMap } from '../../types/workflow'

interface Props {
  value: DecisionKeyMap | null | undefined
  onChange: (next: DecisionKeyMap) => void
}

const BUTTONS: {
  key: 'true' | 'false' | 'save'
  label: string
  icon: string
  color: string
  placeholder: string
}[] = [
  { key: 'true',  label: 'Approve',  icon: '✓', color: 'bg-green-50 border-green-200 text-green-700', placeholder: 'e.g. Lanjutkan' },
  { key: 'false', label: 'Reject',   icon: '✗', color: 'bg-red-50 border-red-200 text-red-700',       placeholder: 'e.g. Tolak / Revisi' },
  { key: 'save',  label: 'Save Draft', icon: '↓', color: 'bg-gray-50 border-gray-200 text-gray-600',  placeholder: 'e.g. Simpan Draft' },
]

export function DecisionKeyEditor({ value, onChange }: Props) {
  const current = value ?? {}

  const set = (key: 'true' | 'false' | 'save', text: string) => {
    const next: DecisionKeyMap = { ...current }
    if (text.trim()) {
      next[key] = text
    } else {
      delete next[key]
    }
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {BUTTONS.map(({ key, label, icon, color, placeholder }) => (
        <div key={key} className="flex items-center gap-2">
          {/* Preview badge */}
          <span className={`shrink-0 inline-flex items-center gap-1 border rounded px-2 py-1 text-xs font-semibold w-24 ${color}`}>
            <span>{icon}</span>
            <span className="truncate">{(current[key] as string) || label}</span>
          </span>
          {/* Label input */}
          <input
            type="text"
            value={(current[key] as string) ?? ''}
            onChange={(e) => set(key, e.target.value)}
            placeholder={placeholder}
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      ))}
      <p className="text-xs text-gray-400">
        Leave blank to hide that button. Saved as &lt;decision_key&gt; in XML.
      </p>
    </div>
  )
}
