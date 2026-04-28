// ============================================================
// Graph Adapter — DSL → ReactFlow nodes & edges
// Uses dagre for TB layout with main-path detection.
// ============================================================
import dagre from 'dagre'
import type { Node, Edge } from 'reactflow'
import { MarkerType } from 'reactflow'
import type { WorkflowDSL, WorkflowStep } from '../types/workflow'
import { detectParallelBlocks, type DetectedParallelBlock } from './parallel-block-detector'

// ── Node dimensions (must match rendered size) ───────────────
const NODE_W = 220
const END_W  = 100   // EndNode is smaller (circle-ish)
const NODE_H = 100   // conservative height; form with many fields may be taller

// ── Dagre config ─────────────────────────────────────────────
const DAGRE_RANK_SEP = 120   // vertical gap between ranks
const DAGRE_NODE_SEP = 80    // horizontal gap between nodes in same rank

// ── Label builders ───────────────────────────────────────────

export function stepLabel(step: WorkflowStep): string {
  switch (step.type) {
    case 'form':
      return step.title ?? (step.tahap ? `Form: ${step.tahap}` : `Form ${step.number}`)
    case 'decision_user':
      return step.title ?? step.rule ?? `Decision ${step.number}`
    case 'decision_sistem':
      return step.title
           ?? `${step.condition.variableA} ${step.condition.operator} ${step.condition.variableB}`
    case 'system_action':
      return step.title ?? step.rawType ?? `System ${step.number}`
    case 'end':
      return step.title ?? 'End'
  }
}

// ── Main-path detection ───────────────────────────────────────
// Walk the "true" chain from the first step; collect visited step numbers.
// These form the primary/happy path that gets bold styling.

function detectMainPath(steps: WorkflowStep[]): Set<number> {
  const byNum = new Map(steps.map((s) => [s.number, s]))
  const sorted = [...steps].sort((a, b) => a.number - b.number)
  const start = sorted[0]?.number
  if (start === undefined) return new Set()

  const main = new Set<number>()
  let cur: number | undefined = start
  const visited = new Set<number>()

  while (cur !== undefined && !visited.has(cur)) {
    visited.add(cur)
    main.add(cur)
    const step = byNum.get(cur)
    if (!step) break
    // Prefer true branch; fall back to the only transition available.
    // For parallel branches (array), follow the first target for main-path tracing.
    const pickFirst = (t: number | number[] | undefined): number | undefined =>
      t === undefined ? undefined : (Array.isArray(t) ? t[0] : t)
    const nextTrue  = pickFirst(step.transitions.true)
    const nextFalse = pickFirst(step.transitions.false)
    if (nextTrue !== undefined) {
      cur = nextTrue
    } else if (nextFalse !== undefined) {
      cur = nextFalse
    } else {
      break
    }
  }
  return main
}

// ── Main-path EDGE detection ──────────────────────────────────
// An edge is on the main path if BOTH source and target step numbers are in the main path set
// AND it is a "true" transition.

function isMainEdge(sourceNum: number, edgeType: 'true' | 'false' | 'rollback', mainPath: Set<number>, targetNum: number): boolean {
  return edgeType === 'true' && mainPath.has(sourceNum) && mainPath.has(targetNum)
}

// ── Dagre layout ──────────────────────────────────────────────

function dagreLayout(
  steps: WorkflowStep[],
): Map<number, { x: number; y: number }> {
  if (steps.length === 0) return new Map()

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: 'TB',
    nodesep: DAGRE_NODE_SEP,
    ranksep: DAGRE_RANK_SEP,
    marginx: 40,
    marginy: 40,
  })

  for (const step of steps) {
    const w = step.type === 'end' ? END_W : NODE_W
    g.setNode(`step-${step.number}`, { width: w, height: NODE_H })
  }

  for (const step of steps) {
    const src = `step-${step.number}`
    if (step.transitions.true     !== undefined) g.setEdge(src, `step-${step.transitions.true}`)
    if (step.transitions.false    !== undefined) g.setEdge(src, `step-${step.transitions.false}`)
    if (step.transitions.rollback !== undefined) g.setEdge(src, `step-${step.transitions.rollback}`)
  }

  try {
    dagre.layout(g)
  } catch (e) {
    console.warn('[graph-adapter] dagre layout failed, using fallback', e)
    return fallbackLayout(steps)
  }

  const positions = new Map<number, { x: number; y: number }>()
  for (const step of steps) {
    const node = g.node(`step-${step.number}`)
    if (node) {
      const w = step.type === 'end' ? END_W : NODE_W
      // dagre gives center; ReactFlow wants top-left
      positions.set(step.number, {
        x: node.x - w / 2,
        y: node.y - NODE_H / 2,
      })
    }
  }
  return positions
}

