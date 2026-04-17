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
    // value2: check element EXISTENCE (not just text content) so that <value2></value2>
    // (empty tag) is preserved as '' rather than being dropped as falsy.
    const value2El = el.getElementsByTagName('value2')[0]
    const hasValue2El = value2El !== undefined
    const value2Raw = hasValue2El ? (value2El.textContent?.trim() ?? '') : undefined
    let vtype = childText(el, 'vtype') || 'String'
    const requiredRaw = childText(el, 'required')
    const linkfile = childText(el, 'linkfile') || undefined
    const labelRaw = childText(el, 'label')
    const readonlyRaw = childText(el, 'readonly')

    // Option types MUST have value2 present (even if empty) for engine dropdown rendering.
    // Non-Option: preserve value2 if the <value2> element was present in the source XML
    // (even when empty), so round-trips don't drop empty value2 tags the engine expects.
    const isOption = vtype === 'Option' || vtype === 'option'
    const value2Final = isOption
      ? (value2Raw ?? '')   // always set for Option (possibly "")
      : value2Raw           // undefined when element absent, '' when present but empty

    if (isOption && !hasValue2El) {
      warnings.push(`variabel "${name}": Option type missing <value2> element — emitting empty string`)
    }

    // Detect <required> position in the source XML for faithful round-trip output.
    // 'pre'  = required before value1   (Date/String/Number etc.)
    // 'mid'  = required between value1 and value2  (some Option types)
    // 'post' = required after vtype   (file/custom types)
    let requiredPosition: 'pre' | 'mid' | 'post' | undefined
    if (requiredRaw !== '') {
      const childTags = Array.from(el.children).map((c) => c.tagName.toLowerCase())
      const reqIdx   = childTags.indexOf('required')
      const val1Idx  = Math.max(childTags.indexOf('value1'), childTags.indexOf('value'))
      const vtypeIdx = childTags.indexOf('vtype')
      if (reqIdx > vtypeIdx && vtypeIdx >= 0) {
        requiredPosition = 'post'
      } else if (reqIdx > val1Idx && val1Idx >= 0) {
        requiredPosition = 'mid'
      } else {
        requiredPosition = 'pre'
      }
    }

    vars.push({
      name,
      value1,
      value2: value2Final,
      vtype,
      required: requiredRaw === 'true' ? true : requiredRaw === 'false' ? false : undefined,
      requiredPosition,
      linkfile,
      label:    labelRaw === 'true' ? true : labelRaw === 'false' ? false : undefined,
      readonly: readonlyRaw === 'true' ? true : readonlyRaw === 'false' ? false : undefined,
      defaultValue: value1, // legacy alias
    })
  }
  return vars
}

// ── Step-level metadata shared by all types ──────────────────

/**
 * Returns the text of a child element, or:
 *   undefined  — element not found
 *   ''         — element found but has no text content (preserves empty tags like <title/>)
 */
function childTextOrNull(parent: Element, tag: string): string | undefined {
  const el = parent.getElementsByTagName(tag)[0]
  if (!el) return undefined
  return el.textContent?.trim() ?? ''
}

function extractBaseStepMeta(el: Element) {
  // title: undefined=absent, ''=present-but-empty (preserves <title></title> for round-trip)
  const titleRaw = childTextOrNull(el, 'title')

  // Detect role-before-type and title-before-type ordering from source XML
  const childTags = Array.from(el.children).map((c) => c.tagName.toLowerCase())
  const roleIdx  = childTags.indexOf('role')
  const typeIdx  = childTags.indexOf('type')
  const titleIdx = childTags.indexOf('title')
  const roleBeforeType  = roleIdx >= 0 && typeIdx >= 0 && roleIdx < typeIdx
  const titleBeforeType = titleIdx >= 0 && typeIdx >= 0 && titleIdx < typeIdx
  // Detect duplicate role after type (some hand-authored XMLs have <role> both before and after <type>)
  const lastRoleIdx = childTags.lastIndexOf('role')
  const roleAfterType = lastRoleIdx > roleIdx && lastRoleIdx > typeIdx

  // Detect status/log field ordering for non-standard cases (e.g. logtrue before statustiket)
  const STATUS_LOG_FIELDS = new Set(['status', 'grup', 'statustiket', 'logstart', 'logtrue', 'logfalse', 'logsave'])
  const STANDARD_STATUS_LOG = ['status', 'grup', 'statustiket', 'logstart', 'logtrue', 'logfalse', 'logsave']
  const presentStatusLog = childTags.filter((t) => STATUS_LOG_FIELDS.has(t))
  const standardFiltered = STANDARD_STATUS_LOG.filter((t) => presentStatusLog.includes(t))
  const statusLogIsNonStandard = JSON.stringify(presentStatusLog) !== JSON.stringify(standardFiltered)
  const statusLogOrder = statusLogIsNonStandard ? presentStatusLog : undefined

  return {
    title: titleRaw,
    grup: childText(el, 'grup') || undefined,
    status: childText(el, 'status') || undefined,
    statustiket: childText(el, 'statustiket') || undefined,
    logstart: childText(el, 'logstart') || undefined,
    logtrue: childText(el, 'logtrue') || undefined,
    logfalse: childText(el, 'logfalse') || undefined,
    logsave: childText(el, 'logsave') || undefined,
    viewer: childText(el, 'viewer') || undefined,
    roleBeforeType: roleBeforeType || undefined,
    titleBeforeType: titleBeforeType || undefined,
    _roleAfterType: roleAfterType || undefined,
    _statusLogOrder: statusLogOrder,
  }
}

