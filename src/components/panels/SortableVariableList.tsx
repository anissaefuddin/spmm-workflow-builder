/**
 * SortableVariableList — drag-and-drop reorderable variable chip list.
 *
 * Uses @dnd-kit for smooth drag interactions.
 * Each item shows: drag handle · order index · name · type badge · remove button.
 */
import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { WorkflowVariable } from '../../types/workflow'

// ── Accent theme ──────────────────────────────────────────────

const ACCENT_CLS = {
  blue:  { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', handle: 'text-blue-300', remove: 'text-blue-300 hover:text-blue-600' },
  amber: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', handle: 'text-amber-300', remove: 'text-amber-300 hover:text-amber-600' },
  gray:  { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-700', handle: 'text-gray-300', remove: 'text-gray-300 hover:text-gray-600' },
  teal:  { bg: 'bg-teal-50 border-teal-200', text: 'text-teal-800', handle: 'text-teal-300', remove: 'text-teal-300 hover:text-teal-600' },
}

const TYPE_CLS: Record<string, string> = {
  String: 'bg-gray-100 text-gray-600', Number: 'bg-blue-100 text-blue-700',
  float: 'bg-blue-100 text-blue-700', Date: 'bg-green-100 text-green-700',
  Option: 'bg-amber-100 text-amber-700', file: 'bg-purple-100 text-purple-700',
}

interface Props {
  /** Ordered list of selected variable names */
  selected: string[]
  /** Pool of all available variables (for type badge lookup + add dropdown) */
  available: WorkflowVariable[]
  onAdd: (name: string) => void
  onRemove: (name: string) => void
  onReorder: (reordered: string[]) => void
  accent?: keyof typeof ACCENT_CLS
  placeholder?: string
}

// ── Sortable Item ────────────────────────────────────────────

function SortableItem({
  name, index, vtype, accent, onRemove,
}: {
  name: string; index: number; vtype?: string
  accent: keyof typeof ACCENT_CLS; onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: name })
  const a = ACCENT_CLS[accent]

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1.5 border rounded px-2 py-1 text-xs font-medium
        ${a.bg} ${a.text}
        ${isDragging ? 'opacity-50 shadow-lg z-10' : ''}`}
    >
      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        className={`cursor-grab active:cursor-grabbing shrink-0 ${a.handle}`}
        title="Drag to reorder"
      >
        ≡
      </span>
      {/* Order index */}
      <span className="text-[9px] text-gray-400 font-mono w-4 text-center shrink-0">{index + 1}</span>
      {/* Name */}
      <span className="truncate flex-1" title={name}>{name}</span>
      {/* Type badge */}
      {vtype && (
        <span className={`text-[9px] px-1 py-0.5 rounded-full font-bold shrink-0 ${TYPE_CLS[vtype] ?? 'bg-gray-100 text-gray-500'}`}>
          {vtype}
        </span>
      )}
      {/* Remove */}
      <button onClick={onRemove} className={`font-bold text-sm leading-none shrink-0 ${a.remove}`} title={`Remove ${name}`}>
        ×
      </button>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────

export function SortableVariableList({
  selected, available, onAdd, onRemove, onReorder,
  accent = 'blue', placeholder = 'Search variables…',
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const unselected = available.filter(
    (v) => !selected.includes(v.name) && v.name.toLowerCase().includes(query.toLowerCase()),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = selected.indexOf(active.id as string)
    const newIndex = selected.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(selected, oldIndex, newIndex))
  }

  const handleAdd = (name: string) => {
    onAdd(name)
    setQuery('')
  }

  const a = ACCENT_CLS[accent]

  return (
    <div className="space-y-1.5">
      {/* Sortable chip list */}
      {selected.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={selected} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {selected.map((name, i) => (
                <SortableItem
                  key={name}
                  name={name}
                  index={i}
                  vtype={available.find((v) => v.name === name)?.vtype}
                  accent={accent}
                  onRemove={() => onRemove(name)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Search + add dropdown */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className={`w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-${accent === 'blue' ? 'blue' : accent === 'amber' ? 'amber' : accent === 'teal' ? 'teal' : 'gray'}-400`}
        />
        {open && (
          <div className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
            {unselected.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">
                {available.length === 0 ? 'No variables available' : 'No matching variables'}
              </p>
            ) : (
              unselected.map((v) => (
                <button
                  key={v.name}
                  onMouseDown={() => handleAdd(v.name)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50"
                >
                  <span className="text-sm text-gray-800 flex-1 truncate">{v.name}</span>
                  <span className={`text-[9px] px-1 py-0.5 rounded font-bold shrink-0 ${TYPE_CLS[v.vtype] ?? 'bg-gray-100 text-gray-500'}`}>
                    {v.vtype}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
