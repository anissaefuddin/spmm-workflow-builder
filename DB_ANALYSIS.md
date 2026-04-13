# Workflow Engine Database Analysis & Builder Integration

Complete analysis of the SPMM workflow engine database, mapping 22 relational
tables to the visual workflow builder's UI modules.

**Rule**: All existing tables are READ ONLY from the builder. New data goes to
`wf_builder_draft`. Publishing delegates to the existing `AddWf` service.

---

## 1. Table Analysis & Domain Grouping

### Domain 1 — Workflow Definition (the blueprint)

| Table | PK | Purpose |
|-------|-----|---------|
| `wf_process_definition` | `definition_id` (UUID) | Master XML definition. One row per published workflow version. Fields: `name`, `version`, `xml_definition`, `created_at`, `updated_at`. |
| `wf_process_definition_map` | `id` (UUID) | Links roles to definitions. Fields: `role_id`, `definition_id`, `created_at`. Determines which roles can participate in which workflow. |
| `wf_builder_draft` | `draft_id` (UUID) | Builder-only drafts. Fields: `name`, `json_dsl` (TEXT), `xml_definition` (TEXT), `published_definition_id` (nullable UUID → wf_process_definition), `status` (DRAFT/PUBLISHED/ARCHIVED), `created_by`, timestamps. |

**Key insight**: `wf_process_definition.xml_definition` is the canonical source of truth.
The builder parses this XML into a JSON DSL, lets users edit it, then regenerates the
XML for publishing. `wf_builder_draft` stores the in-progress JSON DSL.

---

### Domain 2 — Runtime Process (live instances)

| Table | PK | Purpose |
|-------|-----|---------|
| `wf_process` | `process_id` (String) | A running workflow instance. Fields: `definition_id`, `No_Tiket` (ticket number), `Dibuat_Oleh` (creator), `Status_Pengajuan` (display status), `Catatan_Terakhir` (last note), `status` (0=active, 1=completed, 2=cancelled), `Tanggal_Pengajuan`, `Aktifitas_Terakhir`, `satuan_pendidikan`, timestamps. |
| `wf_ticketprocess` | `id` (Long, auto) | Ticket-to-process ID mapping. Fields: `process_id`. Sequence generator for ticket numbering. |

**Key insight**: `wf_process.definition_id` links a running instance back to its
definition. The monitoring tab reads from this table.

---

### Domain 3 — Task Execution (step-level runtime)

| Table | PK | Purpose |
|-------|-----|---------|
| `wf_task` | `task_id` (String) | Individual step execution within a process. Fields: `process_id`, `step` (step number), `step_real`, `judul_task` (title), `name`, `assignee` (role), `claim_by` (user), `status` (1=active), `status_tampil` (display status), `form_data_input` (JSON), `form_data_view` (JSON), `catatan` (notes), `lembaga`, `grup`, transition targets (`next_step_yes/no/rollback`), log messages (`logstart/logtrue/logfalse/logsave`), `status_tiket`, `filter_tiket`, `grup_skip`, `grup_skip_check`, `view_acces_role`, timestamps. |
| `wf_task_log` | `id` (UUID) | Audit trail for task actions. Fields: `no_tiket`, `task_id`, `username`, `username_id`, `role`, `role_id`, `notes`, `task_judul`, `decision` (true/false/save), `occurred_at`. |
| `wf_task_notif` | `id` (UUID) | Notifications generated per task. Fields: `no_tiket`, `task_id`, `username`, `role_code`, `role_id`, `workflow_judul`, `task_judul`, `task_pesan` (message body), `occurred_at`. |

**Key insight**: `wf_task.form_data_input` and `wf_task.form_data_view` are JSON strings
that mirror the step's `<form_data_input>` and `<form_data_view>` XML elements. The task
is a runtime copy of the step definition, enriched with the assigned user and actual data.

---

### Domain 4 — Variable System

