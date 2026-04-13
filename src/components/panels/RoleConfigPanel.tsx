/**
 * RoleConfigPanel — editor for wf_role_matrix entries.
 *
 * Shows role behavior flags per role defined in the workflow.
 * Data is stored in DSL as process.roleConfig[] and synced
 * to wf_role_matrix on publish.
 */
import { useWorkflowStore } from '../../store/workflow-store'
import type { RoleConfigEntry } from '../../types/workflow'

function emptyEntry(roleCode: string): RoleConfigEntry {
  return { roleCode, hideDraft: false, requireClaimBy: false, lembagaRequired: false }
}

export function RoleConfigPanel() {
  const dsl       = useWorkflowStore((s) => s.dsl)
  const updateDSL = useWorkflowStore((s) => s.loadDSL)

  if (!dsl) return null

  const roles      = dsl.process.roles
  const roleConfig = dsl.process.roleConfig ?? []

  // Build a map of existing config entries keyed by roleCode
  const configMap = new Map<string, RoleConfigEntry>()
  for (const entry of roleConfig) configMap.set(entry.roleCode, entry)

  // Ensure every declared role has a config entry
  const entries = roles.map((r) => configMap.get(r.name) ?? emptyEntry(r.name))

  const updateEntry = (roleCode: string, patch: Partial<RoleConfigEntry>) => {
    const updated = entries.map((e) =>
      e.roleCode === roleCode ? { ...e, ...patch } : e,
    )
    updateDSL({
      ...dsl,
      process: { ...dsl.process, roleConfig: updated },
    })
  }

  if (roles.length === 0) {
    return (
      <div className="text-xs text-gray-400 italic">
        No roles defined — add roles in the Process panel first.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div
          key={entry.roleCode}
          className="border border-gray-200 rounded-lg overflow-hidden"
        >
          <div className="px-3 py-1.5 bg-gray-50 flex items-center gap-2">
            <span className="text-xs font-bold text-gray-700">{entry.roleCode}</span>
            {entry.title && (
              <span className="text-[10px] text-gray-400 truncate">({entry.title})</span>
            )}
          </div>
          <div className="px-3 pb-2 pt-1.5 bg-white space-y-1.5">
            <CheckboxRow
              label="Hide draft tickets"
              hint="This role won't see draft-status tickets"
              checked={entry.hideDraft}
              onChange={(v) => updateEntry(entry.roleCode, { hideDraft: v })}
            />
            <CheckboxRow
              label="Require claim before action"
              hint="User must claim task before they can act on it"
              checked={entry.requireClaimBy}
              onChange={(v) => updateEntry(entry.roleCode, { requireClaimBy: v })}
            />
            <CheckboxRow
              label="Filter by institution"
              hint="Tasks filtered by user's institution/lembaga"
              checked={entry.lembagaRequired}
              onChange={(v) => updateEntry(entry.roleCode, { lembagaRequired: v })}
            />
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Display Title</label>
              <input
                type="text"
                value={entry.title ?? ''}
                onChange={(e) => updateEntry(entry.roleCode, {
                  title: e.target.value || undefined,
                })}
                placeholder="Optional display title"
                className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function CheckboxRow({
  label, hint, checked, onChange,
}: {
  label: string; hint: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded mt-0.5"
      />
      <div>
        <span className="text-xs text-gray-700">{label}</span>
        <p className="text-[10px] text-gray-400">{hint}</p>
      </div>
    </label>
  )
}
