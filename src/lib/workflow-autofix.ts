/**
 * workflow-autofix.ts — automatic repair for common workflow issues.
 *
 * Takes a potentially-broken WorkflowDSL and applies safe, reversible fixes.
 * Pure function: returns a NEW DSL object + a log of what was changed.
 * Never throws; any unfixable issue is reported without mutation.
 *
 * SAFETY PRINCIPLES:
 *   - Never delete steps without an explicit `aggressive` flag
 *   - Never silently invent step transitions
 *   - Always report every change so the user can review
 *   - Idempotent: running autofix twice on the same DSL is a no-op on the second run
 */
import type {
  WorkflowDSL,
  WorkflowStep,
  WorkflowVariable,
  DecisionSistemStep,
  TransitionTarget,
} from '../types/workflow'

export interface AutofixEntry {
  category:
    | 'role-format'
    | 'option-value2'
    | 'option-case'
    | 'transition-array'
    | 'decision-incomplete'
    | 'dead-step'
    | 'duplicate-variable'
    | 'loop-to-start'
    | 'email-fork'
  severity: 'info' | 'warning' | 'error'
  message: string
  stepNumber?: number
  variableName?: string
  /** Whether the fix was applied (true) or just flagged (false). */
  fixed: boolean
}

export interface AutofixResult {
  dsl: WorkflowDSL
  entries: AutofixEntry[]
  fixedCount: number
  flaggedCount: number
}

export interface AutofixOptions {
  /** Apply aggressive fixes (remove dead steps, etc.). Default false. */
  aggressive?: boolean
  /** Skip categories (if you only want a subset of fixes). */
  skip?: AutofixEntry['category'][]
}

const STANDARD_VTYPES = new Set(['String', 'Number', 'float', 'Date', 'Option', 'file'])

// ──────────────────────────────────────────────────────────────

/**
 * Applies all auto-fixes to a DSL. Returns a new DSL + a change log.
 *
 * @example
 *   const { dsl: fixed, entries } = autoFixWorkflow(brokenDsl)
 *   console.log(entries.filter(e => e.fixed).length, 'issues repaired')
 */
export function autoFixWorkflow(dsl: WorkflowDSL, opts: AutofixOptions = {}): AutofixResult {
  const entries: AutofixEntry[] = []
  const skip = new Set(opts.skip ?? [])

  // Deep clone so we don't mutate the input
  const fixed: WorkflowDSL = structuredClone(dsl)

  if (!skip.has('option-case'))        fixOptionCase(fixed, entries)
  if (!skip.has('option-value2'))      fixOptionValue2(fixed, entries)
  if (!skip.has('duplicate-variable')) fixDuplicateVariables(fixed, entries)
  if (!skip.has('role-format'))        fixRoleFormat(fixed, entries)
  if (!skip.has('transition-array'))   fixTransitionNormalization(fixed, entries)
  if (!skip.has('decision-incomplete')) fixIncompleteDecisions(fixed, entries)
  if (!skip.has('loop-to-start'))      flagLoopToStart(fixed, entries)
  if (!skip.has('email-fork'))         flagEmailForkMisconfigs(fixed, entries)
  if (!skip.has('dead-step') && opts.aggressive) {
    removeOrphanKosongSteps(fixed, entries)
  }

  const fixedCount = entries.filter((e) => e.fixed).length
  const flaggedCount = entries.filter((e) => !e.fixed).length

  return { dsl: fixed, entries, fixedCount, flaggedCount }
}

// ── FIX #1: Option type vtype case ───────────────────────────

function fixOptionCase(dsl: WorkflowDSL, entries: AutofixEntry[]) {
  for (const v of dsl.process.variables) {
    if (v.vtype.toLowerCase() === 'option' && v.vtype !== 'Option') {
      entries.push({
        category: 'option-case',
        severity: 'info',
        message: `Variable "${v.name}": normalized vtype "${v.vtype}" → "Option"`,
        variableName: v.name,
        fixed: true,
      })
      v.vtype = 'Option'
    }
  }
}

// ── FIX #2: Option requires value2 ───────────────────────────

function fixOptionValue2(dsl: WorkflowDSL, entries: AutofixEntry[]) {
  for (const v of dsl.process.variables) {
    if (v.vtype === 'Option' && v.value2 === undefined) {
      entries.push({
        category: 'option-value2',
        severity: 'info',
        message: `Variable "${v.name}": added empty <value2> required by engine for Option dropdown rendering`,
        variableName: v.name,
        fixed: true,
      })
      v.value2 = ''
    }
  }
}

// ── FIX #3: Duplicate variable names ─────────────────────────