function extractStepRole(el: Element): string | undefined {
  const roleEl = el.getElementsByTagName('role')[0]
  if (!roleEl) return undefined
  const r = extractRoleText(roleEl)
  return r || undefined
}

/**
 * Parses a transition text value.
 *   "12"      → 12             (single target)
 *   "12;13"   → [12, 13]       (parallel branches)
 *   "12,13"   → [12, 13]       (comma-separated also accepted)
 *   ""        → undefined
 */
function parseTransitionValue(raw: string | undefined): number | number[] | undefined {
  if (!raw || !raw.trim()) return undefined
  const parts = raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0) return undefined
  const nums = parts.map((p) => parseInt(p, 10)).filter((n) => !isNaN(n))
  if (nums.length === 0) return undefined
  if (nums.length === 1) return nums[0]
  return nums
}

function extractTransitions(el: Element): StepTransitions {
  const t: StepTransitions = {}
  const rawTrue     = childText(el, 'steptrue')
  const rawFalse    = childText(el, 'stepfalse')
  const rawRollback = childText(el, 'steprollback')
  const v1 = parseTransitionValue(rawTrue)
  const v2 = parseTransitionValue(rawFalse)
  const v3 = parseTransitionValue(rawRollback)
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

  // Detect form_data_input vs form_data_view ordering in source XML for round-trip fidelity
  const childTags = Array.from(el.children).map((c) => c.tagName.toLowerCase())
  const inputIdx = childTags.indexOf('form_data_input')
  const viewIdx  = childTags.indexOf('form_data_view')
  const formDataInputFirst = inputIdx >= 0 && viewIdx >= 0 && inputIdx < viewIdx

  return {
    id, number, type: 'form', role, transitions, ...meta,
    tahap, formFields, formData,
    ...(formDataInput && { formDataInput }),
    ...(formDataView && { formDataView }),
    ...(decisionKey && { decisionKey }),
    // Preserve raw JSON strings so the generator can round-trip them verbatim
    ...(formDataRaw && { _rawFormData: formDataRaw }),
    ...(inputRaw.startsWith('{') && { _rawFormDataInput: inputRaw }),
    ...(viewRaw.startsWith('{') && { _rawFormDataView: viewRaw }),
    ...(decisionKeyRaw && { _rawDecisionKey: decisionKeyRaw }),
    ...(formDataInputFirst && { _formDataInputFirst: true }),
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

  return {
    id, number, type: 'decision_user', role, transitions, ...meta, rule, viewFields, decisionKey,
    ...(raw && { _rawDecisionKey: raw }),
  } satisfies DecisionUserStep
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
  const VALID: Operator[] = ['>', '<', '>=', '<=', '==', '!=', '=']
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
  // Engine wire format alias: <type>system_decision</type> == decision_sistem
  // Must match BEFORE the generic system_* catch-all, else variabela/operator/variabelb
  // are lost on round-trip (decision_sistem parse + generator emits condition tags).
  let type: WorkflowStep['type']
  if (typeRaw === 'form')            type = 'form'
  else if (typeRaw === 'decision_user')   type = 'decision_user'
  else if (typeRaw === 'decision_sistem') type = 'decision_sistem'
  else if (typeRaw === 'system_decision') type = 'decision_sistem'
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
  // Steps are kept in document order (not sorted by number) to preserve round-trip fidelity.
  // The engine resolves steps by number reference, so document order is irrelevant for execution.

  const process: WorkflowProcess = {
    id: uuidv4(),
    name: options.processName ?? 'Untitled Workflow',
    roleStart, roles, listGrup, variables, steps,
  }

  validateReferences(process, warnings)
  return { ok: true, data: { version: '1.0', process }, warnings }
}
