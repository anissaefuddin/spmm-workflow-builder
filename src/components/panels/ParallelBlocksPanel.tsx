import { useMemo } from 'react'
import { useWorkflowStore } from '../../store/workflow-store'
import { detectParallelBlocks } from '../../lib/parallel-block-detector'

// Sidebar panel that lists every detected parallel block (fork-join
// pair with two mirrored branches). Click a step number to jump to
// it — the existing selectStep flow re-centers the canvas.

export function ParallelBlocksPanel() {
  const {
    dsl,
    selectStep,
    syncParallelBranch,
    commitParallelBlockAnnotations,
    clearParallelBlockAnnotations,
  } = useWorkflowStore()

  const blocks = useMemo(() => (dsl ? detectParallelBlocks(dsl) : []), [dsl])

  if (!dsl) return null

  const persisted = dsl.process.parallelBlocks ?? []
  const isPersisted = persisted.length > 0

  if (blocks.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic">
        Tidak ada pola paralel (fork-join dengan 2 branch identik) terdeteksi di workflow ini.
      </p>
    )
  }

  const stepsByNumber = new Map(dsl.process.steps.map((s) => [s.number, s]))

  const handleJump = (stepNumber: number) => {
    const step = stepsByNumber.get(stepNumber)
    if (step) selectStep(step.id)
  }

  const handleSync = (
    blockId: string,
    fromIdx: number,
    toIdx: number,
    fromLabel: string,
    toLabel: string,
  ) => {
    const confirmed = window.confirm(
      `Salin title, form_data, dan log dari ${fromLabel} ke ${toLabel}?\n\n` +
        'Nomor step dan transitions tidak berubah; hanya isi (content) yang disalin ' +
        'dengan substitusi penanda aktor (Asesor 1 → 2, dst). Aksi bisa di-undo.',
    )
    if (!confirmed) return
    const result = syncParallelBranch(blockId, fromIdx, toIdx)
    if (result) {
      window.alert(`${result.copiedSteps} step berhasil di-sync.`)
    } else {
      window.alert('Gagal sync — blok tidak ditemukan atau tidak ada pasangan valid.')
    }
  }

  const handleCommit = () => {
    const result = commitParallelBlockAnnotations()
    window.alert(
      `${result.count} anotasi blok paralel disimpan. Akan di-emit ke XML sebagai komentar ` +
        `<!-- @@parallelBlocks ... --> saat file di-save.`,
    )
  }

  const handleClear = () => {
    if (
      !window.confirm(
        'Hapus anotasi tersimpan? Detector tetap akan mendeteksi ulang saat file dibuka — ' +
          'ini hanya menghapus cache tertulis di XML.',
      )
    )
      return
    clearParallelBlockAnnotations()
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        {blocks.length} pola paralel terdeteksi. Setiap blok terdiri dari fork step + 2 branch
        kembar + join step.
      </p>

      {/* Annotation persistence controls */}
      <div className="flex gap-1.5 text-[11px]">
        <button
          onClick={handleCommit}
          className="flex-1 bg-slate-800 hover:bg-slate-900 text-white rounded px-2 py-1 font-medium transition-colors"
          title="Simpan anotasi blok saat ini ke XML (sebagai komentar, tidak mempengaruhi runtime)"
        >
          ⬇ Simpan anotasi
        </button>
        {isPersisted && (
          <button
            onClick={handleClear}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded px-2 py-1 font-medium transition-colors"
            title="Hapus anotasi tersimpan"
          >
            ✕ Clear
          </button>
        )}
      </div>
      {isPersisted && (
        <p className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
          ✓ {persisted.length} anotasi tersimpan di DSL — akan di-emit ke XML sebagai komentar.
        </p>
      )}

      {blocks.map((block) => {
        const forkStep = stepsByNumber.get(block.forkStepNumber)
        const joinStep =
          block.joinStepNumber !== null ? stepsByNumber.get(block.joinStepNumber) : null
        const simPct = Math.round(block.similarity * 100)
        const simColor =
          block.similarity >= 0.95
            ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
            : block.similarity >= 0.85
              ? 'text-amber-600 bg-amber-50 border-amber-200'
              : 'text-orange-600 bg-orange-50 border-orange-200'

        return (
          <div
            key={block.id}
            className="border border-sky-200 bg-sky-50/40 rounded-lg p-3 space-y-2"
          >
            {/* Header: fork → join summary */}
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-sky-900 uppercase tracking-wide">
                ∥ Paralel Block
              </div>
              <div
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${simColor}`}
                title="Similarity kedua branch"
              >
                {simPct}% match
              </div>
            </div>

            {/* Fork / Join jump buttons */}
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <button
                onClick={() => handleJump(block.forkStepNumber)}
                className="bg-white border border-gray-200 hover:border-sky-400 hover:bg-sky-50 rounded px-2 py-1 text-left transition-colors"
              >
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">Fork</div>
                <div className="font-mono font-semibold text-gray-800 truncate">
                  #{block.forkStepNumber}
                  {forkStep && (forkStep as { title?: string }).title
                    ? ` · ${(forkStep as { title?: string }).title}`
                    : ''}
                </div>
              </button>
              <button
                onClick={() =>
                  block.joinStepNumber !== null && handleJump(block.joinStepNumber)
                }
                disabled={block.joinStepNumber === null}
                className="bg-white border border-gray-200 hover:border-sky-400 hover:bg-sky-50 rounded px-2 py-1 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">Join</div>
                <div className="font-mono font-semibold text-gray-800 truncate">
                  {block.joinStepNumber !== null ? `#${block.joinStepNumber}` : '—'}
                  {joinStep && (joinStep as { title?: string }).title
                    ? ` · ${(joinStep as { title?: string }).title}`
                    : ''}
                </div>
              </button>
            </div>

            {/* Branches */}
            <div className="space-y-1.5">
              {block.branches.map((branchSteps, bi) => {
                const tint = bi === 0
                  ? 'bg-sky-100/60 border-sky-300 text-sky-900'
                  : 'bg-amber-100/60 border-amber-300 text-amber-900'
                return (
                  <div
                    key={bi}
                    className={`border rounded px-2 py-1.5 ${tint}`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wide mb-1">
                      {block.actors[bi] ?? `Aktor ${bi + 1}`} ({branchSteps.length} step)
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {branchSteps.map((num) => (
                        <button
                          key={num}
                          onClick={() => handleJump(num)}
                          className="font-mono text-[11px] bg-white border border-gray-200 hover:border-gray-400 rounded px-1.5 py-0.5 transition-colors"
                          title={stepsByNumber.get(num)?.type ?? ''}
                        >
                          #{num}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Notes (drift warnings) */}
            {block.notes.length > 0 && (
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 space-y-0.5">
                <div className="font-semibold">Catatan drift:</div>
                {block.notes.map((n, i) => (
                  <div key={i}>• {n}</div>
                ))}
              </div>
            )}

            {/* Sync actions */}
            <div className="grid grid-cols-2 gap-1.5 text-[11px] pt-1 border-t border-sky-200/60">
              <button
                onClick={() =>
                  handleSync(
                    block.id,
                    0,
                    1,
                    block.actors[0] ?? 'Aktor 1',
                    block.actors[1] ?? 'Aktor 2',
                  )
                }
                className="bg-white border border-sky-300 hover:bg-sky-50 text-sky-800 rounded px-2 py-1 font-medium transition-colors"
                title="Salin isi dari branch A ke branch B"
              >
                ⇢ Sync {block.actors[0] ?? 'A'} → {block.actors[1] ?? 'B'}
              </button>
              <button
                onClick={() =>
                  handleSync(
                    block.id,
                    1,
                    0,
                    block.actors[1] ?? 'Aktor 2',
                    block.actors[0] ?? 'Aktor 1',
                  )
                }
                className="bg-white border border-amber-300 hover:bg-amber-50 text-amber-800 rounded px-2 py-1 font-medium transition-colors"
                title="Salin isi dari branch B ke branch A"
              >
                ⇢ Sync {block.actors[1] ?? 'B'} → {block.actors[0] ?? 'A'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
