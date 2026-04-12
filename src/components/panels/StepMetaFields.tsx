/**
 * StepMetaFields — shared metadata fields present on every step type.
 *
 * Covers: title, role, status, grup, statustiket,
 *         logstart, logtrue, logfalse, logsave
 *
 * Renders in two collapsible sections so they don't crowd the top
 * of every panel:
 *   ▸ Step Info  (title · role · status · grup · statustiket)
 *   ▸ Log Labels (logstart · logtrue · logfalse · logsave)
 */
import { useState } from 'react'
import type { WorkflowStep } from '../../types/workflow'
import { useWorkflowStore } from '../../store/workflow-store'

interface Props {
  step: WorkflowStep
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}

function Section({
  title,
  accent,
  children,
  defaultOpen = false,
}: {
  title: string
  accent: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wide text-left ${accent}`}
      >
        <span>{title}</span>
        <span className="text-gray-400 font-normal">{open ? '▴' : '▾'}</span>
      </button>
      {open && <div className="px-3 pb-3 pt-2 space-y-2.5 bg-white">{children}</div>}
    </div>
  )
}

export function StepMetaFields({ step }: Props) {
  const updateStep = useWorkflowStore((s) => s.updateStep)
  const roles      = useWorkflowStore((s) => s.dsl?.process.roles ?? [])

  const set = <K extends keyof WorkflowStep>(key: K, value: WorkflowStep[K]) => {
    updateStep(step.id, { [key]: value || undefined } as Partial<WorkflowStep>)
  }

  return (
    <>
      {/* ── Step Info ─────────────────────────────────────────── */}
      <Section title="Step Info" accent="bg-gray-50 text-gray-700 hover:bg-gray-100" defaultOpen>
        <Field
          label="Title"
          value={step.title ?? ''}
          onChange={(v) => set('title', v as WorkflowStep['title'])}
          placeholder="Display label for this step"
        />

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
            Role
          </label>
          {roles.length > 0 ? (
            <select
              value={step.role ?? ''}
              onChange={(e) => set('role', (e.target.value || undefined) as WorkflowStep['role'])}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">— none / starter —</option>
              {roles.map((r) => (
                <option key={r.name} value={r.name}>{r.name}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={step.role ?? ''}
              onChange={(e) => set('role', (e.target.value || undefined) as WorkflowStep['role'])}
              placeholder="Role name"
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            />
          )}
        </div>

        <Field
          label="Status"
          value={step.status ?? ''}
          onChange={(v) => set('status', v as WorkflowStep['status'])}
          placeholder="e.g. Menunggu"
        />
        <Field
          label="Grup"
          value={step.grup ?? ''}
          onChange={(v) => set('grup', v as WorkflowStep['grup'])}
          placeholder="Group ID"
          mono
        />
        <Field
          label="Status Tiket"
          value={step.statustiket ?? ''}
          onChange={(v) => set('statustiket', v as WorkflowStep['statustiket'])}
          placeholder="Ticket status label"
        />
      </Section>

      {/* ── Notifications ───────────────────────────────────────── */}
      <Section title="Notifications" accent="bg-gray-50 text-gray-700 hover:bg-gray-100" defaultOpen={
        !!(step.logstart || step.logtrue || step.logfalse || step.logsave)
      }>
        <Field
          label="On Start"
          value={step.logstart ?? ''}
          onChange={(v) => set('logstart', v as WorkflowStep['logstart'])}
          placeholder="Message when step starts"
        />
        <Field
          label="On Approve"
          value={step.logtrue ?? ''}
          onChange={(v) => set('logtrue', v as WorkflowStep['logtrue'])}
          placeholder="Message when approved"
        />
        <Field
          label="On Reject"
          value={step.logfalse ?? ''}
          onChange={(v) => set('logfalse', v as WorkflowStep['logfalse'])}
          placeholder="Message when rejected"
        />
        <Field
          label="On Save"
          value={step.logsave ?? ''}
          onChange={(v) => set('logsave', v as WorkflowStep['logsave'])}
          placeholder="Message when saved as draft"
        />
      </Section>
    </>
  )
}
