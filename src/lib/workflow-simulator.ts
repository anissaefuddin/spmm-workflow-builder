/**
 * workflow-simulator.ts — state-space exploration of a WorkflowDSL.
 *
 * Simulates ALL possible execution paths through the workflow, accounting for:
 *   - Single transitions   (one active step → one active step)
 *   - Parallel transitions (one active step → multiple active steps)
 *   - Decisions            (explores BOTH true and false paths)
 *   - Wait/park states     (system_kosong — branch terminates)
 *   - End states           (branch terminates)
 *
 * Outputs structured findings:
 *   - paths           : every explored state sequence (terminating or looping)
 *   - deadlocks       : steps with no outgoing transitions (non-end)
 *   - infiniteLoops   : detected revisits of the same state
 *   - prematureEnds   : end states reached while other branches were still active
 *
 * Bounded by maxStates and maxDepth to prevent combinatorial blow-up.
 * Pure function — no mutation outside the returned report.
 */
import type { WorkflowDSL, WorkflowStep } from '../types/workflow'
import { indexSteps, getBranchTargets } from './workflow-graph'

// ── Public API types ─────────────────────────────────────────

export interface SimStep {
  /** The set of currently active step numbers (multiple = parallel execution). */
  active: number[]
  /** What transition triggered this state, for trace readability */
  via?: string
}

export interface SimPath {
  steps: SimStep[]
  outcome: 'END' | 'DEADLOCK' | 'LOOP' | 'MAX_DEPTH' | 'PARKED'
  finalActive: number[]
  loopAt?: number  // step number where a loop was detected
}

export interface SimulationResult {
  paths: SimPath[]
  deadlocks: number[]           // step numbers that stall
  infiniteLoops: number[]       // step numbers involved in loops
  prematureEnds: number[]       // end steps reached with other branches still active
  maxConcurrency: number        // max number of parallel active steps observed
  totalStatesExplored: number
  truncated: boolean            // true if hit maxPaths/maxDepth limits
}

export interface SimulationOptions {
  /** Starting step number (default 0) */
  start?: number
  /** Max total paths to explore (default 100) */
  maxPaths?: number
  /** Max steps per path (default 200) */
  maxDepth?: number
  /** If true, explore both true/false branches of decisions (default true) */
  exploreAllBranches?: boolean
}

// ── Implementation ───────────────────────────────────────────

function isEndStep(step: WorkflowStep): boolean {
  if (step.type === 'end') return true
  if (step.type === 'system_action') {
    const rawType = (step as WorkflowStep & { rawType?: string }).rawType ?? ''
    return rawType === 'system_end' || rawType.startsWith('system_end')
  }
  return false
}

function isKosongStep(step: WorkflowStep): boolean {
  if (step.type !== 'system_action') return false
  const rawType = (step as WorkflowStep & { rawType?: string }).rawType ?? ''
  return rawType === 'system_kosong'
}

function stateKey(active: number[]): string {
  return [...active].sort((a, b) => a - b).join(',')
}

/** Given one step and the "explore both branches" flag, return next-state candidates. */
function nextCandidates(step: WorkflowStep, exploreAll: boolean): number[][] {
  // Normal form step / decision / system_action: follow transitions.
  const trueT = getBranchTargets(step, 'true').filter((n) => n !== 0)
  const falseT = getBranchTargets(step, 'false').filter((n) => n !== 0)

  if (isEndStep(step)) return []             // terminal: no candidates
  if (isKosongStep(step)) return []          // parked: branch terminates

  const hasTrue = trueT.length > 0
  const hasFalse = falseT.length > 0

  if (!hasTrue && !hasFalse) return []       // deadlock candidate

  // Decisions (user/system/form): explore both paths unless single-branch
  if (exploreAll && hasTrue && hasFalse) {
    // Yield each branch as a separate candidate
    return [trueT, falseT]
  }
  if (hasTrue) return [trueT]
  if (hasFalse) return [falseT]
  return []
}

/**
 * Simulate all possible execution paths through the workflow.
 *
 * @example
 * const sim = simulate(dsl)
 * if (sim.deadlocks.length > 0) console.warn('Deadlocks:', sim.deadlocks)
 * if (sim.prematureEnds.length > 0) console.error('Premature ends:', sim.prematureEnds)
 */