| Table | PK | Purpose |
|-------|-----|---------|
| `wf_process_variable` | `variable_id` (String) | Runtime variable values for a process instance. Fields: `process_id`, `variable_name`, `variable_value1`, `variable_value2`, `variable_type` (vtype), `link` (file path), `required`, `label` (boolean), `read_only` (boolean), timestamps. |
| `wf_custom_variabel` | `id` (UUID) | Schema definition for custom/dynamic variable types. Fields: `class_object` (type name, e.g. `angket_asesment mahad'ali_SKL`), `class_variabel` (field name), `class_variabel_type` (data type), `class_variabel_default`, `class_variabel_table` (source table), `class_variabel_table_name` (source column), `class_variabel_table_checknull`, `opsi` (dropdown options), `read_only`, `child_grup` (L3 grouping), `after_child`, `section_level`. |

**Key insight**: `wf_custom_variabel` IS the schema source for custom variable types.
Each row defines one field within a custom type. Rows sharing the same `class_object`
form the complete field list for that type. This is what the Custom Type Inspector
should fetch.

**Variable lifecycle**:
1. XML defines variable names + types in `<variabel>` elements
2. When a process starts, each variable becomes a `wf_process_variable` row
3. `variable_value1` / `variable_value2` hold runtime data
4. Custom types use `wf_custom_variabel` to define field structure

---

### Domain 5 — Form System (dynamic data entry)

| Table | PK | Access | Purpose |
|-------|-----|--------|---------|
| `wf_data_form_level1` | composite | JdbcTemplate | Top-level form data. Schema defined dynamically via `wf_custom_variabel`. |
| `wf_data_form_level2` | composite | JdbcTemplate | Second-level detail rows (e.g. line items within a section). |
| `wf_data_form_level3` | composite | JdbcTemplate | Third-level detail rows (e.g. criteria within a line item). |
| `wf_data_form_list` | composite | JdbcTemplate | Flat list-type form data (alternative to hierarchical levels). |
| `wf_data_form_summary` | `(no_tiket, no_grup, grup)` | JPA | Aggregated scores: `total_bobot`, `total_skor_tertimbang`. |
| `wf_data_form_summary_lv2` | `(no_tiket, no_grup)` | JPA | Level-2 score aggregation: `total_skor_tertimbang`. |

**Key insight**: Form tables have NO fixed JPA entities. Their columns are defined
at runtime by `wf_custom_variabel` rows. The services `GetFormDynamic` and
`SetFormDynamic` build SQL dynamically based on the `class_object` configuration.
This is a "schema-on-read" pattern.

---

### Domain 6 — Assessment System

| Table | PK | Access | Purpose |
|-------|-----|--------|---------|
| `wf_asesment_form` | — | Raw SQL | Assessment form definitions (template). |
| `wf_asesment_form_kriteria` | — | Raw SQL | Criteria within an assessment form. |
| `wf_asesment_form_data` | — | Raw SQL | Submitted assessment data per ticket. |
| `wf_asesment_form_data_kriteria` | — | Raw SQL | Submitted criteria scores per ticket. |

**Key insight**: These are accessed only via raw SQL (no JPA entities). They support
the scoring/evaluation workflow (`KalkulasiNilaiForm` service). The builder does not
need to manage these directly — they are populated by the runtime engine.

---

### Domain 7 — Decision Engine

| Table | PK | Purpose |
|-------|-----|---------|
| `wf_decision` | `decision_id` (String) | Records decisions made on tasks. Fields: `task_id`, `decision_key` (JSON), `decision_result` (true/false/save), `taken_at`. |
| `wf_button_map` | `id` (Integer, auto) | Configures action buttons per role+definition. Fields: `role_id`, `role_code`, `definition_id`, `button_label`, `button_url`, `step_condition`, `step_inquiry`, `created_at`. |

**Key insight**: `wf_decision` is runtime (records what happened). `wf_button_map`
is configuration (controls what buttons appear). The builder should manage
`wf_button_map` to let users configure action buttons per role.

---

### Domain 8 — Access Control

| Table | PK | Purpose |
|-------|-----|---------|
| `wf_role_matrix` | `id` (Long, auto) | Role configuration per definition. Fields: `role_code`, `definition_id`, `hide_draft` (boolean), `require_claim_by` (boolean), `lembaga_required` (boolean), `title`, `created_at`. |
| `wf_process_grup` | `id` (String) | Group progress tracking per ticket. Fields: `No_Tiket`, `urutan` (sequence), `grup` (group name), `status` (boolean — completed?), `last_update`. |
| `wf_process_definition_map` | `id` (UUID) | Role ↔ definition mapping (covered in Domain 1). |

