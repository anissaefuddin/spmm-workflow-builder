// ============================================================
// SPMM Workflow Builder — JSON DSL Type Definitions
// ============================================================
// Full schema derived from real XML files including spme-mahadaly.xml
// The XML is NEVER modified — this is a read/write adapter layer.
// ============================================================

export type StepType =
  | 'form'
  | 'decision_user'
  | 'decision_sistem'
  | 'end'
  | 'system_action' // generic system step (system_update_*, etc.)

export type Operator = '>' | '<' | '>=' | '<=' | '==' | '!=' | '='

// ── Variable Types ───────────────────────────────────────────
// Maps from: <vtype> element inside <variabel>
export type VariableType =
  | 'String'
  | 'Number'
  | 'float'
  | 'Date'
  | 'Option'       // dropdown; options in value2 (pipe-separated: "A|B|C")
  | 'file'         // file upload; template in linkfile
  | string         // custom types (e.g. "angket_asesment mahad'ali_SKL")

// ── List Group ───────────────────────────────────────────────
// Maps from: <listgrup>1|Draft</listgrup>  (id|label format)
export interface ListGrup {
  id: string     // e.g. "1"
  label: string  // e.g. "Draft"
}

// ── Variable ────────────────────────────────────────────────
// Maps from: <variabel> block (full schema)
export interface WorkflowVariable {
  name: string
  // Primary value — maps to <value1> (new) or <value> (legacy)
  value1: string
  // Secondary value — maps to <value2>
  // For Option type: pipe-separated options string ("Ya|Tidak")
  // Always emitted (empty string allowed) for engine compatibility.
  value2?: string
  // Variable type — maps to <vtype>
  vtype: VariableType
  // Required flag — maps to <required> ("true"/"false")
  required?: boolean
  // Position of <required> in output XML (for round-trip fidelity):
  //   'pre'  = before <value1>  (default for Date/String/Number/etc)
  //   'mid'  = between <value1> and <value2>  (e.g. Assesor_1 Option type)
  //   'post' = after <vtype>  (for file/custom types)
  requiredPosition?: 'pre' | 'mid' | 'post'
  // Template file path — maps to <linkfile> (for file-type variables)
  linkfile?: string
  // Label flag — maps to <label> ("true"/"false")
  // For custom-formdata variables to indicate they are label/display fields
  label?: boolean
  // Read-only flag — maps to <readonly> ("true"/"false")
  // For custom-formdata assessor variables that should not be edited downstream
  readonly?: boolean
  // Legacy alias kept for backward compat with earlier DSL snapshots
  defaultValue?: string
}

// ── Role ────────────────────────────────────────────────────
export interface WorkflowRole {
  name: string
}

// ── Transitions ─────────────────────────────────────────────
// Each transition may be:
//   - undefined (no transition)
//   - number (single target, e.g. 12)
//   - number[] (parallel branches, e.g. [12, 13] → "12;13" in XML)
// The engine treats semicolon-separated targets as parallel activation.
export type TransitionTarget = number | number[]
export interface StepTransitions {
  true?: TransitionTarget
  false?: TransitionTarget
  rollback?: TransitionTarget
}

// ── Form Fields ─────────────────────────────────────────────
export type FormFieldMap = Record<string, string>

// ── Decision Key ─────────────────────────────────────────────
// Maps from <decision_key> JSON — both old and new formats
// Old: {"rule": "question?", "fieldA": "", ...}
// New: {"true": "Lanjutkan", "false": "Batalkan", "save": "Simpan"}
export interface DecisionKeyMap {
  rule?: string          // legacy: decision question text
  true?: string          // button label for approve
  false?: string         // button label for reject
  save?: string          // button label for save draft
  [key: string]: string | undefined
}

// ── System Condition (decision_sistem) ──────────────────────
export interface SystemCondition {
  variableA: string
  operator: Operator
  variableB: string
}

// ── Base Step ────────────────────────────────────────────────
interface BaseStep {
  id: string
  number: number
  type: StepType
  role?: string
  transitions: StepTransitions
  // Common step metadata (from spme-mahadaly.xml)
  title?: string         // <title> — undefined=absent, ''=present-but-empty
  grup?: string          // <grup>
  status?: string        // <status>
  statustiket?: string   // <statustiket>
  viewer?: string        // <viewer> — comma-separated roles with view access
  logstart?: string      // <logstart>
  logtrue?: string       // <logtrue>  (not in all XML but present in full schema)
  logfalse?: string      // <logfalse>
  logsave?: string       // <logsave>
  // Round-trip ordering hints (for faithful XML reproduction)
  roleBeforeType?: boolean   // true → emit <role> before <type> (default: false = type first)
  titleBeforeType?: boolean  // true → emit <title> before <type> (e.g. step 44 end step)
  _roleAfterType?: boolean   // true → also emit a second <role> after <type> (quirk in some source XMLs)
  // Original order of status/log fields from source XML.
  // When present, generator emits these fields in this order.
  // e.g. ['logtrue', 'statustiket'] when logtrue precedes statustiket.
  _statusLogOrder?: string[]
}

