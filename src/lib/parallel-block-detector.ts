// ============================================================
// Parallel Block Detector
// ------------------------------------------------------------
// Auto-detects fork-join patterns in the workflow where TWO
// actors with the same role run duplicated step sequences in
// parallel (e.g. Asesor 1 vs Asesor 2 Pra-Visitasi).
//
// Non-destructive: reads DSL, returns metadata. Nothing in the
// DSL is mutated here. Canvas/sidebar consume the result for
// visual grouping and navigation.
//
// Tolerant to spelling variance (asesor vs asessor / assessor).
// ============================================================
import type { WorkflowDSL, WorkflowStep } from '../types/workflow'
import { indexSteps } from './workflow-graph'

// The XML format uses "0" as a sentinel for "no target" on stepfalse/steptrue.
// The parser preserves 0 verbatim (since step #0 is legitimately a real step in
// some workflows). The detector treats 0 as an absent target when walking the
// graph — otherwise every path leaks into the common upstream root and join
// detection collapses to step 0.
const NO_TARGET = 0
const isRealTarget = (n: number | undefined): n is number =>
  n !== undefined && n !== NO_TARGET

/**
 * BFS from a single branch start. Returns a map: stepNumber → hop distance.
 * Skips the NO_TARGET sentinel and rollback transitions (we treat rollback
 * as a backward edge — following it leaks into upstream cycles and pulls
 * the "join" point back above the fork, which is the wrong answer).
 */
function bfsDepths(dsl: WorkflowDSL, from: number): Map<number, number> {
  const byNum = indexSteps(dsl)
  const depths = new Map<number, number>()
  const queue: Array<[number, number]> = [[from, 0]]
  while (queue.length) {
    const [n, d] = queue.shift()!
    if (n === NO_TARGET || depths.has(n)) continue
    depths.set(n, d)
    const step = byNum.get(n)
    if (!step) continue
    // Forward edges only (true + false); rollback is intentionally skipped.
    for (const key of ['true', 'false'] as const) {
      const t = step.transitions[key]
      if (t === undefined) continue
      const targets = Array.isArray(t) ? t : [t]
      for (const x of targets) {
        if (isRealTarget(x) && !depths.has(x)) queue.push([x, d + 1])
      }
    }
  }
  return depths
}

/**
 * Find the closest convergence point between two branch starts.
 * "Closest" = minimum combined BFS distance (depthA + depthB). This correctly
 * picks the first join even when the workflow has revise-back edges that loop
 * upstream of the fork.
 */
function findClosestJoin(
  dsl: WorkflowDSL,
  branchStarts: number[],
  forkStepNumber: number,
): number | null {
  if (branchStarts.length === 0) return null
  const depthMaps = branchStarts.map((s) => bfsDepths(dsl, s))
  let best: { step: number; total: number } | null = null
  for (const [n, dA] of depthMaps[0]) {
    if (branchStarts.includes(n)) continue
    // Exclude the fork itself and any step whose sole incoming path is a
    // rollback loop — the fork step cannot be its own join.
    if (n === forkStepNumber) continue
    let total = dA
    let inAll = true
    for (let i = 1; i < depthMaps.length; i++) {
      const d = depthMaps[i].get(n)
      if (d === undefined) { inAll = false; break }
      total += d
    }
    if (!inAll) continue
    if (!best || total < best.total) best = { step: n, total }
  }
  return best?.step ?? null
}

// Threshold below which we reject a candidate pair as "not a real
// parallel block". Empirically 0.75 catches the Mahad Aly pattern
// while rejecting unrelated decision branches.
const SIMILARITY_THRESHOLD = 0.75

// Max branch depth we will follow before giving up. Real workflows
// have 8–10 step branches; anything longer is almost certainly a
// false positive (we'd walk into unrelated downstream steps).
const MAX_BRANCH_DEPTH = 30

export interface DetectedParallelBlock {
  /** Deterministic id — derived from fork step number. Stable across parses. */
  id: string
  /** Step number that fanned out (its transitions.true is the fork). */
  forkStepNumber: number
  /** Step number where the branches converge (first common descendant). */
  joinStepNumber: number | null
  /** Ordered step numbers per branch — branches[0] = actor 1, branches[1] = actor 2. */
  branches: number[][]
  /** Human-readable actor labels extracted from titles ("Asesor 1", "Asesor 2"). */
  actors: string[]
  /** Similarity score 0..1 of branch-B vs branch-A (1.0 = perfect mirror). */
  similarity: number
  /** Root-cause warnings: what's off between branches (empty if perfect). */
  notes: string[]
}

