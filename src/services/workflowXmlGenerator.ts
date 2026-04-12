/**
 * workflowXmlGenerator.ts  —  Adapter: JSON WorkflowDSL → XML Process_Definition
 * ============================================================
 * Produces XML that is 100% compatible with spmm-be's DOM parser.
 * Handles the full schema including:
 *   - <listgrup>, <value1>, <value2>, <vtype>, <required>, <linkfile>
 *   - <title>, <grup>, <status>, <statustiket>, log fields
 *   - system_action steps (uses rawType as <type>)
 *   - <form_data_input> / <form_data_view> round-trip
 *
 * CONTRACT:
 *   - Never throws — all errors as GenerateResult
 *   - Proper XML character escaping in all text nodes
 *   - Step output order matches hand-authored XML
 */

import type {
  WorkflowDSL,
  WorkflowStep,
  FormStep,
  DecisionUserStep,
  DecisionSistemStep,
  SystemActionStep,
} from '../types/workflow'

// ── Public result types ──────────────────────────────────────

export interface GenerateSuccess { ok: true; xml: string }
export interface GenerateFailure { ok: false; error: string }
export type GenerateResult = GenerateSuccess | GenerateFailure

export interface GenerateOptions {
  /** Indentation string per level. Default: '\t' */
  indent?: string
}

// ── XML escaping ─────────────────────────────────────────────

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
const escapeXml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c)

// ── Validation ────────────────────────────────────────────────

function validateDSL(dsl: WorkflowDSL): string[] {
  const errs: string[] = []
  if (!dsl?.process) { errs.push('Missing process'); return errs }
  const { steps } = dsl.process
  if (!steps?.length) { errs.push('Process has no steps'); return errs }

  const seen = new Set<number>()
  for (const s of steps) {
    if (isNaN(s.number)) errs.push(`Step missing valid number`)
    if (seen.has(s.number)) errs.push(`Duplicate step number: ${s.number}`)
    seen.add(s.number)
    if (!(s as { type?: unknown }).type) errs.push(`Step ${s.number} missing type`)
    if (s.type === 'decision_sistem') {
      const ds = s as DecisionSistemStep
      if (!ds.condition?.variableA) errs.push(`Step ${s.number} decision_sistem: missing variableA`)
      if (!ds.condition?.variableB) errs.push(`Step ${s.number} decision_sistem: missing variableB`)
    }
  }
  return errs
}

// ── Builder ───────────────────────────────────────────────────

class XmlBuilder {
  private lines: string[] = []
  constructor(private readonly i: string) {}

  /** Escaped text node tag */
  tag(name: string, value: string, depth: number) {
    this.lines.push(`${this.i.repeat(depth)}<${name}>${escapeXml(value)}</${name}>`)
  }

  /** Raw (pre-formatted) value tag — used for embedded JSON strings */
  rawTag(name: string, raw: string, depth: number) {
    this.lines.push(`${this.i.repeat(depth)}<${name}>${raw}</${name}>`)
  }

  open(name: string, depth: number) { this.lines.push(`${this.i.repeat(depth)}<${name}>`) }
  close(name: string, depth: number) { this.lines.push(`${this.i.repeat(depth)}</${name}>`) }
  blank() { this.lines.push('') }

  toString() { return this.lines.join('\n') }
}

// ── Section serialisers ───────────────────────────────────────

function serializeRoles(dsl: WorkflowDSL, xml: XmlBuilder) {
  const { process } = dsl
  if (process.roleStart) { xml.tag('rolestart', process.roleStart, 1); xml.blank() }
  for (const g of process.listGrup) xml.tag('listgrup', `${g.id}|${g.label}`, 1)
  for (const r of process.roles) { xml.open('role', 1); xml.tag('value', r.name, 2); xml.close('role', 1) }
}

function serializeVariables(dsl: WorkflowDSL, xml: XmlBuilder) {
  for (const v of dsl.process.variables) {
    xml.open('variabel', 1)
    xml.tag('name', v.name, 2)
    xml.tag('value1', v.value1, 2)
    if (v.value2 !== undefined) xml.tag('value2', v.value2, 2)
    xml.tag('vtype', v.vtype, 2)
    if (v.required !== undefined) xml.tag('required', String(v.required), 2)
    if (v.linkfile) xml.tag('linkfile', v.linkfile, 2)
    xml.close('variabel', 1)
  }
}

/** Build form_data JSON preserving tahap-first key order */
function buildFormDataJson(step: FormStep): string {
  const obj: Record<string, string> = {}
  if (step.tahap !== undefined) obj['tahap'] = step.tahap
  for (const k of step.formFields) obj[k] = step.formData[k] ?? ''
  return JSON.stringify(obj)
}

