// ============================================================
// XML Generator — converts JSON DSL back to XML Process_Definition
// Produces XML 100% compatible with the existing backend parser
// ============================================================
import type {
  WorkflowDSL,
  WorkflowStep,
  FormStep,
  DecisionUserStep,
  DecisionSistemStep,
} from '../types/workflow'

function indent(n: number): string {
  return '\t'.repeat(n)
}

function tag(name: string, value: string, depth = 1): string {
  return `${indent(depth)}<${name}>${value}</${name}>`
}

function generateRoles(dsl: WorkflowDSL): string[] {
  const lines: string[] = []
  const { process } = dsl

  if (process.roleStart) {
    lines.push(tag('rolestart', process.roleStart))
    lines.push('')
  }

  for (const role of process.roles) {
    lines.push(`${indent(1)}<role>`)
    lines.push(tag('value', role.name, 2))
    lines.push(`${indent(1)}</role>`)
  }

  return lines
}

function generateVariables(dsl: WorkflowDSL): string[] {
  const lines: string[] = []
  for (const v of dsl.process.variables) {
    lines.push(`${indent(1)}<variabel>`)
    lines.push(tag('name', v.name, 2))
    lines.push(tag('value', v.value1 ?? v.defaultValue ?? '', 2))
    lines.push(`${indent(1)}</variabel>`)
  }
  return lines
}

function formDataToJson(step: FormStep): string {
  const obj: Record<string, string> = {}
  if (step.tahap !== undefined) obj['tahap'] = step.tahap
  for (const key of step.formFields) {
    obj[key] = step.formData[key] ?? ''
  }
  return JSON.stringify(obj)
}

function decisionKeyToJson(step: DecisionUserStep): string {
  const obj: Record<string, string> = {}
  obj['rule'] = step.rule
  for (const key of step.viewFields) {
    obj[key] = step.decisionKey[key] ?? ''
  }
  return JSON.stringify(obj)
}

function generateStep(step: WorkflowStep): string[] {
  const lines: string[] = []
  lines.push(`${indent(1)}<step>`)
  lines.push(tag('number', String(step.number), 2))

  // role — handle both direct text and <role><value> style
  // We use the simpler direct-text style for generated XML
  if (step.role) {
    lines.push(`${indent(2)}<role>`)
    lines.push(tag('value', step.role, 3))
    lines.push(`${indent(2)}</role>`)
  }

  lines.push(tag('type', step.type, 2))

  if (step.type === 'form') {
    const formStep = step as FormStep
    lines.push(tag('form_data', formDataToJson(formStep), 2))
  }

  if (step.type === 'decision_user') {
    const dStep = step as DecisionUserStep
    lines.push(tag('decision_key', decisionKeyToJson(dStep), 2))
  }

  if (step.type === 'decision_sistem') {
    const sStep = step as DecisionSistemStep
    lines.push(tag('variabela', sStep.condition.variableA, 2))
    lines.push(tag('operator', sStep.condition.operator, 2))
    lines.push(tag('variabelb', sStep.condition.variableB, 2))
  }

  const { transitions } = step
  if (transitions.true !== undefined) lines.push(tag('steptrue', String(transitions.true), 2))
  if (transitions.false !== undefined) lines.push(tag('stepfalse', String(transitions.false), 2))
  if (transitions.rollback !== undefined) lines.push(tag('steprollback', String(transitions.rollback), 2))

  lines.push(`${indent(1)}</step>`)
  return lines
}

export function generateXmlFromWorkflow(dsl: WorkflowDSL): string {
  const lines: string[] = []
  lines.push('<Process_Definition>')

  // Roles section
  const roleLines = generateRoles(dsl)
  if (roleLines.length > 0) {
    lines.push(...roleLines)
    lines.push('')
  }

  // Variables section
  const varLines = generateVariables(dsl)
  if (varLines.length > 0) {
    lines.push(...varLines)
    lines.push('')
  }

  // Steps section (sorted by step number)
  const sorted = [...dsl.process.steps].sort((a, b) => a.number - b.number)
  for (const step of sorted) {
    lines.push(...generateStep(step))
    lines.push('')
  }

  lines.push('</Process_Definition>')
  return lines.join('\n')
}