// ── Normalisation helpers ────────────────────────────────────

/**
 * Normalise Indonesian "assessor" spelling variants to a canonical form.
 * XML in this codebase uses all of: asesor, asessor, assessor (case-insensitive).
 */
function normaliseAssessorText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ass?ess?or/g, 'asesor')       // collapse spelling variants
    .replace(/_prae?sessor/g, '_praasesor') // field-name variants
}

/** Strip the "actor index" token so two sibling steps compare as equal. */
function stripActorIndex(text: string): string {
  return normaliseAssessorText(text)
    .replace(/\basesor\s*[12]\b/g, 'asesor{n}')
    .replace(/\b(pra)?asesor[12]\b/g, '$1asesor{n}')
}

// ── Actor extraction ─────────────────────────────────────────

/**
 * Pick actor label ("Asesor 1" / "Asesor 2") from a step.
 * Looks at title first, then role-pick value, then formFields suffix.
 */
function extractActorLabel(step: WorkflowStep | undefined, branchIndex: number): string {
  if (!step) return `Aktor ${branchIndex + 1}`

  const title = (step as { title?: string }).title ?? ''
  const match = normaliseAssessorText(title).match(/asesor\s*([12])/)
  if (match) return `Asesor ${match[1]}`

  // system_role_pic_pick steps carry the variable name in a weird place
  // — fall back to scanning any free text for an Assesor_N reference.
  const raw = JSON.stringify(step)
  const varMatch = raw.match(/Ass?ess?or_([12])/i)
  if (varMatch) return `Asesor ${varMatch[1]}`

  return `Aktor ${branchIndex + 1}`
}

// ── Branch tracing ───────────────────────────────────────────

/**
 * BFS-like linear walk from `start` toward `joinExclusive`.
 * Follows transitions.true preferentially (skipping the join). Returns
 * the ordered list of step numbers that belong to this branch.
 *
 * Handles forward-only traversal: rollback edges are ignored so we don't
 * loop back through revision paths.
 */
function traceBranch(
  dsl: WorkflowDSL,
  start: number,
  joinExclusive: number | null,
  maxDepth: number = MAX_BRANCH_DEPTH,
): number[] {
  const byNum = indexSteps(dsl)
  const result: number[] = []
  const seen = new Set<number>()
  let cur: number | undefined = start

  while (cur !== undefined && !seen.has(cur) && result.length < maxDepth) {
    if (joinExclusive !== null && cur === joinExclusive) break
    if (cur === NO_TARGET) break
    seen.add(cur)
    result.push(cur)
    const step = byNum.get(cur)
    if (!step) break

    // Prefer true (forward); fall back to false; skip rollback entirely.
    const pickFirst = (t: number | number[] | undefined): number | undefined =>
      t === undefined ? undefined : (Array.isArray(t) ? t[0] : t)
    const nextTrue = pickFirst(step.transitions.true)
    const nextFalse = pickFirst(step.transitions.false)
    // Don't follow backward (step number smaller) on the false branch —
    // that's almost always a "go back to revise" edge, not forward flow.
    // Also skip the NO_TARGET sentinel.
    const curAtLoop: number = cur
    const safeNextTrue: number | undefined = isRealTarget(nextTrue) ? nextTrue : undefined
    const safeNextFalse: number | undefined =
      isRealTarget(nextFalse) && nextFalse > curAtLoop ? nextFalse : undefined
    cur = safeNextTrue !== undefined ? safeNextTrue : safeNextFalse
  }

  return result
}

// ── Similarity ───────────────────────────────────────────────

/**
 * Compare two branches step-by-step and return similarity in [0,1].
 * Weighted: type match 50%, role match 20%, title skeleton match 30%.
 */