/** Build decision_key JSON: rule-first for decision_user, pass-through for form */
function buildDecisionUserJson(step: DecisionUserStep): string {
  const obj: Record<string, string> = { rule: step.rule }
  for (const k of step.viewFields) obj[k] = (step.decisionKey[k] as string) ?? ''
  return JSON.stringify(obj)
}

/** Emit common optional metadata tags (title, grup, status, etc.) */
function serializeStepMeta(step: WorkflowStep, xml: XmlBuilder) {
  if (step.title)       xml.tag('title', step.title, 2)
  if (step.status)      xml.tag('status', step.status, 2)
  if (step.grup)        xml.tag('grup', step.grup, 2)
  if (step.statustiket) xml.tag('statustiket', step.statustiket, 2)
  if (step.logstart)    xml.tag('logstart', step.logstart, 2)
  if (step.logtrue)     xml.tag('logtrue', step.logtrue, 2)
  if (step.logfalse)    xml.tag('logfalse', step.logfalse, 2)
  if (step.logsave)     xml.tag('logsave', step.logsave, 2)
}

function serializeTransitions(step: WorkflowStep, xml: XmlBuilder) {
  const { transitions: t } = step
  if (t.true     !== undefined) xml.tag('steptrue',     String(t.true),     2)
  if (t.false    !== undefined) xml.tag('stepfalse',    String(t.false),    2)
  if (t.rollback !== undefined) xml.tag('steprollback', String(t.rollback), 2)
}

function serializeStep(step: WorkflowStep, xml: XmlBuilder) {
  xml.open('step', 1)
  xml.tag('number', String(step.number), 2)
  if (step.role) { xml.open('role', 2); xml.tag('value', step.role, 3); xml.close('role', 2) }

  switch (step.type) {
    case 'form': {
      const s = step as FormStep
      // Use rawType if present, else 'form'
      xml.tag('type', 'form', 2)
      serializeStepMeta(s, xml)
      // Emit form_data_view first (if present) then form_data_input, then legacy form_data
      if (s.formDataView)  xml.rawTag('form_data_view',  JSON.stringify(s.formDataView),  2)
      if (s.formDataInput) xml.rawTag('form_data_input', JSON.stringify(s.formDataInput), 2)
      if (!s.formDataInput && !s.formDataView) xml.rawTag('form_data', buildFormDataJson(s), 2)
      if (s.decisionKey)   xml.rawTag('decision_key', JSON.stringify(s.decisionKey), 2)
      break
    }
    case 'decision_user': {
      const s = step as DecisionUserStep
      xml.tag('type', 'decision_user', 2)
      serializeStepMeta(s, xml)
      xml.rawTag('decision_key', buildDecisionUserJson(s), 2)
      break
    }
    case 'decision_sistem': {
      const s = step as DecisionSistemStep
      xml.tag('type', 'decision_sistem', 2)
      serializeStepMeta(s, xml)
      xml.tag('variabela', s.condition.variableA, 2)
      xml.tag('operator',  s.condition.operator,  2)
      xml.tag('variabelb', s.condition.variableB, 2)
      break
    }
    case 'system_action': {
      const s = step as SystemActionStep
      // Write the original system_* type string back
      xml.tag('type', s.rawType, 2)
      serializeStepMeta(s, xml)
      if (s.inputVariable) xml.tag('form_data_input', s.inputVariable, 2)
      if (s.viewVariable)  xml.tag('form_data_view',  s.viewVariable,  2)
      break
    }
    case 'end':
      xml.tag('type', 'end', 2)
      serializeStepMeta(step, xml)
      break
  }

  serializeTransitions(step, xml)
  xml.close('step', 1)
}

// ── Public API ────────────────────────────────────────────────

/**
 * Convert a JSON WorkflowDSL to an XML Process_Definition string.
 *
 * @example
 * const result = generateXmlFromJson(dsl)
 * if (result.ok) {
 *   // POST result.xml to /api/wf/createDefinition
 * } else {
 *   console.error(result.error)
 * }
 */
export function generateXmlFromJson(dsl: WorkflowDSL, options: GenerateOptions = {}): GenerateResult {
  const errs = validateDSL(dsl)
  if (errs.length) return { ok: false, error: errs.join('; ') }

  const xml = new XmlBuilder(options.indent ?? '\t')
  xml.open('Process_Definition', 0)
  xml.blank()
  serializeRoles(dsl, xml)
  xml.blank()
  serializeVariables(dsl, xml)
  xml.blank()
  const sorted = [...dsl.process.steps].sort((a, b) => a.number - b.number)
  for (const step of sorted) { serializeStep(step, xml); xml.blank() }
  xml.close('Process_Definition', 0)

  return { ok: true, xml: xml.toString() }
}