function fixDuplicateVariables(dsl: WorkflowDSL, entries: AutofixEntry[]) {
  const seen = new Set<string>()
  const kept: WorkflowVariable[] = []
  for (const v of dsl.process.variables) {
    if (seen.has(v.name)) {
      entries.push({
        category: 'duplicate-variable',
        severity: 'warning',
        message: `Variable "${v.name}": duplicate declaration removed (keeping first occurrence)`,
        variableName: v.name,
        fixed: true,
      })
      continue
    }
    seen.add(v.name)
    kept.push(v)
  }
  dsl.process.variables = kept
}

// ── FIX #4: Role format (nothing to fix in DSL — already string;
//           this flags if a role value contains nested-format artifacts) ──

function fixRoleFormat(dsl: WorkflowDSL, entries: AutofixEntry[]) {
  // In the DSL, role is already a flat string. This fix scans for
  // XML-artifact leakage: a role string containing "<value>" fragments
  // that may have survived a broken round-trip.
  const sanitize = (s: string): string => {
    // Strip accidental <value>X</value> wrappers that leaked through a bad parse
    const m = s.match(/<\s*value\s*>\s*([^<]+?)\s*<\s*\/\s*value\s*>/)
    return m ? m[1] : s
  }

  for (const r of dsl.process.roles) {
    const cleaned = sanitize(r.name)
    if (cleaned !== r.name) {
      entries.push({
        category: 'role-format',
        severity: 'warning',
        message: `Process role "${r.name}": stripped nested <value> artifact → "${cleaned}"`,
        fixed: true,
      })
      r.name = cleaned
    }
  }

  for (const step of dsl.process.steps) {
    if (step.role) {
      const cleaned = sanitize(step.role)
      if (cleaned !== step.role) {
        entries.push({
          category: 'role-format',
          severity: 'warning',
          message: `Step #${step.number} role "${step.role}": stripped nested <value> artifact → "${cleaned}"`,
          stepNumber: step.number,
          fixed: true,
        })
        step.role = cleaned
      }
    }
  }
}

// ── FIX #5: Transition normalization ─────────────────────────

function fixTransitionNormalization(dsl: WorkflowDSL, entries: AutofixEntry[]) {
  for (const step of dsl.process.steps) {
    for (const key of ['true', 'false', 'rollback'] as const) {
      const t = step.transitions[key]
      if (t === undefined) continue

      // Collapse single-element arrays to scalars (canonical form)
      if (Array.isArray(t) && t.length === 1) {
        entries.push({
          category: 'transition-array',
          severity: 'info',
          message: `Step #${step.number}: collapsed single-element ${key}-array [${t[0]}] → ${t[0]}`,
          stepNumber: step.number,
          fixed: true,
        })
        step.transitions[key] = t[0]
        continue
      }

      // Deduplicate arrays
      if (Array.isArray(t)) {
        const unique = [...new Set(t)]
        if (unique.length !== t.length) {
          entries.push({
            category: 'transition-array',
            severity: 'warning',
            message: `Step #${step.number}: deduplicated ${key}-branch [${t.join(',')}] → [${unique.join(',')}]`,
            stepNumber: step.number,
            fixed: true,
          })
          step.transitions[key] = unique.length === 1 ? unique[0] : unique
        }
      }
    }
  }
}

// ── FIX #6: Incomplete decision_sistem (flag only — needs human input) ──

function fixIncompleteDecisions(dsl: WorkflowDSL, entries: AutofixEntry[]) {
  const varNames = new Set(dsl.process.variables.map((v) => v.name))

  for (const step of dsl.process.steps) {
    if (step.type !== 'decision_sistem') continue
    const ds = step as DecisionSistemStep
    const missingA = !ds.condition.variableA
    const missingB = !ds.condition.variableB
    const missingOp = !ds.condition.operator

    if (missingA || missingB || missingOp) {
      // Attempt inference: if title or surrounding steps hint at a variable
      const inferredVar = inferConditionVariable(step, dsl)
      if (inferredVar && missingA && !missingB) {
        ds.condition.variableA = inferredVar
        entries.push({
          category: 'decision-incomplete',
          severity: 'warning',
          message: `Step #${step.number}: inferred variabela="${inferredVar}" from context`,
          stepNumber: step.number,
          fixed: true,
        })
      } else {
        entries.push({
          category: 'decision-incomplete',
          severity: 'error',
          message: `Step #${step.number}: decision_sistem is incomplete${missingA ? ' (no variabela)' : ''}${missingOp ? ' (no operator)' : ''}${missingB ? ' (no variabelb)' : ''}. Manual fix required.`,
          stepNumber: step.number,
          fixed: false,
        })
      }
    }

    // Sanity: referenced variables should exist
    if (ds.condition.variableA && !varNames.has(ds.condition.variableA)) {
      entries.push({
        category: 'decision-incomplete',
        severity: 'warning',
        message: `Step #${step.number}: variabela="${ds.condition.variableA}" is not declared in <variabel> list`,
        stepNumber: step.number,
        fixed: false,
      })
    }
    if (ds.condition.variableB && !varNames.has(ds.condition.variableB)) {
      entries.push({
        category: 'decision-incomplete',
        severity: 'warning',
        message: `Step #${step.number}: variabelb="${ds.condition.variableB}" is not declared in <variabel> list`,
        stepNumber: step.number,
        fixed: false,
      })
    }
  }
}