function computeSimilarity(
  dsl: WorkflowDSL,
  branchA: number[],
  branchB: number[],
): { score: number; notes: string[] } {
  const notes: string[] = []
  const byNum = indexSteps(dsl)

  if (branchA.length !== branchB.length) {
    notes.push(
      `Jumlah step tidak sama: aktor 1 = ${branchA.length}, aktor 2 = ${branchB.length}`,
    )
  }

  const pairCount = Math.min(branchA.length, branchB.length)
  if (pairCount === 0) return { score: 0, notes }

  let typeMatches = 0
  let roleMatches = 0
  let titleMatches = 0

  for (let i = 0; i < pairCount; i++) {
    const a = byNum.get(branchA[i])
    const b = byNum.get(branchB[i])
    if (!a || !b) continue

    if (a.type === b.type) typeMatches++
    if ((a.role ?? '') === (b.role ?? '')) roleMatches++

    const aTitle = (a as { title?: string }).title ?? ''
    const bTitle = (b as { title?: string }).title ?? ''
    if (stripActorIndex(aTitle) === stripActorIndex(bTitle)) titleMatches++
  }

  const typeRatio = typeMatches / pairCount
  const roleRatio = roleMatches / pairCount
  const titleRatio = titleMatches / pairCount

  const score =
    0.5 * typeRatio +
    0.2 * roleRatio +
    0.3 * titleRatio -
    // Length mismatch penalty (small but non-zero)
    (branchA.length !== branchB.length ? 0.1 : 0)

  if (typeRatio < 1)
    notes.push(`Urutan tipe step tidak identik (${Math.round(typeRatio * 100)}% cocok)`)
  if (roleRatio < 1)
    notes.push(`Role tidak identik di semua posisi (${Math.round(roleRatio * 100)}% cocok)`)
  if (titleRatio < 1)
    notes.push(
      `Pola title tidak identik setelah strip "Asesor 1/2" (${Math.round(titleRatio * 100)}% cocok)`,
    )

  return { score: Math.max(0, Math.min(1, score)), notes }
}

// ── Public API ───────────────────────────────────────────────

/**
 * Detect all two-actor parallel blocks in a workflow DSL.
 *
 * Algorithm:
 * 1. Find every step whose `transitions.true` is a 2-element array → fork candidate.
 * 2. Compute join point via BFS intersection of both branches' reachable sets.
 * 3. Trace each branch from fork → join (exclusive).
 * 4. Compute branch similarity; keep if ≥ threshold.
 *
 * False positives (different logic in each branch) are filtered by the
 * similarity threshold — so this is safe to run on any workflow.
 */
export function detectParallelBlocks(dsl: WorkflowDSL): DetectedParallelBlock[] {
  const byNum = indexSteps(dsl)
  const blocks: DetectedParallelBlock[] = []

  for (const step of dsl.process.steps) {
    const trueT = step.transitions.true
    if (!Array.isArray(trueT) || trueT.length !== 2) continue

    const [startA, startB] = trueT

    // Find join = closest common descendant by combined BFS distance.
    // Weighing by BFS hops (not step number) correctly handles revise-back
    // edges that loop upstream of the fork.
    const joinStepNumber = findClosestJoin(dsl, [startA, startB], step.number)

    const branchA = traceBranch(dsl, startA, joinStepNumber)
    const branchB = traceBranch(dsl, startB, joinStepNumber)

    const { score, notes } = computeSimilarity(dsl, branchA, branchB)
    if (score < SIMILARITY_THRESHOLD) continue

    const actorA = extractActorLabel(byNum.get(branchA[0]), 0)
    const actorB = extractActorLabel(byNum.get(branchB[0]), 1)

    blocks.push({
      id: `pblock-${step.number}`,
      forkStepNumber: step.number,
      joinStepNumber,
      branches: [branchA, branchB],
      actors: [actorA, actorB],
      similarity: score,
      notes,
    })
  }

  return blocks
}

/**
 * Convenience: return the parallel block (if any) that owns a given step.
 * Returns { block, branchIndex, stepIndexInBranch } or null.
 */
export function findParallelBlockForStep(
  blocks: DetectedParallelBlock[],
  stepNumber: number,
): { block: DetectedParallelBlock; branchIndex: number; stepIndexInBranch: number } | null {
  for (const block of blocks) {
    for (let bi = 0; bi < block.branches.length; bi++) {
      const idx = block.branches[bi].indexOf(stepNumber)
      if (idx !== -1) return { block, branchIndex: bi, stepIndexInBranch: idx }
    }
  }
  return null
}
