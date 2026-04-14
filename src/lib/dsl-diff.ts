/**
 * dsl-diff.ts — Compares two WorkflowDSL objects and returns changes.
 * Pure function — no side effects, no API calls.
 */
import type { WorkflowDSL } from '../types/workflow'

export interface DiffEntry {
  category: 'step' | 'variable' | 'role' | 'transition' | 'config'
  action: 'added' | 'removed' | 'changed'
  label: string
  detail?: string
}

export function compareDSL(oldDsl: WorkflowDSL, newDsl: WorkflowDSL): DiffEntry[] {
  const diffs: DiffEntry[] = []

  // ── Steps ──
  const oldSteps = new Map(oldDsl.process.steps.map((s) => [s.number, s]))
  const newSteps = new Map(newDsl.process.steps.map((s) => [s.number, s]))

  for (const [num, step] of newSteps) {
    if (!oldSteps.has(num)) {
      diffs.push({ category: 'step', action: 'added', label: `Step #${num}`, detail: `type: ${step.type}${step.title ? `, title: ${step.title}` : ''}` })
    }
  }
  for (const [num, step] of oldSteps) {
    if (!newSteps.has(num)) {
      diffs.push({ category: 'step', action: 'removed', label: `Step #${num}`, detail: `type: ${step.type}` })
    }
  }
  for (const [num, newStep] of newSteps) {
    const oldStep = oldSteps.get(num)
    if (!oldStep) continue
    if (oldStep.type !== newStep.type) {
      diffs.push({ category: 'step', action: 'changed', label: `Step #${num} type`, detail: `${oldStep.type} → ${newStep.type}` })
    }
    if (oldStep.role !== newStep.role) {
      diffs.push({ category: 'step', action: 'changed', label: `Step #${num} role`, detail: `${oldStep.role ?? '(none)'} → ${newStep.role ?? '(none)'}` })
    }
    if (oldStep.title !== newStep.title) {
      diffs.push({ category: 'step', action: 'changed', label: `Step #${num} title`, detail: `"${oldStep.title ?? ''}" → "${newStep.title ?? ''}"` })
    }
    // Transitions
    const ot = oldStep.transitions, nt = newStep.transitions
    if (ot.true !== nt.true) diffs.push({ category: 'transition', action: 'changed', label: `Step #${num} → true`, detail: `${ot.true ?? '∅'} → ${nt.true ?? '∅'}` })
    if (ot.false !== nt.false) diffs.push({ category: 'transition', action: 'changed', label: `Step #${num} → false`, detail: `${ot.false ?? '∅'} → ${nt.false ?? '∅'}` })
    if (ot.rollback !== nt.rollback) diffs.push({ category: 'transition', action: 'changed', label: `Step #${num} → rollback`, detail: `${ot.rollback ?? '∅'} → ${nt.rollback ?? '∅'}` })
  }

  // ── Variables ──
  const oldVars = new Map(oldDsl.process.variables.map((v) => [v.name, v]))
  const newVars = new Map(newDsl.process.variables.map((v) => [v.name, v]))

  for (const [name] of newVars) {
    if (!oldVars.has(name)) diffs.push({ category: 'variable', action: 'added', label: name })
  }
  for (const [name] of oldVars) {
    if (!newVars.has(name)) diffs.push({ category: 'variable', action: 'removed', label: name })
  }
  for (const [name, nv] of newVars) {
    const ov = oldVars.get(name)
    if (!ov) continue
    if (ov.vtype !== nv.vtype) diffs.push({ category: 'variable', action: 'changed', label: `${name} type`, detail: `${ov.vtype} → ${nv.vtype}` })
    if (ov.value1 !== nv.value1) diffs.push({ category: 'variable', action: 'changed', label: `${name} default`, detail: `"${ov.value1}" → "${nv.value1}"` })
  }

  // ── Roles ──
  const oldRoles = new Set(oldDsl.process.roles.map((r) => r.name))
  const newRoles = new Set(newDsl.process.roles.map((r) => r.name))
  for (const r of newRoles) {
    if (!oldRoles.has(r)) diffs.push({ category: 'role', action: 'added', label: r })
  }
  for (const r of oldRoles) {
    if (!newRoles.has(r)) diffs.push({ category: 'role', action: 'removed', label: r })
  }

  // ── Config ──
  if (oldDsl.process.name !== newDsl.process.name) {
    diffs.push({ category: 'config', action: 'changed', label: 'Process name', detail: `"${oldDsl.process.name}" → "${newDsl.process.name}"` })
  }
  if (oldDsl.process.roleStart !== newDsl.process.roleStart) {
    diffs.push({ category: 'config', action: 'changed', label: 'Role start', detail: `"${oldDsl.process.roleStart ?? ''}" → "${newDsl.process.roleStart ?? ''}"` })
  }

  return diffs
}
