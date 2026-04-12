# XML → JSON DSL Mapping Reference

This document describes the **complete, bidirectional mapping** between the
existing `Process_Definition` XML format (used by `spmm-be`) and the new
JSON DSL used by `spmm-workflow-builder`.

**IMPORTANT**: The XML format is never modified. The JSON DSL is a new abstraction
layer that reads from and writes to XML without touching the backend.

---

## Root Element

| XML | JSON DSL Path | Notes |
|-----|---------------|-------|
| `<Process_Definition>` | `process` | Top-level wrapper |
| `<rolestart>value</rolestart>` | `process.roleStart` | Single text node |

---

## Roles

| XML | JSON DSL Path | Notes |
|-----|---------------|-------|
| `<role><value>X</value></role>` | `process.roles[].name` | Repeated elements |

---

## Variables

| XML | JSON DSL Path | Notes |
|-----|---------------|-------|
| `<variabel>` | `process.variables[]` | Repeated |
| `<variabel><name>x</name>` | `process.variables[].name` | |
| `<variabel><value>y</value>` | `process.variables[].defaultValue` | Can be empty string |

---

## Step (common fields)

| XML | JSON DSL Path | Notes |
|-----|---------------|-------|
| `<step><number>N</number>` | `step.number` | Integer; used as navigation target |
| `<step><type>T</type>` | `step.type` | `form` \| `decision_user` \| `decision_sistem` \| `end` |
| `<step><role><value>R</value></role>` | `step.role` | Optional; some XML uses direct text `<role>R</role>` |
| `<step><steptrue>N</steptrue>` | `step.transitions.true` | Next step on approval/true |
| `<step><stepfalse>N</stepfalse>` | `step.transitions.false` | Next step on reject/false |
| `<step><steprollback>N</steprollback>` | `step.transitions.rollback` | Optional rollback target |

---

## form Step

| XML | JSON DSL Path | Notes |
|-----|---------------|-------|
| `<form_data>{"tahap":"X","field1":"",...}</form_data>` | `step.tahap`, `step.formFields`, `step.formData` | JSON string parsed; `tahap` extracted as stage label; remaining keys → `formFields` array |

### Example

**XML:**
```xml
<step>
  <number>0</number>
  <type>form</type>
  <role>dewan</role>
  <form_data>{"nama_maker":"","tahap":"pengajuan","total_berkas":""}</form_data>
  <steptrue>1</steptrue>
</step>
```

**JSON DSL:**
```json
{
  "number": 0,
  "type": "form",
  "role": "dewan",
  "tahap": "pengajuan",
  "formFields": ["nama_maker", "total_berkas"],
  "formData": { "nama_maker": "", "tahap": "pengajuan", "total_berkas": "" },
  "transitions": { "true": 1 }
}
```

---

## decision_user Step

| XML | JSON DSL Path | Notes |
|-----|---------------|-------|
| `<decision_key>{"rule":"...","field1":"",...}</decision_key>` | `step.rule`, `step.viewFields`, `step.decisionKey` | JSON string parsed; `rule` extracted; remaining keys → `viewFields` |

### Example

**XML:**
```xml
<step>
  <number>4</number>
  <role>dewan</role>
  <type>decision_user</type>
  <decision_key>{"rule":"apakah dokumen layak?","nama_maker":"","total_berkas":""}</decision_key>
  <steptrue>5</steptrue>
  <stepfalse>0</stepfalse>
  <steprollback>1</steprollback>
</step>
```

**JSON DSL:**
```json
{
  "number": 4,
  "type": "decision_user",
  "role": "dewan",
  "rule": "apakah dokumen layak?",
  "viewFields": ["nama_maker", "total_berkas"],
  "decisionKey": { "rule": "apakah dokumen layak?", "nama_maker": "", "total_berkas": "" },
  "transitions": { "true": 5, "false": 0, "rollback": 1 }
}
```

---

## decision_sistem Step

| XML | JSON DSL Path | Notes |
|-----|---------------|-------|
| `<variabela>X</variabela>` | `step.condition.variableA` | Left operand |
| `<operator>></operator>` | `step.condition.operator` | Comparison: `>`, `<`, `>=`, `<=`, `==`, `!=` |
| `<variabelb>Y</variabelb>` | `step.condition.variableB` | Right operand |

### Example

**XML:**
```xml
<step>
  <number>3</number>
  <type>decision_sistem</type>
  <variabela>total</variabela>
  <operator>></operator>
  <variabelb>batas1</variabelb>
  <steptrue>4</steptrue>
  <stepfalse>5</stepfalse>
</step>
```

**JSON DSL:**
```json
{
  "number": 3,
  "type": "decision_sistem",
  "condition": {
    "variableA": "total",
    "operator": ">",
    "variableB": "batas1"
  },
  "transitions": { "true": 4, "false": 5 }
}
```

---

## end Step

| XML | JSON DSL Path | Notes |
|-----|---------------|-------|
| `<step><type>end</type></step>` | `step.type = "end"` | No transitions required |

---

## Graph Structure

Each step becomes a **node**; each transition becomes a **directed edge**.

| Transition | Edge color | Edge label |
|-----------|-----------|-----------|
| `transitions.true` | Green (#16a34a) | "Approve" (decision) or "" (form) |
| `transitions.false` | Red (#dc2626) | "Reject" |
| `transitions.rollback` | Amber dashed (#d97706) | "Rollback" |

### Node types → visual style

| Step type | Node type ID | Color |
|-----------|-------------|-------|
| `form` | `formNode` | Blue border |
| `decision_user` | `decisionUserNode` | Amber border |
| `decision_sistem` | `decisionSistemNode` | Purple border |
| `end` | `endNode` | Gray circle |

---

## Converted Example: `testcaseflow.xml` → JSON DSL (partial)

```json
{
  "version": "1.0",
  "process": {
    "id": "<uuid>",
    "name": "testcaseflow",
    "roleStart": "user",
    "roles": [],
    "variables": [
      { "name": "nama_maker", "defaultValue": "" },
      { "name": "total_berkas", "defaultValue": "" },
      { "name": "tanggal_submit", "defaultValue": "" },
      { "name": "keperluan", "defaultValue": "" },
      { "name": "linkbukti", "defaultValue": "" },
      { "name": "komentar", "defaultValue": "" },
      { "name": "tahapdilalui", "defaultValue": "" }
    ],
    "steps": [
      {
        "number": 0, "type": "form",
        "tahap": "pengajuan rekomendasi",
        "formFields": ["nama_maker","total_berkas","tanggal_submit","keperluan","linkbukti"],
        "transitions": { "true": 1 }
      },
      {
        "number": 4, "type": "decision_user", "role": "dewan",
        "rule": "apakah dokumen layak?",
        "viewFields": ["nama_maker","total_berkas","tanggal_submit","keperluan","linkbukti"],
        "transitions": { "true": 5, "false": 0, "rollback": 1 }
      },
      {
        "number": 14, "type": "end",
        "transitions": {}
      }
    ]
  }
}
```