**Key insight**: `wf_role_matrix` holds per-role behavior flags. When the builder
publishes a workflow, it should also sync role matrix entries. `wf_process_grup`
tracks which section/group a specific ticket has reached — purely runtime.

---

### Domain 9 — Logging & Audit

| Table | PK | Purpose |
|-------|-----|---------|
| `wf_event_log` | `id` (String) | General event log. Fields: `username`, `process_instance_id`, `task_id`, `event_type`, `event_data` (JSON), `occurred_at`. |
| `wf_task_log` | `id` (UUID) | Task-specific decision log (covered in Domain 3). |

---

## 2. Relationship Map

```
wf_process_definition (blueprint)
  │
  ├──< wf_process_definition_map (role ↔ definition)
  │       └── role_id, definition_id
  │
  ├──< wf_role_matrix (role behavior config)
  │       └── role_code, definition_id
  │
  ├──< wf_button_map (action buttons config)
  │       └── role_id, role_code, definition_id
  │
  ├──< wf_builder_draft (builder drafts)
  │       └── published_definition_id → definition_id
  │
  └──< wf_process (running instances)
          │   └── definition_id → definition_id
          │
          ├──< wf_process_variable (runtime variable values)
          │       └── process_id → process_id
          │
          ├──< wf_process_grup (group progress per ticket)
          │       └── No_Tiket → No_Tiket
          │
          ├──< wf_task (step execution)
          │       │   └── process_id → process_id
          │       │
          │       ├──< wf_decision (decisions recorded)
          │       │       └── task_id → task_id
          │       │
          │       ├──< wf_task_log (decision audit trail)
          │       │       └── task_id → task_id, no_tiket
          │       │
          │       └──< wf_task_notif (notifications)
          │               └── task_id → task_id, no_tiket
          │
          ├──< wf_event_log (events)
          │       └── process_instance_id → process_id
          │
          ├──< wf_ticketprocess (ticket sequence)
          │       └── process_id → process_id
          │
          └──< wf_data_form_* (dynamic form data)
                  └── no_tiket → No_Tiket

wf_custom_variabel (schema registry — standalone)
  └── class_object groups fields for a custom variable type
      └── class_variabel_table points to wf_data_form_level1/2/3/list
```

### Foreign Key Summary

| Source | Column | Target | Column |
|--------|--------|--------|--------|
| `wf_process` | `definition_id` | `wf_process_definition` | `definition_id` |
| `wf_process_definition_map` | `definition_id` | `wf_process_definition` | `definition_id` |
| `wf_role_matrix` | `definition_id` | `wf_process_definition` | `definition_id` |
| `wf_button_map` | `definition_id` | `wf_process_definition` | `definition_id` |
| `wf_builder_draft` | `published_definition_id` | `wf_process_definition` | `definition_id` |
| `wf_task` | `process_id` | `wf_process` | `process_id` |
| `wf_decision` | `task_id` | `wf_task` | `task_id` |
| `wf_task_log` | `task_id` | `wf_task` | `task_id` |
| `wf_task_notif` | `task_id` | `wf_task` | `task_id` |
| `wf_event_log` | `process_instance_id` | `wf_process` | `process_id` |
| `wf_ticketprocess` | `process_id` | `wf_process` | `process_id` |
| `wf_process_variable` | `process_id` | `wf_process` | `process_id` |
| `wf_process_grup` | `No_Tiket` | `wf_process` | `No_Tiket` |
| `wf_custom_variabel` | `class_variabel_table` | `wf_data_form_level1/2/3/list` | (table name) |

---

## 3. Database → Builder Feature Mapping

### A. Canvas (Workflow Graph)

**Source tables**: `wf_process_definition`

**Current flow**: XML → `parseXmlToJson()` → JSON DSL → ReactFlow nodes/edges

**How it works**: The XML `<step>` elements define nodes. The `<steptrue>`,
`<stepfalse>`, `<steprollback>` elements define edges. The graph adapter
(`graph-adapter.ts`) converts these to dagre-layout positions.

**No additional tables needed** — the canvas is fully driven by the XML/DSL.

---

### B. Step Configuration Panel (Sidebar)

**Source tables**: `wf_process_definition` (via DSL)

**Runtime reference**: `wf_task` (mirrors step config at execution time)