// Fallback: simple vertical stack sorted by step number
function fallbackLayout(steps: WorkflowStep[]): Map<number, { x: number; y: number }> {
  const sorted = [...steps].sort((a, b) => a.number - b.number)
  const positions = new Map<number, { x: number; y: number }>()
  sorted.forEach((step, i) => {
    positions.set(step.number, { x: 0, y: i * (NODE_H + DAGRE_RANK_SEP) })
  })
  return positions
}

// ── Node type → visual config ─────────────────────────────────

function nodeReactFlowType(step: WorkflowStep): string {
  switch (step.type) {
    case 'form':            return 'formNode'
    case 'decision_user':  return 'decisionUserNode'
    case 'decision_sistem': return 'decisionSistemNode'
    case 'system_action':  return 'systemActionNode'
    case 'end':            return 'endNode'
  }
}

// ── Public API ────────────────────────────────────────────────

export interface GraphMeta {
  mainPathSteps: Set<number>
  isComplex: boolean
  parallelBlocks: DetectedParallelBlock[]
}

// ── Swimlane layout ──────────────────────────────────────────
// For each detected parallel block, compute a bounding rect that
// covers all step nodes in a single branch. Rendered as a custom
// React Flow node with zIndex below the step nodes so it appears
// as a colored backdrop — purely visual, no interaction.

const SWIMLANE_PAD_X = 24
const SWIMLANE_PAD_Y = 32  // extra room for the header label

interface SwimlaneRect {
  blockId: string
  branchIndex: number
  actorLabel: string
  x: number
  y: number
  w: number
  h: number
}

function computeSwimlaneRects(
  blocks: DetectedParallelBlock[],
  positions: Map<number, { x: number; y: number }>,
  stepWidthOf: (num: number) => number,
): SwimlaneRect[] {
  const rects: SwimlaneRect[] = []
  for (const block of blocks) {
    block.branches.forEach((branchSteps, branchIndex) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const stepNum of branchSteps) {
        const p = positions.get(stepNum)
        if (!p) continue
        const w = stepWidthOf(stepNum)
        if (p.x < minX) minX = p.x
        if (p.y < minY) minY = p.y
        if (p.x + w > maxX) maxX = p.x + w
        if (p.y + NODE_H > maxY) maxY = p.y + NODE_H
      }
      if (!isFinite(minX)) return
      rects.push({
        blockId: block.id,
        branchIndex,
        actorLabel: block.actors[branchIndex] ?? `Aktor ${branchIndex + 1}`,
        x: minX - SWIMLANE_PAD_X,
        y: minY - SWIMLANE_PAD_Y,
        w: maxX - minX + SWIMLANE_PAD_X * 2,
        h: maxY - minY + SWIMLANE_PAD_Y + SWIMLANE_PAD_X,
      })
    })
  }
  return rects
}

