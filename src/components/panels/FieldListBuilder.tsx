/**
 * FieldListBuilder — visual editor for form_data_input / form_data_view.
 *
 * Replaces JSON textareas with a drag-and-drop sortable chip list.
 * Maps to: Record<string, string>  (variable name → "" or label)
 * Order of keys in the record matches the drag order.
 *
 * XML round-trip:
 *   { "varA": "", "varB": "" }  ←→  <form_data_input>{"varA":"","varB":""}</form_data_input>
 */
import type { WorkflowVariable } from '../../types/workflow'
import { SortableVariableList } from './SortableVariableList'

interface Props {
  label: string
  description: string
  /** Current JSON map — keys are selected variable names (order = key order) */
  value: Record<string, string> | undefined
  /** Variables NOT already used in the sibling field (to prevent duplicates) */
  available: WorkflowVariable[]
  onChange: (next: Record<string, string> | undefined) => void
  accent?: 'blue' | 'gray' | 'amber' | 'teal'
}

export function FieldListBuilder({
  label, description, value, available, onChange, accent = 'blue',
}: Props) {
  const selected = Object.keys(value ?? {})

  const handleAdd = (name: string) => {
    onChange({ ...(value ?? {}), [name]: '' })
  }

  const handleRemove = (name: string) => {
    if (!value) return
    const { [name]: _, ...rest } = value
    onChange(Object.keys(rest).length > 0 ? rest : undefined)
  }

  const handleReorder = (reordered: string[]) => {
    // Rebuild the record in the new order, preserving values
    const newValue: Record<string, string> = {}
    for (const name of reordered) {
      newValue[name] = value?.[name] ?? ''
    }
    onChange(Object.keys(newValue).length > 0 ? newValue : undefined)
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</span>
        <span className="text-xs text-gray-400">{selected.length} field{selected.length !== 1 ? 's' : ''}</span>
      </div>
      <p className="text-xs text-gray-400 mb-2">{description}</p>
      <SortableVariableList
        selected={selected}
        available={available}
        onAdd={handleAdd}
        onRemove={handleRemove}
        onReorder={handleReorder}
        accent={accent}
      />
    </div>
  )
}