// ── form step ────────────────────────────────────────────────
export interface FormStep extends BaseStep {
  type: 'form'
  tahap?: string           // legacy: "tahap" key from form_data JSON
  formFields: string[]     // ordered list of input variable names
  formData: FormFieldMap   // legacy: raw <form_data> JSON map
  formDataInput?: FormFieldMap  // <form_data_input> — writable fields
  formDataView?: FormFieldMap   // <form_data_view>  — read-only fields
  decisionKey?: DecisionKeyMap  // <decision_key> on form steps (button config)
  // Raw JSON strings preserved from source XML for faithful round-trip output.
  // When set, the generator uses these verbatim instead of re-serializing the parsed maps.
  _rawFormData?: string
  _rawFormDataInput?: string
  _rawFormDataView?: string
  _rawDecisionKey?: string
  // When true, emit <form_data_input> before <form_data_view> (default: view first)
  _formDataInputFirst?: boolean
}

// ── decision_user step ────────────────────────────────────────
export interface DecisionUserStep extends BaseStep {
  type: 'decision_user'
  rule: string
  viewFields: string[]
  decisionKey: FormFieldMap
  // Raw JSON string preserved for round-trip fidelity
  _rawDecisionKey?: string
}

// ── decision_sistem step ──────────────────────────────────────
export interface DecisionSistemStep extends BaseStep {
  type: 'decision_sistem'
  condition: SystemCondition
}

// ── system_action step ────────────────────────────────────────
// Covers any step type prefixed with "system_" (e.g. system_update_satuan_pendidikan)
export interface SystemActionStep extends BaseStep {
  type: 'system_action'
  // The raw type string from XML (e.g. "system_update_satuan_pendidikan")
  rawType: string
  // Payload variable names (from form_data_input / form_data_view plain strings)
  inputVariable?: string
  viewVariable?: string
}

// ── end step ─────────────────────────────────────────────────
export interface EndStep extends BaseStep {
  type: 'end'
}

export type WorkflowStep =
  | FormStep
  | DecisionUserStep
  | DecisionSistemStep
  | SystemActionStep
  | EndStep

// ── Role Config (from wf_role_matrix) ────────────────────────
export interface RoleConfigEntry {
  roleCode: string
  hideDraft: boolean
  requireClaimBy: boolean
  lembagaRequired: boolean
  title?: string
}

// ── Button Map (from wf_button_map) ──────────────────────────
export interface ButtonMapEntry {
  roleCode: string
  buttonLabel: string
  buttonUrl: string
  stepCondition?: string
  stepInquiry?: string
}

// ── Process (root) ────────────────────────────────────────────
export interface WorkflowProcess {
  id: string
  name: string
  roleStart?: string
  roles: WorkflowRole[]
  listGrup: ListGrup[]          // <listgrup> elements
  variables: WorkflowVariable[]
  steps: WorkflowStep[]

  // ── Optional DB enrichment (NOT serialized to XML) ─────────
  roleConfig?: RoleConfigEntry[]    // from wf_role_matrix
  buttonMap?: ButtonMapEntry[]      // from wf_button_map
}

// ── Root DSL ──────────────────────────────────────────────────
export interface WorkflowDSL {
  version: '1.0'
  process: WorkflowProcess
}

// ── Graph types ───────────────────────────────────────────────
export type EdgeType = 'true' | 'false' | 'rollback'

export interface GraphNode {
  id: string
  stepNumber: number
  type: StepType
  label: string
  role?: string
  data: WorkflowStep
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  edgeType: EdgeType
  label: string
}

export interface WorkflowGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// ── XML → JSON field mapping ──────────────────────────────────
// <Process_Definition>          → WorkflowProcess
// <rolestart>                   → process.roleStart
// <listgrup>N|Label</listgrup>  → process.listGrup[].id / .label
// <role><value>                 → process.roles[].name
// <variabel><name>              → variable.name
// <variabel><value1>            → variable.value1
// <variabel><value>  (legacy)   → variable.value1
// <variabel><value2>            → variable.value2
// <variabel><vtype>             → variable.vtype
// <variabel><required>          → variable.required
// <variabel><linkfile>          → variable.linkfile
// <step><number>                → step.number
// <step><type>                  → step.type  (system_* → 'system_action', rawType=original)
// <step><role>                  → step.role
// <step><title>                 → step.title
// <step><form_data>             → step.formData (legacy)
// <step><form_data_input>       → step.formDataInput
// <step><form_data_view>        → step.formDataView
// <step><decision_key>          → step.decisionKey (form) or step.decisionKey (decision_user)
// <step><variabela>             → step.condition.variableA
// <step><operator>              → step.condition.operator
// <step><variabelb>             → step.condition.variableB
// <step><steptrue>              → step.transitions.true
// <step><stepfalse>             → step.transitions.false
// <step><steprollback>          → step.transitions.rollback
// <step><grup>                  → step.grup
// <step><status>                → step.status
// <step><statustiket>           → step.statustiket
// <step><logstart>              → step.logstart
// <step><logtrue>               → step.logtrue
// <step><logfalse>              → step.logfalse
// <step><logsave>               → step.logsave
