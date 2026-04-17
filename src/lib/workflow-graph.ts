/**
 * workflow-graph.ts — reusable graph analysis utilities for WorkflowDSL.
 *
 * Pure functions — no side effects, no React, no API calls.
 * Used by workflow-validator, workflow-logic-validator, and workflow-simulator.
 */
import type { WorkflowDSL, WorkflowStep } from '../types/workflow'

// ── Low-level accessors ──────────────────────────────────────

/** Returns all outgoing step numbers from a single step (across true/false/rollback). */
export function getOutgoingTargets(step: WorkflowStep): number[] {
  const targets: number[] = []
  for (const key of ['true', 'false', 'rollback'] as const) {
    const t = step.transitions[key]
    if (t === undefined) continue
    if (Array.isArray(t)) targets.push(...t)
    else targets.push(t)
  }
  return [...new Set(targets)]
}

/** Returns targets from a specific transition key (normalized to array). */
export function getBranchTargets(step: WorkflowStep, key: 'true' | 'false' | 'rollback'): number[] {
  const t = step.transitions[key]
  if (t === undefined) return []
  return Array.isArray(t) ? [...t] : [t]
}

/** Returns a step-number → step map for fast lookup. */
export function indexSteps(dsl: WorkflowDSL): Map<number, WorkflowStep> {
  const m = new Map<number, WorkflowStep>()
  for (const s of dsl.process.steps) m.set(s.number, s)
  return m
}

/** Reverse edge index: for every step, which other steps point to it. */
export function computeIncoming(dsl: WorkflowDSL): Map<number, number[]> {
  const incoming = new Map<number, number[]>()
  for (const s of dsl.process.steps) {
    for (const target of getOutgoingTargets(s)) {
      const list = incoming.get(target) ?? []
      list.push(s.number)
      incoming.set(target, list)
    }
  }
  return incoming
}

// ── Reachability ─────────────────────────────────────────────

/** BFS: all step numbers reachable from a starting step (inclusive). */
export function findReachable(dsl: WorkflowDSL, from: number): Set<number> {
  const byNum = indexSteps(dsl)
  const visited = new Set<number>()
  const queue: number[] = [from]
  while (queue.length) {
    const n = queue.shift()!
    if (visited.has(n)) continue
    visited.add(n)
    const step = byNum.get(n)
    if (!step) continue
    for (const t of getOutgoingTargets(step)) {
      if (!visited.has(t)) queue.push(t)
    }
  }
  return visited
}

// ── Divergence / convergence ─────────────────────────────────

/** Any step whose outgoing transitions produce multiple distinct targets (i.e. a fork). */
export function findDivergenceNodes(dsl: WorkflowDSL): WorkflowStep[] {
  const nodes: WorkflowStep[] = []
  for (const step of dsl.process.steps) {
    // A step is a divergence if:
    //   - its true transition is an array of length > 1 (parallel fan-out), OR
    //   - it has both true and false transitions (decision branch)
    const trueArr = Array.isArray(step.transitions.true) ? step.transitions.true : undefined
    const isParallelFork = trueArr !== undefined && trueArr.length > 1
    const isDecisionFork =
      step.transitions.true !== undefined &&
      step.transitions.false !== undefined
    if (isParallelFork || isDecisionFork) nodes.push(step)
  }
  return nodes
}

/** Steps where multiple incoming edges converge (potential join points). */
export function findConvergenceNodes(dsl: WorkflowDSL): WorkflowStep[] {
  const incoming = computeIncoming(dsl)
  const byNum = indexSteps(dsl)
  const nodes: WorkflowStep[] = []
  for (const [num, sources] of incoming) {
    if (sources.length >= 2) {
      const step = byNum.get(num)
      if (step) nodes.push(step)
    }
  }
  return nodes
}

/**
 * Given the starting points of N parallel branches, find steps reachable from ALL of them.
 * These are the convergence candidates — the first common descendant is the logical "join".
 */
export function findConvergence(dsl: WorkflowDSL, branchStarts: number[]): Set<number> {
  if (branchStarts.length === 0) return new Set()
  const reachableSets = branchStarts.map((s) => findReachable(dsl, s))
  // Intersection across all branches, excluding the branch starts themselves
  const first = reachableSets[0]
  const intersection = new Set<number>()
  for (const n of first) {
    if (branchStarts.includes(n)) continue
    if (reachableSets.every((set) => set.has(n))) intersection.add(n)
  }
  return intersection
}

// ── Path enumeration ─────────────────────────────────────────

/** Trace a single path (follows "true" first, then "false"). Stops at loops or terminals. */
export function tracePath(dsl: WorkflowDSL, from: number, maxDepth = 1000): number[] {
  const byNum = indexSteps(dsl)
  const path: number[] = []
  const visited = new Set<number>()
  let cur: number | undefined = from
  let depth = 0
  while (cur !== undefined && depth < maxDepth && !visited.has(cur)) {
    visited.add(cur)
    path.push(cur)
    const step = byNum.get(cur)
    if (!step) break
    // Prefer true branch; for arrays take first target
    const t = step.transitions.true
    if (t !== undefined) {
      cur = Array.isArray(t) ? t[0] : t
    } else {
      const f = step.transitions.false
      cur = f === undefined ? undefined : (Array.isArray(f) ? f[0] : f)
    }
    depth++
  }
  return path
}

/**
 * Enumerate all distinct simple paths from a start step.
 * A "simple path" does not revisit any step. Limits branching to avoid combinatorial blow-up.
 */
export function getAllPaths(
  dsl: WorkflowDSL,
  from = 0,
  opts: { maxPaths?: number; maxDepth?: number } = {},
): number[][] {
  const maxPaths = opts.maxPaths ?? 200
  const maxDepth = opts.maxDepth ?? 100
  const byNum = indexSteps(dsl)
  const paths: number[][] = []

  function walk(cur: number, path: number[], visited: Set<number>) {
    if (paths.length >= maxPaths) return
    if (path.length >= maxDepth) return
    path.push(cur)
    visited.add(cur)
    const step = byNum.get(cur)
    const outs = step ? getOutgoingTargets(step) : []
    // Filter out already-visited to keep paths simple
    const unvisited = outs.filter((t) => !visited.has(t))
    if (unvisited.length === 0) {
      paths.push([...path])
    } else {
      for (const next of unvisited) {
        walk(next, path, visited)
      }
    }
    path.pop()
    visited.delete(cur)
  }

  walk(from, [], new Set())
  return paths
}

/** Does step `a` reach step `b` via any directed path? */
export function canReach(dsl: WorkflowDSL, a: number, b: number): boolean {
  if (a === b) return true
  return findReachable(dsl, a).has(b)
}