**Mapping**:

| DSL Field | XML Element | Task Column | Panel Section |
|-----------|-------------|-------------|---------------|
| `step.number` | `<number>` | `step` | Identity |
| `step.type` | `<type>` | — | Identity |
| `step.role` | `<role>` | `assignee` | StepMetaFields |
| `step.title` | `<title>` | `judul_task` | StepMetaFields |
| `step.status` | `<status>` | `status_tampil` | StepMetaFields |
| `step.grup` | `<grup>` | `grup` | StepMetaFields |
| `step.statustiket` | `<statustiket>` | `status_tiket` | StepMetaFields |
| `step.logstart` | `<logstart>` | `logstart` | Notifications |
| `step.logtrue` | `<logtrue>` | `logtrue` | Notifications |
| `step.logfalse` | `<logfalse>` | `logfalse` | Notifications |
| `step.logsave` | `<logsave>` | `logsave` | Notifications |
| `step.formDataInput` | `<form_data_input>` | `form_data_input` | FieldListBuilder |
| `step.formDataView` | `<form_data_view>` | `form_data_view` | FieldListBuilder |
| `step.decisionKey` | `<decision_key>` | — | DecisionKeyEditor |
| `step.transitions.*` | `<steptrue/false/rollback>` | `next_step_yes/no/rollback` | TransitionEditor |

---

### C. Variable Panel

**Source tables**: `wf_process_definition` (variable definitions in XML) +
`wf_custom_variabel` (schema for custom types)

**Runtime**: `wf_process_variable` (holds runtime values per instance)

**Mapping**:

| XML `<variabel>` | `wf_process_variable` | Builder UI |
|-------------------|-----------------------|------------|
| `<name>` | `variable_name` | VariableEditor: name |
| `<value1>` | `variable_value1` | VariableEditor: default value |
| `<value2>` | `variable_value2` | VariableEditor: options (for Option type) |
| `<vtype>` | `variable_type` | VariableEditor: type select |
| `<required>` | `required` | VariableEditor: checkbox |
| `<linkfile>` | `link` | VariableEditor: file template |

**Custom type schema**:

| `wf_custom_variabel` Column | Builder UI |
|------------------------------|------------|
| `class_object` | CustomTypeInspector: type name |
| `class_variabel` | CustomTypeInspector: field name |
| `class_variabel_type` | CustomTypeInspector: field type badge |
| `class_variabel_default` | CustomTypeInspector: default value |
| `opsi` | CustomTypeInspector: dropdown options |
| `read_only` | CustomTypeInspector: read-only badge |
| `section_level` | CustomTypeInspector: hierarchy indicator |

---

### D. Role & Access Configuration

**Source tables**: `wf_role_matrix`, `wf_process_definition_map`

**Mapping**:

| Table | Column | Proposed UI |
|-------|--------|-------------|
| `wf_role_matrix.role_code` | Role identifier | Role list in process panel |
| `wf_role_matrix.hide_draft` | Hide draft tickets from this role | Checkbox in role config |
| `wf_role_matrix.require_claim_by` | Require user to claim task before acting | Checkbox in role config |
| `wf_role_matrix.lembaga_required` | Filter by institution | Checkbox in role config |
| `wf_role_matrix.title` | Display title override | Text input in role config |
| `wf_process_definition_map.role_id` | UUID of the role record | Auto-generated on publish |

---

### E. Button Map Configuration

**Source table**: `wf_button_map`

**Mapping**:

| Column | Proposed UI |
|--------|-------------|
| `role_code` | Dropdown: which role sees this button |
| `button_label` | Text input: button text (e.g. "Approve") |
| `button_url` | Text input: action endpoint or route |
| `step_condition` | Text input: step number condition (when to show) |
| `step_inquiry` | Text input: inquiry step reference |

---

### F. Monitoring Tab

**Source tables**: `wf_process`, `wf_task`, `wf_process_variable`,
`wf_task_log`, `wf_event_log`

**Current mapping** (already implemented):