/**
 * Heuristic: look at the step's title and siblings to guess a completion-flag variable.
 * Returns undefined if no confident guess is possible.
 */
function inferConditionVariable(step: WorkflowStep, dsl: WorkflowDSL): string | undefined {
  const title = (step.title ?? '').toLowerCase()
  // Match common assessor naming in SPMM workflows
  if (title.includes('asesor 1') || title.includes('assesor 1')) {
    const v = dsl.process.variables.find((x) => /asesor_?1.*selesai/i.test(x.name))
    return v?.name
  }
  if (title.includes('asesor 2') || title.includes('assesor 2')) {
    const v = dsl.process.variables.find((x) => /asesor_?2.*selesai/i.test(x.name))
    return v?.name
  }
  return undefined
}

// ── FIX #7: Flag loops-to-start ──────────────────────────────

function flagLoopToStart(dsl: WorkflowDSL, entries: AutofixEntry[]) {
  for (const step of dsl.process.steps) {
    if (step.number === 0) continue
    for (const key of ['true', 'false'] as const) {
      const t = step.transitions[key]
      if (t === undefined) continue
      const targets = Array.isArray(t) ? t : [t]
      if (targets.includes(0)) {
        entries.push({
          category: 'loop-to-start',
          severity: 'warning',
          message: `Step #${step.number}: <step${key}>=0 loops back to Draft — not auto-fixed (semantically ambiguous)`,
          stepNumber: step.number,
          fixed: false,
        })
      }
    }
  }
}

// ── FIX #8: Flag email-fork misconfigurations ────────────────

function flagEmailForkMisconfigs(dsl: WorkflowDSL, entries: AutofixEntry[]) {
  for (const step of dsl.process.steps) {
    if (step.type !== 'system_action') continue
    const rawType = (step as WorkflowStep & { rawType?: string }).rawType ?? ''
    if (!rawType.includes('email_user')) continue

    const role = step.role ?? ''
    const multiRole = role.includes(',') || role.includes(';')
    if (!multiRole) continue

    const t = step.transitions.true
    const arr = t === undefined ? [] : Array.isArray(t) ? t : [t]
    if (arr.length <= 1 || arr[0] === 0) {
      entries.push({
        category: 'email-fork',
        severity: 'warning',
        message: `Step #${step.number}: multi-role email (${role}) with single-target steptrue=${arr[0] ?? 0} — likely needs parallel fork "X;Y"`,
        stepNumber: step.number,
        fixed: false,
      })
    }
  }
}

// ── FIX #9 (aggressive): remove orphan system_kosong steps ──

function removeOrphanKosongSteps(dsl: WorkflowDSL, entries: AutofixEntry[]) {
  const incoming = new Map<number, number[]>()
  for (const s of dsl.process.steps) {
    const outs = getAllTargets(s.transitions.true)
      .concat(getAllTargets(s.transitions.false))
      .concat(getAllTargets(s.transitions.rollback))
    for (const t of outs) {
      incoming.set(t, [...(incoming.get(t) ?? []), s.number])
    }
  }

  const toRemove = new Set<number>()
  for (const step of dsl.process.steps) {
    if (step.type !== 'system_action') continue
    const rawType = (step as WorkflowStep & { rawType?: string }).rawType ?? ''
    if (rawType !== 'system_kosong') continue
    // Only remove if no incoming edges (truly orphan)
    if ((incoming.get(step.number) ?? []).length === 0) {
      toRemove.add(step.number)
      entries.push({
        category: 'dead-step',
        severity: 'warning',
        message: `Step #${step.number} (system_kosong): no incoming transitions — removed`,
        stepNumber: step.number,
        fixed: true,
      })
    }
  }
  if (toRemove.size > 0) {
    dsl.process.steps = dsl.process.steps.filter((s) => !toRemove.has(s.number))
  }
}

function getAllTargets(t: TransitionTarget | undefined): number[] {
  if (t === undefined) return []
  return Array.isArray(t) ? t : [t]
}

// ── Summary formatter ────────────────────────────────────────

export function summarizeAutofix(result: AutofixResult): string {
  const parts: string[] = []
  parts.push(`${result.fixedCount} fixed`)
  if (result.flaggedCount > 0) parts.push(`${result.flaggedCount} flagged (manual review)`)
  const categories = [...new Set(result.entries.map((e) => e.category))]
  if (categories.length > 0) parts.push(`categories: ${categories.join(', ')}`)
  return parts.join(' · ')
}
