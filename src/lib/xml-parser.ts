// ============================================================
// XML Parser — converts existing XML Process_Definition to JSON DSL
// STRICTLY READ-ONLY — does NOT modify XML in any way
// ============================================================
import { v4 as uuidv4 } from 'uuid'
import type {
  WorkflowDSL,
  WorkflowProcess,
  WorkflowVariable,
  WorkflowRole,
  WorkflowStep,
  FormStep,
  DecisionUserStep,
  DecisionSistemStep,
  EndStep,
  StepTransitions,
  FormFieldMap,
  Operator,
} from '../types/workflow'

function getText(el: Element, tag: string): string {
  const node = el.getElementsByTagName(tag)[0]
  return node ? node.textContent?.trim() ?? '' : ''
}

function getOptionalNumber(el: Element, tag: string): number | undefined {
  const node = el.getElementsByTagName(tag)[0]
  if (!node) return undefined
  const v = node.textContent?.trim()
  if (v === undefined || v === '') return undefined
  const n = parseInt(v, 10)
  return isNaN(n) ? undefined : n
}

function parseFormDataJson(raw: string): FormFieldMap {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as FormFieldMap
    }
  } catch {
    // malformed JSON — try to salvage by extracting keys
  }
  return {}
}

function extractRoles(doc: Document): WorkflowRole[] {
  const roles: WorkflowRole[] = []
  const roleNodes = doc.documentElement.childNodes
  roleNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'role') {
      const el = node as Element
      const valueEl = el.getElementsByTagName('value')[0]
      if (valueEl) {
        const name = valueEl.textContent?.trim() ?? ''
        if (name) roles.push({ name })
      }
    }
  })
  return roles
}

function extractVariables(doc: Document): WorkflowVariable[] {
  const vars: WorkflowVariable[] = []
  const nodes = doc.getElementsByTagName('variabel')
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i]
    const name = getText(el, 'name')
    const value = getText(el, 'value')
    if (name) vars.push({ name, value1: value ?? '', vtype: 'String', defaultValue: value })
  }
  return vars
}

function parseStep(el: Element): WorkflowStep {
  const number = parseInt(getText(el, 'number'), 10)
  const type = getText(el, 'type') as WorkflowStep['type']

  // Role — note: in some XML it is a direct text child of <step><role>
  // In others it's <role><value>...</value></role>
  let role: string | undefined
  const roleEl = el.getElementsByTagName('role')[0]
  if (roleEl) {
    const valueEl = roleEl.getElementsByTagName('value')[0]
    if (valueEl) {
      role = valueEl.textContent?.trim()
    } else {
      role = roleEl.textContent?.trim()
    }
    if (!role) role = undefined
  }

  const transitions: StepTransitions = {}
  const stepTrue = getOptionalNumber(el, 'steptrue')
  const stepFalse = getOptionalNumber(el, 'stepfalse')
  const stepRollback = getOptionalNumber(el, 'steprollback')
  if (stepTrue !== undefined) transitions.true = stepTrue
  if (stepFalse !== undefined) transitions.false = stepFalse
  if (stepRollback !== undefined) transitions.rollback = stepRollback

  const id = uuidv4()

  if (type === 'form') {
    const formDataRaw = getText(el, 'form_data')
    const formData = parseFormDataJson(formDataRaw)
    const formFields = Object.keys(formData).filter((k) => k !== 'tahap')
    const tahap = formData['tahap'] as string | undefined

    return {
      id,
      number,
      type: 'form',
      role,
      tahap,
      formFields,
      formData,
      transitions,
    } satisfies FormStep
  }

  if (type === 'decision_user') {
    const decisionKeyRaw = getText(el, 'decision_key')
    const decisionKey = parseFormDataJson(decisionKeyRaw)
    const rule = (decisionKey['rule'] as string) ?? ''
    const viewFields = Object.keys(decisionKey).filter((k) => k !== 'rule')

    return {
      id,
      number,
      type: 'decision_user',
      role,
      rule,
      viewFields,
      decisionKey,
      transitions,
    } satisfies DecisionUserStep
  }

  if (type === 'decision_sistem') {
    const variableA = getText(el, 'variabela')
    const operator = getText(el, 'operator') as Operator
    const variableB = getText(el, 'variabelb')

    return {
      id,
      number,
      type: 'decision_sistem',
      role,
      condition: { variableA, operator, variableB },
      transitions,
    } satisfies DecisionSistemStep
  }

  // end (and any unknown type falls here)
  return {
    id,
    number,
    type: 'end',
    role,
    transitions,
  } satisfies EndStep
}

export function parseXmlToWorkflow(xmlString: string, processName = 'Untitled Workflow'): WorkflowDSL {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'application/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error(`XML parse error: ${parseError.textContent}`)
  }

  const root = doc.documentElement
  if (root.tagName !== 'Process_Definition') {
    throw new Error(`Expected root element <Process_Definition>, got <${root.tagName}>`)
  }

  const roleStartEl = root.getElementsByTagName('rolestart')[0]
  const roleStart = roleStartEl?.textContent?.trim()

  const roles = extractRoles(doc)
  const variables = extractVariables(doc)

  const stepEls = doc.getElementsByTagName('step')
  const steps: WorkflowStep[] = []
  for (let i = 0; i < stepEls.length; i++) {
    steps.push(parseStep(stepEls[i]))
  }

  // Sort by number for deterministic ordering
  steps.sort((a, b) => a.number - b.number)

  const process: WorkflowProcess = {
    id: uuidv4(),
    name: processName,
    roleStart,
    roles,
    listGrup: [],
    variables,
    steps,
  }

  return { version: '1.0', process }
}