| API Response Field | Source Table | Source Column |
|--------------------|-------------|---------------|
| `noTiket` | `wf_process` | `No_Tiket` |
| `status` | `wf_process` | `Status_Pengajuan` |
| `dibuatOleh` | `wf_process` | `Dibuat_Oleh` |
| `activeStepNumber` | `wf_task` (status=1) | `step` |
| `activeStepTitle` | `wf_task` (status=1) | `judul_task` |
| `activeStepRole` | `wf_task` (status=1) | `assignee` |
| `variables[]` | `wf_process_variable` | `variable_name/value1/value2/type` |
| `history[]` | `wf_task` (all) | `task_id, step, judul_task, status, claim_by, catatan` |

---

## 4. Adapter Layer Architecture

### Current State (already implemented)

```
┌──────────────────────────────────────────────────────────┐
│  WorkflowBuilderService (Java)                           │
│                                                          │
│  ┌─────────────────┐   ┌─────────────────────────────┐   │
│  │ XML Adapter      │   │ Monitor Adapter (READ ONLY) │   │
│  │ parseXmlToJson() │   │ monitorInstance()            │   │
│  │ generateXml()    │   │ listTickets()                │   │
│  └────────┬────────┘   │ updateTicketStatus()         │   │
│           │             └──────────┬──────────────────┘   │
│  ┌────────▼────────┐              │                       │
│  │ Draft Adapter    │   ┌─────────▼──────────────────┐   │
│  │ saveDraft()      │   │ Reads from:                 │   │
│  │ getDraftById()   │   │  ProcessInstancerepo        │   │
│  │ listDrafts()     │   │  ProcessVariablerepo        │   │
│  └────────┬────────┘   │  Taskrepo                    │   │
│           │             └─────────────────────────────┘   │
│  ┌────────▼────────┐                                      │
│  │ Publish Adapter  │                                      │
│  │ → AddWf service  │                                      │
│  └─────────────────┘                                      │
└──────────────────────────────────────────────────────────┘
```

### Proposed Extensions

```
WorkflowBuilderService (extend, do NOT modify existing methods)
│
├── VariableSchemaAdapter (NEW)
│   ├── getVariableSchema(vtype: String)
│   │   → queries wf_custom_variabel WHERE class_object = vtype
│   │   → returns List<VariableSchemaField>
│   │
│   └── listCustomTypes()
│       → SELECT DISTINCT class_object FROM wf_custom_variabel
│       → returns List<String>
│
├── RoleConfigAdapter (NEW)
│   ├── getRoleMatrix(definitionId: UUID)
│   │   → queries wf_role_matrix WHERE definition_id = definitionId
│   │   → returns List<RoleMatrixEntry>
│   │
│   ├── saveRoleMatrix(definitionId, entries)
│   │   → upserts wf_role_matrix rows
│   │
│   └── getDefinitionRoleMap(definitionId: UUID)
│       → queries wf_process_definition_map
│       → returns List<RoleMapping>
│
├── ButtonMapAdapter (NEW)
│   ├── getButtonMap(definitionId: UUID)
│   │   → queries wf_button_map WHERE definition_id = definitionId
│   │   → returns List<ButtonMapEntry>
│   │
│   └── saveButtonMap(definitionId, entries)
│       → upserts wf_button_map rows
│
└── FormSchemaAdapter (NEW)
    └── getFormSchema(classObject: String)
        → queries wf_custom_variabel WHERE class_object = classObject
        → returns hierarchical form structure
        → groups by section_level, child_grup
```

### Sample API Endpoints (proposed)

```
# Variable schema
GET  /api/workflow-builder/variable-schema/{vtype}
GET  /api/workflow-builder/custom-types

# Role configuration
GET  /api/workflow-builder/roles/{definitionId}
POST /api/workflow-builder/roles/{definitionId}

# Button map
GET  /api/workflow-builder/buttons/{definitionId}
POST /api/workflow-builder/buttons/{definitionId}

# Form schema
GET  /api/workflow-builder/form-schema/{classObject}
```

---

## 5. Unified Builder Data Model

### Current DSL (already working)

```typescript
interface WorkflowDSL {
  version: '1.0'
  process: {
    id: string
    name: string
    roleStart?: string
    roles: { name: string }[]
    listGrup: { id: string; label: string }[]
    variables: WorkflowVariable[]
    steps: WorkflowStep[]
  }
}
```

### Extended DSL (proposed — additive, backward compatible)