export function simulate(dsl: WorkflowDSL, opts: SimulationOptions = {}): SimulationResult {
  const start = opts.start ?? 0
  const maxPaths = opts.maxPaths ?? 100
  const maxDepth = opts.maxDepth ?? 200
  const exploreAll = opts.exploreAllBranches ?? true

  const byNum = indexSteps(dsl)
  const paths: SimPath[] = []
  const deadlocks = new Set<number>()
  const loops = new Set<number>()
  const prematureEnds = new Set<number>()
  let maxConcurrency = 0
  let totalStatesExplored = 0
  let truncated = false

  // DFS with per-path visited state tracking
  function explore(active: number[], trace: SimStep[], visitedStates: Set<string>) {
    if (paths.length >= maxPaths) { truncated = true; return }
    if (trace.length >= maxDepth) {
      paths.push({ steps: [...trace], outcome: 'MAX_DEPTH', finalActive: active })
      truncated = true
      return
    }

    totalStatesExplored++
    maxConcurrency = Math.max(maxConcurrency, active.length)

    const key = stateKey(active)
    if (visitedStates.has(key)) {
      // Loop detected — record and terminate this path
      const loopPoint = active[0] ?? -1
      loops.add(loopPoint)
      paths.push({
        steps: [...trace],
        outcome: 'LOOP',
        finalActive: active,
        loopAt: loopPoint,
      })
      return
    }
    visitedStates.add(key)

    // Check end / deadlock conditions per active step
    // If ALL active steps are terminal, this is either END or PARKED
    const activeSteps = active.map((n) => byNum.get(n)).filter((s): s is WorkflowStep => !!s)
    const allEnd = activeSteps.length > 0 && activeSteps.every((s) => isEndStep(s))
    const allTerminal = activeSteps.length > 0 && activeSteps.every((s) => isEndStep(s) || isKosongStep(s))

    if (allEnd) {
      // Detect premature end: if we reached end while there WERE parallel branches earlier
      const hadConcurrency = trace.some((s) => s.active.length > 1)
      if (hadConcurrency && active.length < trace.find((s) => s.active.length > 1)!.active.length) {
        // Not all branches completed but we reached end
        for (const n of active) prematureEnds.add(n)
      }
      paths.push({ steps: [...trace], outcome: 'END', finalActive: active })
      return
    }

    if (allTerminal) {
      paths.push({ steps: [...trace], outcome: 'PARKED', finalActive: active })
      return
    }

    // For each active step, compute its possible next-states
    // Parallel steps advance INDEPENDENTLY; at each simulation tick we advance ONE active step.
    // This gives interleaved semantics which is what the real engine does (tasks activate sequentially).
    let progressed = false
    for (let i = 0; i < active.length; i++) {
      const curNum = active[i]
      const step = byNum.get(curNum)
      if (!step) continue
      if (isEndStep(step) || isKosongStep(step)) continue

      const candidates = nextCandidates(step, exploreAll)
      if (candidates.length === 0) {
        deadlocks.add(curNum)
        continue
      }

      progressed = true
      // For each candidate (each branch of a decision), spawn a sub-path
      for (const nextTargets of candidates) {
        // Replace `curNum` in active with nextTargets (which may be >1 for parallel)
        const newActive = [...active.slice(0, i), ...nextTargets, ...active.slice(i + 1)]
        const viaLabel = nextTargets.length > 1
          ? `#${curNum} ⇉ [${nextTargets.join(',')}] parallel`
          : `#${curNum} → #${nextTargets[0]}`
        trace.push({ active: newActive, via: viaLabel })
        explore([...new Set(newActive)], trace, new Set(visitedStates))
        trace.pop()
      }
      // Only advance ONE active step per simulation tick — others wait
      // (Breaking here gives proper interleaving exploration)
      break
    }

    if (!progressed) {
      // Nothing advanced — record as deadlock
      paths.push({ steps: [...trace], outcome: 'DEADLOCK', finalActive: active })
      for (const n of active) deadlocks.add(n)
    }
  }

  const initial: SimStep[] = [{ active: [start], via: 'START' }]
  explore([start], initial, new Set())

  return {
    paths,
    deadlocks: [...deadlocks].sort((a, b) => a - b),
    infiniteLoops: [...loops].sort((a, b) => a - b),
    prematureEnds: [...prematureEnds].sort((a, b) => a - b),
    maxConcurrency,
    totalStatesExplored,
    truncated,
  }
}

/** Produce a human-readable summary of a simulation result. */
export function summarizeSimulation(r: SimulationResult): string {
  const parts: string[] = []
  parts.push(`${r.paths.length} paths explored (${r.totalStatesExplored} states)`)
  parts.push(`max concurrency: ${r.maxConcurrency}`)
  if (r.deadlocks.length)     parts.push(`deadlocks: ${r.deadlocks.join(',')}`)
  if (r.infiniteLoops.length) parts.push(`loops: ${r.infiniteLoops.join(',')}`)
  if (r.prematureEnds.length) parts.push(`premature ends: ${r.prematureEnds.join(',')}`)
  if (r.truncated)            parts.push('(truncated — increase maxPaths/maxDepth to explore more)')
  return parts.join(' · ')
}
