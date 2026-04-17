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

// In XML text nodes only &, < and > must be escaped.
// Apostrophes and double-quotes only need escaping in attribute values — not in text nodes.
// Escaping them here would produce &apos; / &quot; which doesn't match hand-authored XML.
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }
const escapeXml = (s: string) => s.replace(/[&<>]/g, (c) => ESC[c] ?? c)

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
  // Simple <role>X</role> format — matches the working engine XML.
  // The legacy <role><value>X</value></role> format is accepted on import but NOT emitted.
  for (const r of process.roles) xml.tag('role', r.name, 1)
}

function serializeVariables(dsl: WorkflowDSL, xml: XmlBuilder) {
  for (const v of dsl.process.variables) {
    xml.open('variabel', 1)
    xml.tag('name', v.name, 2)

    // required position: use stored value when present (set during XML import).
    // Fall back to type-based defaults for DSLs created/loaded without requiredPosition:
    //   'post' — file types (vtype or linkfile) and angket_/statistik_ custom assessment types
    //   'mid'  — Option type with empty value2 (e.g. dynamic-population dropdowns like Assesor_1)
    //   'pre'  — everything else (String, Date, Number, Redirect, Option with non-empty value2)
    const isOption        = v.vtype === 'Option' || v.vtype === 'option'
    const isFile          = v.vtype === 'file'
    const hasLinkfile     = !!v.linkfile
    const isAngketOrStat  = v.vtype.startsWith('angket_') || v.vtype.startsWith('statistik_')
    const defaultPos: 'pre' | 'mid' | 'post' =
      (isFile || hasLinkfile || isAngketOrStat) ? 'post' :
      (isOption && (!v.value2 || v.value2 === '')) ? 'mid' :
      'pre'
    const reqPos = v.requiredPosition ?? defaultPos

    if (v.required !== undefined && reqPos === 'pre') xml.tag('required', String(v.required), 2)
    xml.tag('value1', v.value1, 2)
    if (v.required !== undefined && reqPos === 'mid') xml.tag('required', String(v.required), 2)
    // value2: always emit for Option and file types (empty string OK), conditional for others
    if (isOption || isFile || v.value2 !== undefined) {
      xml.tag('value2', v.value2 ?? '', 2)
    }
    xml.tag('vtype', v.vtype, 2)
    if (v.required !== undefined && reqPos === 'post') xml.tag('required', String(v.required), 2)
    if (v.linkfile) xml.tag('linkfile', v.linkfile, 2)
    if (v.label !== undefined)    xml.tag('label', String(v.label), 2)
    if (v.readonly !== undefined) xml.tag('readonly', String(v.readonly), 2)
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

/**
 * Emit title — emits empty tag when title === '' (preserves <title></title> from source XML).
 * Call after <type> in the normal case, or before <type> when step.titleBeforeType is true.
 */
function emitTitle(step: WorkflowStep, xml: XmlBuilder) {
  if (step.title !== undefined) xml.tag('title', step.title, 2)
}

/**
 * Emit title + viewer — comes immediately after <type> by default, before form data.
 * Engine processes child elements in document order; viewer must precede form_data_*.
 */
function serializeStepTitleViewer(step: WorkflowStep, xml: XmlBuilder) {
  emitTitle(step, xml)
  if (step.viewer) xml.tag('viewer', step.viewer, 2)
}

/**
 * Emit status, grup, statustiket and log fields — come AFTER form data in the engine XML.
 * Uses _statusLogOrder when present to reproduce non-standard source XML ordering.
 */
function serializeStepStatusLogs(step: WorkflowStep, xml: XmlBuilder) {
  const fields: Record<string, string | undefined> = {
    status:      step.status,
    grup:        step.grup,
    statustiket: step.statustiket,
    logstart:    step.logstart,
    logtrue:     step.logtrue,
    logfalse:    step.logfalse,
    logsave:     step.logsave,
  }
  const order = step._statusLogOrder ?? ['status', 'grup', 'statustiket', 'logstart', 'logtrue', 'logfalse', 'logsave']
  for (const name of order) {
    const val = fields[name]
    if (val) xml.tag(name, val, 2)
  }
}

/** Emit all step metadata (used by step types with no form data). */
function serializeStepMeta(step: WorkflowStep, xml: XmlBuilder) {
  serializeStepTitleViewer(step, xml)
  serializeStepStatusLogs(step, xml)
}

/** Serialize a transition target: number → "12", number[] → "12;13" (parallel branches) */
function formatTransitionTarget(t: number | number[]): string {
  return Array.isArray(t) ? t.join(';') : String(t)
}

function serializeTransitions(step: WorkflowStep, xml: XmlBuilder) {
  const { transitions: t } = step
  if (t.true     !== undefined) xml.tag('steptrue',     formatTransitionTarget(t.true),     2)
  if (t.false    !== undefined) xml.tag('stepfalse',    formatTransitionTarget(t.false),    2)
  if (t.rollback !== undefined) xml.tag('steprollback', formatTransitionTarget(t.rollback), 2)
}

function serializeStep(step: WorkflowStep, xml: XmlBuilder) {
  xml.open('step', 1)
  xml.tag('number', String(step.number), 2)

  // Emit title BEFORE <type> when titleBeforeType is set (e.g. some end steps)
  if (step.titleBeforeType) emitTitle(step, xml)

  // role-before-type: stored from original XML ordering for round-trip fidelity
  if (step.roleBeforeType && step.role) xml.tag('role', step.role, 2)

  switch (step.type) {
    case 'form': {
      const s = step as FormStep
      xml.tag('type', 'form', 2)
      if (!s.roleBeforeType && s.role) xml.tag('role', s.role, 2)
      // Some source XMLs have a duplicate <role> after <type> (quirk, not logic)
      if (s._roleAfterType && s.roleBeforeType && s.role) xml.tag('role', s.role, 2)
      // title + viewer come before form data (engine processes children in document order)
      if (!s.titleBeforeType) serializeStepTitleViewer(s, xml)
      else if (s.viewer) xml.tag('viewer', s.viewer, 2)
      // form_data_* and decision_key come before status/grup/statustiket/logs
      // Use raw strings when available (preserves original JSON formatting from import)
      // Ordering: view first by default; input first when _formDataInputFirst is set
      if (s._formDataInputFirst) {
        if (s.formDataInput) xml.rawTag('form_data_input', s._rawFormDataInput ?? JSON.stringify(s.formDataInput), 2)
        if (s.formDataView)  xml.rawTag('form_data_view',  s._rawFormDataView  ?? JSON.stringify(s.formDataView),  2)
      } else {
        if (s.formDataView)  xml.rawTag('form_data_view',  s._rawFormDataView  ?? JSON.stringify(s.formDataView),  2)
        if (s.formDataInput) xml.rawTag('form_data_input', s._rawFormDataInput ?? JSON.stringify(s.formDataInput), 2)
      }
      if (!s.formDataInput && !s.formDataView) xml.rawTag('form_data', s._rawFormData ?? buildFormDataJson(s), 2)
      if (s.decisionKey)   xml.rawTag('decision_key', s._rawDecisionKey ?? JSON.stringify(s.decisionKey), 2)
      // status/grup/statustiket/logs come after form data
      serializeStepStatusLogs(s, xml)
      break
    }
    case 'decision_user': {
      const s = step as DecisionUserStep
      xml.tag('type', 'decision_user', 2)
      if (!s.roleBeforeType && s.role) xml.tag('role', s.role, 2)
      if (!s.titleBeforeType) serializeStepTitleViewer(s, xml)
      else if (s.viewer) xml.tag('viewer', s.viewer, 2)
      xml.rawTag('decision_key', s._rawDecisionKey ?? buildDecisionUserJson(s), 2)
      serializeStepStatusLogs(s, xml)
      break
    }
    case 'decision_sistem': {
      const s = step as DecisionSistemStep
      // Emit engine wire format: <type>system_decision</type> (not the DSL-internal "decision_sistem")
      xml.tag('type', 'system_decision', 2)
      if (!s.roleBeforeType && s.role) xml.tag('role', s.role, 2)
      if (!s.titleBeforeType) serializeStepMeta(s, xml)
      else serializeStepStatusLogs(s, xml)
      xml.tag('variabela', s.condition.variableA, 2)
      xml.tag('operator',  s.condition.operator,  2)
      xml.tag('variabelb', s.condition.variableB, 2)
      break
    }
    case 'system_action': {
      const s = step as SystemActionStep
      // Write the original system_* type string back
      xml.tag('type', s.rawType, 2)
      if (!s.roleBeforeType && s.role) xml.tag('role', s.role, 2)
      // title comes before form_data for system steps
      if (!s.titleBeforeType && s.title !== undefined) xml.tag('title', s.title, 2)
      if (s.inputVariable) xml.tag('form_data_input', s.inputVariable, 2)
      if (s.viewVariable)  xml.tag('form_data_view',  s.viewVariable,  2)
      serializeStepStatusLogs(s, xml)
      break
    }
    case 'end':
      // Engine requires 'system_end' — 'end' is only a DSL-internal alias
      xml.tag('type', 'system_end', 2)
      if (!step.roleBeforeType && step.role) xml.tag('role', step.role, 2)
      if (!step.titleBeforeType) serializeStepMeta(step, xml)
      else serializeStepStatusLogs(step, xml)
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
/**
 * Compacts XML by collapsing indentation to single spaces between tags.
 * IMPORTANT: Must keep at least one space between `><` so that the existing
 * StartProcess parser (which iterates child nodes with j+=2, assuming
 * whitespace text nodes between elements) continues to work.
 */
export function minifyXml(xml: string): string {
  return xml
    .replace(/>\s+</g, '> <')    // collapse whitespace but keep ONE space (preserves DOM text nodes)
    .replace(/^\s+/gm, '')       // remove leading whitespace per line
    .replace(/\n+/g, '')         // remove newlines
    .trim()
}

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
  // Steps are emitted in DSL array order (preserved from source XML).
  // The engine resolves transitions by step number, so document order doesn't affect execution.
  for (const step of dsl.process.steps) { serializeStep(step, xml); xml.blank() }
  xml.close('Process_Definition', 0)

  return { ok: true, xml: xml.toString() }
}