```typescript
interface WorkflowDSL {
  version: '1.0'
  process: {
    id: string
    name: string
    roleStart?: string
    roles: WorkflowRole[]        // extended with config
    listGrup: ListGrup[]
    variables: WorkflowVariable[]
    steps: WorkflowStep[]

    // ─── NEW: optional enrichment from DB ────────────────
    roleConfig?: RoleConfig[]    // from wf_role_matrix
    buttonMap?: ButtonMapEntry[] // from wf_button_map
    customTypes?: CustomTypeSchema[]  // from wf_custom_variabel
  }
}

// Role with matrix config
interface RoleConfig {
  roleCode: string
  definitionId?: string
  hideDraft: boolean
  requireClaimBy: boolean
  lembagaRequired: boolean
  title?: string
}

// Button configuration
interface ButtonMapEntry {
  roleCode: string
  buttonLabel: string
  buttonUrl: string
  stepCondition?: string
  stepInquiry?: string
}

// Custom variable type schema (from wf_custom_variabel)
interface CustomTypeSchema {
  classObject: string           // type name
  fields: CustomTypeField[]
}

interface CustomTypeField {
  name: string                  // class_variabel
  type: string                  // class_variabel_type
  defaultValue?: string         // class_variabel_default
  sourceTable?: string          // class_variabel_table
  sourceColumn?: string         // class_variabel_table_name
  checkNull?: boolean           // class_variabel_table_checknull
  options?: string              // opsi
  readOnly?: boolean            // read_only
  childGroup?: string           // child_grup
  afterChild?: boolean          // after_child
  sectionLevel?: number         // section_level
}
```

### Compatibility Rules

1. The `roleConfig`, `buttonMap`, and `customTypes` fields are OPTIONAL.
   If absent, the builder works exactly as before (XML-only mode).

2. These fields are NOT serialized to XML. They are stored alongside the
   DSL in `wf_builder_draft.json_dsl` for the builder's use, and synced
   to their respective tables only on publish.

3. The XML generator (`generateXmlFromJson`) ignores these fields — it
   only reads `roles`, `variables`, `steps`, `listGrup`, `roleStart`.

---

## 6. Editing Strategy — Safe Write Path

```
User edits in Builder UI
        │
        ▼
  ┌────────────────────┐
  │ Update JSON DSL    │  (in-memory, Zustand store)
  │ in browser state   │
  └────────┬───────────┘
           │
     ┌─────▼──────┐
     │ Save Draft  │  POST /api/workflow-builder/save
     └─────┬──────┘
           │
  ┌────────▼───────────┐
  │ wf_builder_draft    │  JSON DSL + auto-generated XML
  │ status = DRAFT      │  NO changes to any other table
  └────────┬───────────┘
           │
     ┌─────▼──────┐
     │  Publish?   │  User clicks "Publish" explicitly
     └─────┬──────┘
           │ YES
  ┌────────▼───────────────────────────┐
  │ WorkflowBuilderService.saveDraft() │
  │ with publish=true                  │
  │                                    │
  │ 1. Generate XML from JSON DSL      │
  │ 2. Delegate to AddWf.addWf()      │
  │    → INSERT wf_process_definition  │
  │    → INSERT wf_process_def_map     │
  │ 3. Store definition_id in draft    │
  │ 4. Sync wf_role_matrix (proposed)  │
  │ 5. Sync wf_button_map (proposed)   │
  └────────────────────────────────────┘
```

### What changes, what doesn't

| Action | Tables Written | Tables Read |
|--------|---------------|-------------|
| Load workflow | — | `wf_process_definition` |
| Edit in canvas | — | — (local state only) |
| Save draft | `wf_builder_draft` | — |
| Publish | `wf_process_definition`, `wf_process_definition_map` | — |
| Monitor ticket | — | `wf_process`, `wf_task`, `wf_process_variable` |
| Update ticket status | `wf_process` (Status_Pengajuan only) | — |

---

## 7. Variable Configuration System

### Current Variable Lifecycle

```
XML <variabel> definition          wf_process_variable (runtime)
┌──────────────────────┐          ┌──────────────────────────┐
│ name: "Assesor_1"    │──start──▶│ variable_name: "Assesor_1"│
│ vtype: "Option"      │ process  │ variable_type: "Option"   │
│ value1: ""           │          │ variable_value1: "Dr.Amin" │
│ value2: ""           │          │ variable_value2: ""         │
│ required: true       │          │ required: "true"            │
└──────────────────────┘          └──────────────────────────┘
```

