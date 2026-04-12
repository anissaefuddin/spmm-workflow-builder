/**
 * workflowXmlParser.ts  —  Adapter: XML Process_Definition → JSON WorkflowDSL
 * ============================================================
 * Handles the FULL XML schema including the enriched spme-mahadaly.xml format:
 *   - <listgrup>     — display groups
 *   - <value1/2>     — primary/secondary variable values
 *   - <vtype>        — variable type (String, Option, Date, file, float, custom)
 *   - <required>     — field required flag
 *   - <linkfile>     — template download path
 *   - <title>        — step label
 *   - <grup/status/statustiket/logstart/logtrue/logfalse/logsave> — step metadata
 *   - system_* steps — mapped to system_action + rawType
 *
 * CONTRACT:
 *   - NEVER modifies the source XML
 *   - NEVER throws — all errors as ParseResult
 *   - Fully backward compatible with testcase.xml (simple format)
 *
 * ─────────────────────────────────────────────────────────────
 * EXAMPLE INPUT / OUTPUT:  see XML_TO_JSON_MAPPING.md
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  WorkflowDSL,
  WorkflowProcess,
  WorkflowStep,
  WorkflowVariable,
  WorkflowRole,
  ListGrup,
  FormStep,
  DecisionUserStep,
  DecisionSistemStep,
  SystemActionStep,
  EndStep,
  StepTransitions,
  FormFieldMap,
  DecisionKeyMap,
  Operator,
} from '../types/workflow'

// ── Public result types ──────────────────────────────────────

export interface ParseSuccess {
  ok: true
  data: WorkflowDSL
  warnings: string[]
}
export interface ParseFailure {
  ok: false
  error: string
  warnings: string[]
}
export type ParseResult = ParseSuccess | ParseFailure

export interface ParseOptions {
  processName?: string
}

// ── DOM helpers ──────────────────────────────────────────────

function childText(parent: Element, ...tags: string[]): string {
  for (const tag of tags) {
    const el = parent.getElementsByTagName(tag)[0]
    const v = el?.textContent?.trim()
    if (v !== undefined && v !== '') return v
  }
  return ''
}

function childInt(parent: Element, tag: string): number | undefined {
  const v = childText(parent, tag)
  if (!v) return undefined
  const n = parseInt(v, 10)
  return isNaN(n) ? undefined : n
}

function parseJsonField(raw: string, context: string, warnings: string[]): FormFieldMap {
  if (!raw) return {}
  try {
    const p = JSON.parse(raw)
    if (p !== null && typeof p === 'object' && !Array.isArray(p)) return p as FormFieldMap
    warnings.push(`${context}: JSON is not an object — ignored`)
  } catch {
    warnings.push(`${context}: malformed JSON "${raw.slice(0, 60)}" — ignored`)
  }
  return {}
}

function parseDecisionKeyField(raw: string, context: string, warnings: string[]): DecisionKeyMap {
  if (!raw) return {}
  try {
    const p = JSON.parse(raw)
    if (p !== null && typeof p === 'object' && !Array.isArray(p)) return p as DecisionKeyMap
    warnings.push(`${context}: decision_key JSON is not an object — ignored`)
  } catch {
    warnings.push(`${context}: malformed decision_key JSON "${raw.slice(0, 60)}" — ignored`)
  }
  return {}
}

function extractRoleText(el: Element): string {
  const valueEl = el.getElementsByTagName('value')[0]
  return (valueEl?.textContent ?? el.textContent ?? '').trim()
}

// ── Section extractors ───────────────────────────────────────

function extractRoleStart(root: Element): string | undefined {
  const v = childText(root, 'rolestart')
  return v || undefined
}

function extractListGrup(root: Element): ListGrup[] {
  const groups: ListGrup[] = []
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'listgrup') {
      const raw = (node as Element).textContent?.trim() ?? ''
      const pipe = raw.indexOf('|')
      if (pipe > -1) {
        groups.push({ id: raw.slice(0, pipe).trim(), label: raw.slice(pipe + 1).trim() })
      } else if (raw) {
        groups.push({ id: raw, label: raw })
      }
    }
  })
  return groups
}

function extractProcessRoles(root: Element): WorkflowRole[] {
  const roles: WorkflowRole[] = []
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'role') {
      const name = extractRoleText(node as Element)
      if (name) roles.push({ name })
    }
  })
  return roles
}

function extractVariables(root: Element, warnings: string[]): WorkflowVariable[] {
  const vars: WorkflowVariable[] = []
  const seen = new Set<string>()
  const nodes = root.getElementsByTagName('variabel')

  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i]
    // Skip variables nested inside <step>
    if (el.parentElement?.tagName === 'step') continue

    const name = childText(el, 'name')
    if (!name) { warnings.push(`variabel[${i}]: missing <name> — skipped`); continue }
    if (seen.has(name)) { warnings.push(`variabel "${name}" declared twice — keeping first`); continue }
    seen.add(name)

    // value1 — supports both <value1> (new) and <value> (legacy)
    const value1 = childText(el, 'value1', 'value')
    const value2Raw = childText(el, 'value2')
    const vtype = childText(el, 'vtype') || 'String'
    const requiredRaw = childText(el, 'required')
    const linkfile = childText(el, 'linkfile') || undefined

    vars.push({
      name,
      value1,
      value2: value2Raw || undefined,
      vtype,
      required: requiredRaw === 'true' ? true : requiredRaw === 'false' ? false : undefined,
      linkfile,
      defaultValue: value1, // legacy alias
    })
  }
  return vars
}

// ── Step-level metadata shared by all types ──────────────────

function extractBaseStepMeta(el: Element) {
  return {
    title: childText(el, 'title') || undefined,
    grup: childText(el, 'grup') || undefined,
    status: childText(el, 'status') || undefined,
    statustiket: childText(el, 'statustiket') || undefined,
    logstart: childText(el, 'logstart') || undefined,
    logtrue: childText(el, 'logtrue') || undefined,
    logfalse: childText(el, 'logfalse') || undefined,
    logsave: childText(el, 'logsave') || undefined,
  }
}

function extractStepRole(el: Element): string | undefined {
  const roleEl = el.getElementsByTagName('role')[0]
  if (!roleEl) return undefined
  const r = extractRoleText(roleEl)
  return r || undefined
}

function extractTransitions(el: Element): StepTransitions {
  const t: StepTransitions = {}
  const v1 = childInt(el, 'steptrue')
  const v2 = childInt(el, 'stepfalse')
  const v3 = childInt(el, 'steprollback')
  if (v1 !== undefined) t.true = v1
  if (v2 !== undefined) t.false = v2
  if (v3 !== undefined) t.rollback = v3
  return t
}

// ── Step parsers ───────────────────────────────────────���─────

function parseFormStep(
  el: Element, id: string, number: number,
  role: string | undefined, transitions: StepTransitions,
  meta: ReturnType<typeof extractBaseStepMeta>,
  warnings: string[],
): FormStep {
  const formDataRaw   = childText(el, 'form_data')
  const inputRaw      = childText(el, 'form_data_input')
  const viewRaw       = childText(el, 'form_data_view')
  const decisionKeyRaw = childText(el, 'decision_key')

  const canonicalRaw = formDataRaw || (inputRaw.startsWith('{') ? inputRaw : '')
  const formData = parseJsonField(canonicalRaw, `step[${number}] form_data`, warnings)

  const formDataInput = inputRaw.startsWith('{')
    ? parseJsonField(inputRaw, `step[${number}] form_data_input`, warnings)
    : undefined
  const formDataView = viewRaw.startsWith('{')
    ? parseJsonField(viewRaw, `step[${number}] form_data_view`, warnings)
    : undefined

  const decisionKey = decisionKeyRaw
    ? parseDecisionKeyField(decisionKeyRaw, `step[${number}] decision_key`, warnings)
    : undefined

  // Determine formFields from whichever source is available
  const fieldSource = formDataInput ?? formData
  const tahap = typeof fieldSource['tahap'] === 'string' ? fieldSource['tahap'] : undefined
  const formFields = Object.keys(fieldSource).filter((k) => k !== 'tahap')

  return {
    id, number, type: 'form', role, transitions, ...meta,
    tahap, formFields, formData,
    ...(formDataInput && { formDataInput }),
    ...(formDataView && { formDataView }),
    ...(decisionKey && { decisionKey }),
  } satisfies FormStep
}

function parseDecisionUserStep(
  el: Element, id: string, number: number,
  role: string | undefined, transitions: StepTransitions,
  meta: ReturnType<typeof extractBaseStepMeta>,
  warnings: string[],
): DecisionUserStep {
  const raw = childText(el, 'decision_key')
  const decisionKey = parseJsonField(raw, `step[${number}] decision_key`, warnings)
  const rule = typeof decisionKey['rule'] === 'string' ? decisionKey['rule'] : ''
  const viewFields = Object.keys(decisionKey).filter((k) => k !== 'rule')
  if (!rule) warnings.push(`step[${number}] decision_user: missing "rule" in decision_key`)

  return { id, number, type: 'decision_user', role, transitions, ...meta, rule, viewFields, decisionKey } satisfies DecisionUserStep
}

function parseDecisionSistemStep(
  el: Element, id: string, number: number,
  role: string | undefined, transitions: StepTransitions,
  meta: ReturnType<typeof extractBaseStepMeta>,
  warnings: string[],
): DecisionSistemStep {
  const variableA = childText(el, 'variabela')
  const operator  = childText(el, 'operator') as Operator
  const variableB = childText(el, 'variabelb')
  const VALID: Operator[] = ['>', '<', '>=', '<=', '==', '!=']
  if (!VALID.includes(operator)) warnings.push(`step[${number}] decision_sistem: unknown operator "${operator}"`)
  return { id, number, type: 'decision_sistem', role, transitions, ...meta, condition: { variableA, operator, variableB } } satisfies DecisionSistemStep
}

function parseSystemActionStep(
  el: Element, id: string, number: number,
  rawType: string, role: string | undefined, transitions: StepTransitions,
  meta: ReturnType<typeof extractBaseStepMeta>,
): SystemActionStep {
  // form_data_input/view can be plain variable names (not JSON) in system steps
  const inputRaw = childText(el, 'form_data_input')
  const viewRaw  = childText(el, 'form_data_view')
  return {
    id, number, type: 'system_action', rawType, role, transitions, ...meta,
    inputVariable: inputRaw || undefined,
    viewVariable: viewRaw || undefined,
  } satisfies SystemActionStep
}

function parseStep(el: Element, warnings: string[]): WorkflowStep {
  const numberRaw = childText(el, 'number')
  const number    = parseInt(numberRaw, 10)
  const typeRaw   = childText(el, 'type')
  const id        = uuidv4()
  if (isNaN(number)) warnings.push(`A step is missing a valid <number> — defaulting to 0`)

  const role       = extractStepRole(el)
  const transitions = extractTransitions(el)
  const meta       = extractBaseStepMeta(el)

  // Normalize step type
  let type: WorkflowStep['type']
  if (typeRaw === 'form')            type = 'form'
  else if (typeRaw === 'decision_user')   type = 'decision_user'
  else if (typeRaw === 'decision_sistem') type = 'decision_sistem'
  else if (typeRaw === 'end')            type = 'end'
  else if (typeRaw.startsWith('system_')) type = 'system_action'
  else {
    warnings.push(`step[${number}]: unknown type "${typeRaw}" — treated as end`)
    return { id, number: isNaN(number) ? 0 : number, type: 'end', role, transitions, ...meta } satisfies EndStep
  }

  switch (type) {
    case 'form':
      return parseFormStep(el, id, isNaN(number) ? 0 : number, role, transitions, meta, warnings)
    case 'decision_user':
      return parseDecisionUserStep(el, id, isNaN(number) ? 0 : number, role, transitions, meta, warnings)
    case 'decision_sistem':
      return parseDecisionSistemStep(el, id, isNaN(number) ? 0 : number, role, transitions, meta, warnings)
    case 'system_action':
      return parseSystemActionStep(el, id, isNaN(number) ? 0 : number, typeRaw, role, transitions, meta)
    case 'end':
      return { id, number: isNaN(number) ? 0 : number, type: 'end', role, transitions, ...meta } satisfies EndStep
  }
}

// ── Post-parse validation ─────────────────────────────────────

function validateReferences(process: WorkflowProcess, warnings: string[]): void {
  const stepNums = new Set(process.steps.map((s) => s.number))
  const varNames = new Set(process.variables.map((v) => v.name))

  if (!process.steps.some((s) => s.type === 'end')) {
    warnings.push('No end step found — workflow cannot terminate')
  }

  for (const step of process.steps) {
    const { transitions } = step
    for (const [k, t] of Object.entries(transitions) as [string, number | undefined][]) {
      if (t !== undefined && !stepNums.has(t)) {
        warnings.push(`step[${step.number}] transitions.${k} → step ${t} does not exist`)
      }
    }
    if (step.type === 'decision_sistem') {
      const { variableA, variableB } = step.condition
      if (variableA && !varNames.has(variableA))
        warnings.push(`step[${step.number}] decision_sistem: variableA "${variableA}" not declared`)
      if (variableB && !varNames.has(variableB))
        warnings.push(`step[${step.number}] decision_sistem: variableB "${variableB}" not declared`)
    }
  }
}

// ── Public API ─────────────────────────────────────────────��─

/**
 * Convert an XML Process_Definition string to a JSON WorkflowDSL.
 *
 * @example
 * const result = parseXmlToJson(xmlString, { processName: 'My Workflow' })
 * if (result.ok) {
 *   console.log(result.data.process.variables)
 *   console.log(result.warnings)  // non-fatal issues
 * } else {
 *   console.error(result.error)
 * }
 */
