/**
 * workflow-validator.test.ts — self-executing assertion suite.
 *
 * Run via: `npx tsx src/lib/__tests__/workflow-validator.test.ts`
 * Or import and call runAllTests() from a dev harness.
 *
 * Uses plain console.assert / throw so no test framework is required.
 * Returns a summary object so a CI runner can programmatically check pass/fail.
 */
import type { WorkflowDSL } from '../../types/workflow'
import { validateWorkflow } from '../workflow-validator'
import { autoFixWorkflow } from '../workflow-autofix'
import { validateLogic } from '../workflow-logic-validator'

// ── Test helpers ──────────────────────────────────────────────

interface TestResult { name: string; passed: boolean; message: string }
const results: TestResult[] = []

function test(name: string, fn: () => void) {
  try {
    fn()
    results.push({ name, passed: true, message: 'OK' })
  } catch (e) {
    results.push({ name, passed: false, message: (e as Error).message })
  }
}

function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
      }
    },
    toContain(substr: string) {
      const str = String(actual)
      if (!str.includes(substr)) {
        throw new Error(`Expected "${str}" to contain "${substr}"`)
      }
    },
    toBeTruthy() {
      if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`)
    },
    toBeGreaterThan(n: number) {
      if (typeof actual !== 'number' || actual <= n) {
        throw new Error(`Expected > ${n}, got ${actual}`)
      }
    },
  }
}

// ── Fixture builders ──────────────────────────────────────────

function makeDSL(overrides: Partial<WorkflowDSL['process']> = {}): WorkflowDSL {
  return {
    version: '1.0',
    process: {
      id: 'test-process',
      name: 'Test Workflow',
      roleStart: 'DD',
      roles: [{ name: 'DD' }, { name: 'DS' }],
      listGrup: [{ id: '1', label: 'Draft' }],
      variables: [],
      steps: [],
      ...overrides,
    },
  }
}

// ─────────────────────────────────────────────────────────────
// 1. Broken role format (nested <value> leakage)
// ─────────────────────────────────────────────────────────────

test('autofix: strips leaked <value> wrapper from role', () => {
  const dsl = makeDSL({
    roles: [{ name: '<value>DD</value>' }],
    steps: [{
      id: '0', number: 0, type: 'end', transitions: {},
      role: '<value>DS</value>',
    }],
  })
  const { dsl: fixed, entries } = autoFixWorkflow(dsl)
  expect(fixed.process.roles[0].name).toBe('DD')
  expect(fixed.process.steps[0].role).toBe('DS')
  expect(entries.filter((e) => e.category === 'role-format').length).toBe(2)
})

// ─────────────────────────────────────────────────────────────
// 2. Missing decision condition
// ─────────────────────────────────────────────────────────────

test('validator: flags decision_sistem missing variabela', () => {
  const dsl = makeDSL({
    steps: [
      { id: '0', number: 0, type: 'form', formFields: [], formData: {}, transitions: { true: 1 } },
      { id: '1', number: 1, type: 'decision_sistem',
        condition: { variableA: '', operator: '>', variableB: '' },
        transitions: { true: 2, false: 0 } },
      { id: '2', number: 2, type: 'end', transitions: {} },
    ],
  })
  const report = validateWorkflow(dsl)
  const hasCondError = report.issues.some(
    (i) => i.severity === 'error' && i.message.includes('variabela'),
  )
  expect(hasCondError).toBe(true)
})

// ─────────────────────────────────────────────────────────────
// 3. Parallel without join
// ─────────────────────────────────────────────────────────────

test('logic-validator: detects parallel split with no convergence', () => {
  const dsl = makeDSL({
    steps: [
      { id: '0', number: 0, type: 'form', formFields: [], formData: {}, transitions: { true: [10, 20] } },
      { id: '10', number: 10, type: 'end', transitions: {} }, // branch A terminates alone
      { id: '20', number: 20, type: 'end', transitions: {} }, // branch B terminates alone
    ],
  })
  const report = validateLogic(dsl)
  const hasParallelError = report.issues.some(
    (i) => i.category === 'parallel-no-join' || i.category === 'premature-end',
  )
  expect(hasParallelError).toBe(true)
})

// ─────────────────────────────────────────────────────────────
// 4. Loop-back to start (steptrue = 0)
// ─────────────────────────────────────────────────────────────

test('validator: warns when non-zero step loops to 0', () => {
  const dsl = makeDSL({
    steps: [
      { id: '0', number: 0, type: 'form', formFields: [], formData: {}, transitions: { true: 5 } },
      { id: '5', number: 5, type: 'form', formFields: [], formData: {}, transitions: { true: 0 } },
    ],
  })
  const report = validateWorkflow(dsl)
  const hasLoopWarn = report.issues.some(
    (i) => i.severity === 'warning' && i.message.includes('loops back'),
  )
  expect(hasLoopWarn).toBe(true)
})

// ─────────────────────────────────────────────────────────────
// 5. Single assessor check (incomplete AND)
// ─────────────────────────────────────────────────────────────

test('logic-validator: detects incomplete AND when only one completion flag checked', () => {
  const dsl = makeDSL({
    variables: [
      { name: 'Apakah_Visitasi_Asesor_1_Selesai', value1: '', value2: 'Ya|Tidak', vtype: 'Option' },
      { name: 'Apakah_Visitasi_Asesor_2_Selesai', value1: '', value2: 'Ya|Tidak', vtype: 'Option' },
      { name: 'Ya_const', value1: 'Ya', vtype: 'String' },
    ],
    steps: [
      { id: '0', number: 0, type: 'form', formFields: [], formData: {}, transitions: { true: 10 } },
      { id: '10', number: 10, type: 'decision_sistem',
        condition: { variableA: 'Apakah_Visitasi_Asesor_1_Selesai', operator: '==', variableB: 'Ya_const' },
        transitions: { true: 20, false: 30 } },
      { id: '20', number: 20, type: 'end', transitions: {} },
      { id: '30', number: 30, type: 'end', transitions: {} },
    ],
  })
  const report = validateLogic(dsl)
  const hasIncompleteAnd = report.issues.some((i) => i.category === 'incomplete-and')
  expect(hasIncompleteAnd).toBe(true)
})

// ─────────────────────────────────────────────────────────────
// 6. Autofix: Option missing value2
// ─────────────────────────────────────────────────────────────

test('autofix: adds empty value2 to Option variable', () => {
  const dsl = makeDSL({
    variables: [
      { name: 'V1', value1: '', vtype: 'Option' },
    ],
  })
  const { dsl: fixed, entries } = autoFixWorkflow(dsl)
  expect(fixed.process.variables[0].value2).toBe('')
  expect(entries.some((e) => e.category === 'option-value2')).toBe(true)
})

// ─────────────────────────────────────────────────────────────
// 7. Autofix: lowercase option → Option
// ─────────────────────────────────────────────────────────────

test('autofix: normalizes lowercase "option" to "Option"', () => {
  const dsl = makeDSL({
    variables: [
      { name: 'V1', value1: '', vtype: 'option' as unknown as 'Option' },
    ],
  })
  const { dsl: fixed, entries } = autoFixWorkflow(dsl)
  expect(fixed.process.variables[0].vtype).toBe('Option')
  expect(entries.some((e) => e.category === 'option-case')).toBe(true)
})

// ─────────────────────────────────────────────────────────────
// 8. Autofix: duplicate variable names
// ─────────────────────────────────────────────────────────────

test('autofix: removes duplicate variable declarations (keeps first)', () => {
  const dsl = makeDSL({
    variables: [
      { name: 'V1', value1: 'first', vtype: 'String' },
      { name: 'V1', value1: 'second', vtype: 'String' },
    ],
  })
  const { dsl: fixed, entries } = autoFixWorkflow(dsl)
  expect(fixed.process.variables.length).toBe(1)
  expect(fixed.process.variables[0].value1).toBe('first')
  expect(entries.some((e) => e.category === 'duplicate-variable')).toBe(true)
})

// ─────────────────────────────────────────────────────────────
// 9. Autofix: transition array normalization
// ─────────────────────────────────────────────────────────────

test('autofix: collapses [12] to 12 and deduplicates [12,12,13]', () => {
  const dsl = makeDSL({
    steps: [
      { id: '0', number: 0, type: 'form', formFields: [], formData: {}, transitions: { true: [5] } },
      { id: '5', number: 5, type: 'form', formFields: [], formData: {}, transitions: { true: [12, 12, 13] } },
      { id: '12', number: 12, type: 'end', transitions: {} },
      { id: '13', number: 13, type: 'end', transitions: {} },
    ],
  })
  const { dsl: fixed } = autoFixWorkflow(dsl)
  expect(fixed.process.steps[0].transitions.true).toBe(5)            // [5] → 5
  const t = fixed.process.steps[1].transitions.true
  expect(Array.isArray(t)).toBe(true)
  expect((t as number[]).length).toBe(2)                              // deduped
})

// ─────────────────────────────────────────────────────────────
// 10. Autofix: email_user fork misconfiguration (flag only)
// ─────────────────────────────────────────────────────────────

test('autofix: flags system_email_user multi-role single-target', () => {
  const dsl = makeDSL({
    steps: [
      { id: '0', number: 0, type: 'form', formFields: [], formData: {}, transitions: { true: 50 } },
      { id: '50', number: 50, type: 'system_action',
        rawType: 'system_email_user', role: 'Assesor_1,Assesor_2',
        transitions: { true: 12 } },
      { id: '12', number: 12, type: 'end', transitions: {} },
    ],
  })
  const { entries } = autoFixWorkflow(dsl)
  expect(entries.some((e) => e.category === 'email-fork')).toBe(true)
})

// ─────────────────────────────────────────────────────────────
// 11. Idempotency: running autofix twice is safe
// ─────────────────────────────────────────────────────────────

test('autofix: is idempotent (second pass makes no changes)', () => {
  const dsl = makeDSL({
    variables: [{ name: 'V1', value1: '', vtype: 'option' as unknown as 'Option' }],
  })
  const first = autoFixWorkflow(dsl)
  const second = autoFixWorkflow(first.dsl)
  expect(second.fixedCount).toBe(0)
})

// ─────────────────────────────────────────────────────────────
// 12. Integration: corrected workflow passes full validation
// ─────────────────────────────────────────────────────────────

test('validator: a well-formed workflow passes with zero errors', () => {
  const dsl = makeDSL({
    steps: [
      { id: '0', number: 0, type: 'form', formFields: [], formData: {},
        decisionKey: { true: 'Next' }, transitions: { true: 1 } },
      { id: '1', number: 1, type: 'end', transitions: {} },
    ],
  })
  const report = validateWorkflow(dsl)
  expect(report.errors).toBe(0)
})

// ── Runner ────────────────────────────────────────────────────

export function runAllTests(): { passed: number; failed: number; results: TestResult[] } {
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length
  return { passed, failed, results }
}

// Auto-run when executed directly (e.g. via tsx)
// Use a dev-only guard to prevent running in production bundles.
declare const process: { argv?: string[] } | undefined
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('workflow-validator.test.ts')) {
  const summary = runAllTests()
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`Workflow Validator Test Suite — ${summary.passed}/${summary.results.length} passed`)
  console.log('═'.repeat(60))
  for (const r of summary.results) {
    const icon = r.passed ? '✓' : '✕'
    const color = r.passed ? '\x1b[32m' : '\x1b[31m'
    console.log(`${color}${icon}\x1b[0m ${r.name}${r.passed ? '' : `\n    └─ ${r.message}`}`)
  }
  console.log('═'.repeat(60))
  if (summary.failed > 0) {
    const g = globalThis as unknown as { process?: { exit?: (n: number) => void } }
    g.process?.exit?.(1)
  }
}