### Custom Type Resolution

```
XML <variabel>                     wf_custom_variabel (schema)
┌──────────────────────────┐      ┌─────────────────────────────────┐
│ name: "Penilaian_SKL_1"  │      │ class_object: "angket_asesment  │
│ vtype: "angket_asesment  │──▶   │              mahad'ali_SKL"     │
│        mahad'ali_SKL"    │      │                                 │
└──────────────────────────┘      │ Row 1: class_variabel="skor"    │
                                  │        class_variabel_type="int" │
  API: GET /variable-schema/      │ Row 2: class_variabel="catatan" │
       angket_asesment...         │        class_variabel_type="str" │
                                  │ Row 3: class_variabel="file"    │
  Returns field list ◄────────────│        class_variabel_type="file"│
                                  └─────────────────────────────────┘
```

### Proposed Variable Explorer UI

```
Variables Tab
├── Standard variables (String, Number, Date, Option, file)
│   └── [existing VariableEditor UI — already complete]
│
└── Custom-type variables (vtype not in standard list)
    ├── Variable name + custom type badge (◈)
    ├── Default Value (JSON textarea)
    └── ▸ Custom Type Structure [collapsible]
        ├── Type ID: "angket_asesment mahad'ali_SKL"
        ├── Fields (from wf_custom_variabel):
        │   ├── skor        [Number]
        │   ├── catatan     [String]
        │   └── file_bukti  [file]
        └── ↓ Load from backend [button]
```

### Usage Tracker (proposed)

For each variable, show which steps reference it:

```
Variable: "Nomor_Surat_Permohonan"
Used in:
  ├── Step #0 (form) — form_data_input
  ├── Step #3 (decision_user) — viewFields
  └── Step #7 (form) — form_data_view
```

Implementation: scan all `step.formDataInput`, `step.formDataView`,
`step.formFields`, `step.viewFields` in the DSL for the variable name.
Pure frontend — no API call needed.

---

## 8. Form Configuration System

### Architecture

The form system uses a 3-level hierarchy with dynamic schema:

```
wf_custom_variabel (schema registry)
  │
  │ class_object = "angket_asesment mahad'ali_SKL"
  │ Defines columns for each level table
  │
  ├── wf_data_form_level1 (top-level sections)
  │   │ Columns defined by wf_custom_variabel rows
  │   │ where section_level = 1
  │   │
  │   ├── wf_data_form_level2 (sub-items)
  │   │   │ Columns defined by wf_custom_variabel rows
  │   │   │ where section_level = 2
  │   │   │
  │   │   └── wf_data_form_level3 (detail criteria)
  │   │       Columns defined by wf_custom_variabel rows
  │   │       where section_level = 3 or child_grup set
  │   │
  │   └── wf_data_form_list (flat list items)
  │       Alternative to hierarchical levels
  │
  └── wf_data_form_summary / summary_lv2
      Aggregated scores (read-only views)
```

### Proposed Form Schema API

```
GET /api/workflow-builder/form-schema/angket_asesment%20mahad'ali_SKL

Response:
{
  "classObject": "angket_asesment mahad'ali_SKL",
  "sections": [
    {
      "level": 1,
      "fields": [
        { "name": "skor", "type": "integer", "readOnly": false },
        { "name": "catatan", "type": "string", "readOnly": false }
      ]
    },
    {
      "level": 2,
      "fields": [...]
    },
    {
      "level": 3,
      "childGroup": "kriteria",
      "fields": [...]
    }
  ]
}
```

### Builder Integration

The builder does NOT create or modify form schemas. It only:
1. References existing custom types by name in variable definitions
2. Displays the schema structure for understanding
3. Shows which variables use which form schema

Form schema creation/modification remains outside the builder scope
(managed by the existing backend admin tools).

---

## 9. Decision Engine UI

### Decision Data Flow