export function parseXmlToJson(xml: string, options: ParseOptions = {}): ParseResult {
  const warnings: string[] = []

  if (!xml?.trim()) return { ok: false, error: 'Input XML string is empty', warnings }

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml')
  } catch (e) {
    return { ok: false, error: `DOMParser failed: ${String(e)}`, warnings }
  }

  const parseErr = doc.querySelector('parsererror')
  if (parseErr) {
    return { ok: false, error: `XML parse error: ${parseErr.textContent?.replace(/\s+/g, ' ').trim()}`, warnings }
  }

  const root = doc.documentElement
  if (root.tagName !== 'Process_Definition') {
    return { ok: false, error: `Expected <Process_Definition>, got <${root.tagName}>`, warnings }
  }

  const roleStart = extractRoleStart(root)
  const roles     = extractProcessRoles(root)
  const listGrup  = extractListGrup(root)
  const variables = extractVariables(root, warnings)

  const stepEls = root.getElementsByTagName('step')
  if (stepEls.length === 0) warnings.push('No <step> elements found')

  const steps: WorkflowStep[] = []
  const seen = new Set<number>()
  for (let i = 0; i < stepEls.length; i++) {
    const step = parseStep(stepEls[i], warnings)
    if (seen.has(step.number)) { warnings.push(`Duplicate step ${step.number} — keeping first`); continue }
    seen.add(step.number)
    steps.push(step)
  }
  steps.sort((a, b) => a.number - b.number)

  const process: WorkflowProcess = {
    id: uuidv4(),
    name: options.processName ?? 'Untitled Workflow',
    roleStart, roles, listGrup, variables, steps,
  }

  validateReferences(process, warnings)
  return { ok: true, data: { version: '1.0', process }, warnings }
}