export function dslToReactFlow(
  dsl: WorkflowDSL,
): { nodes: Node[]; edges: Edge[]; meta: GraphMeta } {
  const { steps } = dsl.process

  if (steps.length === 0) {
    console.warn('[graph-adapter] No steps in DSL')
    return {
      nodes: [],
      edges: [],
      meta: { mainPathSteps: new Set(), isComplex: false, parallelBlocks: [] },
    }
  }

  const mainPathSteps = detectMainPath(steps)
  const isComplex     = steps.length >= 6
  const positions     = dagreLayout(steps)
  const parallelBlocks = detectParallelBlocks(dsl)

  console.log('[graph-adapter] mainPath:', [...mainPathSteps])
  console.log('[graph-adapter] positions:', Object.fromEntries(positions))
  console.log('[graph-adapter] parallelBlocks:', parallelBlocks.length, parallelBlocks)

  // ── Swimlane background nodes (one per branch, rendered underneath) ──
  const stepWidthOf = (num: number) => {
    const s = steps.find((x) => x.number === num)
    return s?.type === 'end' ? END_W : NODE_W
  }
  const swimlanes = computeSwimlaneRects(parallelBlocks, positions, stepWidthOf)
  const swimlaneNodes: Node[] = swimlanes.map((rect) => ({
    id: `swimlane-${rect.blockId}-${rect.branchIndex}`,
    type: 'parallelSwimlane',
    position: { x: rect.x, y: rect.y },
    // Width/height must be on the node itself so React Flow reserves space.
    style: { width: rect.w, height: rect.h, zIndex: -1 },
    data: {
      actorLabel: rect.actorLabel,
      branchIndex: rect.branchIndex,
      width: rect.w,
      height: rect.h,
    },
    draggable: false,
    selectable: false,
    focusable: false,
    zIndex: -1,
  }))

  // ── Nodes ──────────────────────────────────────────────────
  const nodes: Node[] = steps.map((step, index) => {
    const pos = positions.get(step.number) ?? {
      x: (index % 4) * (NODE_W + DAGRE_NODE_SEP),
      y: Math.floor(index / 4) * (NODE_H + DAGRE_RANK_SEP),
    }
    const onMainPath = mainPathSteps.has(step.number)

    return {
      id:       `step-${step.number}`,
      type:     nodeReactFlowType(step),
      position: pos,
      data: {
        step,
        label:      stepLabel(step),
        onMainPath,
        isComplex,
        width:  step.type === 'end' ? END_W : NODE_W,
        height: NODE_H,
      },
    } satisfies Node
  })

  // ── Edges ──────────────────────────────────────────────────
  const edges: Edge[] = []

  // Normalize a transition target into an array (supports parallel branches)
  const toTargets = (t: number | number[] | undefined): number[] =>
    t === undefined ? [] : Array.isArray(t) ? t : [t]

  for (const step of steps) {
    const srcId  = `step-${step.number}`

    for (const tgtNum of toTargets(step.transitions.true)) {
      const tgtId  = `step-${tgtNum}`
      const main   = isMainEdge(step.number, 'true', mainPathSteps, tgtNum)
      const isParallel = Array.isArray(step.transitions.true) && (step.transitions.true as number[]).length > 1
      edges.push({
        id:           `e-${step.number}-true-${tgtNum}`,
        source:       srcId,
        sourceHandle: (step.type === 'decision_user' || step.type === 'decision_sistem') ? 'true' : undefined,
        target:       tgtId,
        label:        isParallel ? '∥ Parallel' : (step.type === 'form' ? '' : 'Approve'),
        type:         'smoothstep',
        style: {
          stroke:      main ? '#15803d' : (isParallel ? '#0ea5e9' : '#22c55e'),
          strokeWidth: main ? 3 : 1.5,
        },
        labelStyle: {
          fill:       isParallel ? '#0369a1' : '#15803d',
          fontSize:   11,
          fontWeight: main ? 700 : 400,
        },
        labelBgStyle: main ? { fill: '#f0fdf4', fillOpacity: 0.9 } : undefined,
        data: { edgeType: 'true', main, parallel: isParallel },
        animated: main,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: main ? '#15803d' : (isParallel ? '#0ea5e9' : '#22c55e'),
        },
      })
    }

    for (const tgtNum of toTargets(step.transitions.false)) {
      const tgtId  = `step-${tgtNum}`
      edges.push({
        id:           `e-${step.number}-false-${tgtNum}`,
        source:       srcId,
        sourceHandle: (step.type === 'decision_user' || step.type === 'decision_sistem') ? 'false' : undefined,
        target:       tgtId,
        label:        'Reject',
        type:         'smoothstep',
        style:        { stroke: '#dc2626', strokeWidth: 1.5, strokeDasharray: '6 3' },
        labelStyle:   { fill: '#dc2626', fontSize: 11 },
        labelBgStyle: { fill: '#fff5f5', fillOpacity: 0.9 },
        data:         { edgeType: 'false', main: false },
        animated:     false,
        markerEnd: {
          type:  MarkerType.ArrowClosed,
          color: '#dc2626',
        },
      })
    }

    for (const tgtNum of toTargets(step.transitions.rollback)) {
      const tgtId  = `step-${tgtNum}`
      edges.push({
        id:           `e-${step.number}-rollback-${tgtNum}`,
        source:       srcId,
        target:       tgtId,
        label:        'Rollback',
        type:         'smoothstep',
        style:        { stroke: '#d97706', strokeWidth: 1.5, strokeDasharray: '4 4' },
        labelStyle:   { fill: '#d97706', fontSize: 11 },
        labelBgStyle: { fill: '#fffbeb', fillOpacity: 0.9 },
        data:         { edgeType: 'rollback', main: false },
        animated:     false,
        markerEnd: {
          type:  MarkerType.ArrowClosed,
          color: '#d97706',
        },
      })
    }
  }

  // Swimlane nodes are prepended so they sit first in the array, which in
  // React Flow combined with zIndex:-1 reliably renders them behind step nodes.
  const allNodes = [...swimlaneNodes, ...nodes]

  console.log('[WorkflowCanvas] NODES:', allNodes.length, '(swimlanes:', swimlaneNodes.length, ')')
  console.log('[WorkflowCanvas] EDGES:', edges.length)

  return {
    nodes: allNodes,
    edges,
    meta: { mainPathSteps, isComplex, parallelBlocks },
  }
}