```
XML Definition (design-time)         Runtime (execution-time)
┌─────────────────────────────┐     ┌──────────────────────────┐
│ <step>                      │     │ wf_task                  │
│   <type>decision_user</type>│     │   form_data_view = JSON  │
│   <decision_key>            │     │   assignee = role        │
│     {"rule":"Approve?",     │     │                          │
│      "true":"Lanjutkan",    │     │ wf_decision              │
│      "false":"Tolak"}       │     │   decision_key = "true"  │
│   </decision_key>           │     │   decision_result = JSON │
│   <steptrue>5</steptrue>    │     │   taken_at = timestamp   │
│   <stepfalse>3</stepfalse>  │     │                          │
│ </step>                     │     │ wf_button_map            │
│                             │     │   button_label = "Setuju"│
│ <step>                      │     │   button_url = "/approve"│
│   <type>decision_sistem</type>    │   step_condition = "4"   │
│   <variabela>total</variabela>    └──────────────────────────┘
│   <operator>></operator>    │
│   <variabelb>100</variabelb>│
│ </step>                     │
└─────────────────────────────┘
```

### Decision Builder UI (already exists)

For `decision_user` steps:
- **DecisionKeyEditor** — configures button labels (true/false/save)
- **TransitionEditor** — configures where each path goes

For `decision_sistem` steps:
- **DecisionBuilder** — configures condition (variableA, operator, variableB)
- **TransitionEditor** — configures true/false paths

### Proposed: Button Map Editor (new)

For `wf_button_map`, add a "Button Configuration" tab to the step panel
when a `decision_user` step is selected:

```
Button Configuration (per role)
┌─────────────────────────────────────────────┐
│ Role: [MA ▼]                                │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ ✓ Approve  │ Label: [Lanjutkan    ]    │ │
│ │            │ URL:   [/api/approve  ]    │ │
│ │            │ Show at step: [4      ]    │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ ✗ Reject   │ Label: [Tolak        ]    │ │
│ │            │ URL:   [/api/reject   ]    │ │
│ │            │ Show at step: [4      ]    │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [+ Add Button]                              │
└─────────────────────────────────────────────┘
```

---

## 10. Summary: What Exists vs. What's Proposed

### Already Implemented (current builder)

| Feature | Tables Used | UI Component |
|---------|------------|--------------|
| Canvas graph | `wf_process_definition` (XML) | WorkflowCanvas + dagre |
| Step editing | DSL in memory | FormStepPanel, DecisionUserPanel, etc. |
| Variable editing | DSL in memory | FormBuilder + VariableEditor |
| Save/load drafts | `wf_builder_draft` | Toolbar + DashboardPage |
| Publish | `wf_process_definition` via AddWf | Toolbar (Save+Publish) |
| Monitor tickets | `wf_process`, `wf_task`, `wf_process_variable` | MonitoringPage |
| Custom type inspector | (frontend inference only) | CustomTypeInspector |

### Proposed New Features

| Feature | Tables Needed | API Endpoint | UI Component |
|---------|--------------|--------------|--------------|
| Variable schema from DB | `wf_custom_variabel` | `GET /variable-schema/{type}` | CustomTypeInspector (enhance) |
| Custom type listing | `wf_custom_variabel` | `GET /custom-types` | FormBuilder type dropdown |
| Role matrix config | `wf_role_matrix` | `GET/POST /roles/{defId}` | RoleConfigPanel (new) |
| Button map config | `wf_button_map` | `GET/POST /buttons/{defId}` | ButtonMapEditor (new) |
| Form schema viewer | `wf_custom_variabel` | `GET /form-schema/{type}` | FormSchemaViewer (new) |
| Variable usage tracker | (frontend scan of DSL) | none | VariableEditor (enhance) |

### Implementation Priority

```
Priority 1 (HIGH — immediate value)
├── Variable schema API (/variable-schema/{type})
│   └── Already have frontend UI (CustomTypeInspector)
│   └── Need: 1 new endpoint + 1 DB query
│
└── Variable usage tracker
    └── Pure frontend — scan DSL for variable references
    └── Need: 0 API changes

Priority 2 (MEDIUM — configuration capability)
├── Role matrix editor
│   └── Need: 2 endpoints + 1 new UI panel
│
└── Button map editor
    └── Need: 2 endpoints + 1 new UI component

Priority 3 (LOW — advanced)
├── Form schema viewer
│   └── Need: 1 endpoint + 1 new UI component
│
└── Custom type listing in variable type dropdown
    └── Need: 1 endpoint + minor UI change
```
