import { memo } from 'react'
import type { NodeProps } from 'reactflow'

// Visual-only backdrop for a branch of a parallel block.
// Rendered by React Flow at zIndex:-1 so it sits behind step nodes.
// Non-interactive: click/drag pass through to the nodes above.

interface SwimlaneData {
  actorLabel: string
  branchIndex: number
  width: number
  height: number
}

// Palette per branch — branch A gets blue tint, branch B gets amber tint.
const PALETTE = [
  { bg: 'rgba(14, 165, 233, 0.07)', border: '#7dd3fc', text: '#0369a1' },
  { bg: 'rgba(217, 119, 6, 0.07)', border: '#fcd34d', text: '#b45309' },
]

function ParallelSwimlaneNodeInner({ data }: NodeProps<SwimlaneData>) {
  const palette = PALETTE[data.branchIndex % PALETTE.length]
  return (
    <div
      style={{
        width: data.width,
        height: data.height,
        background: palette.bg,
        border: `1.5px dashed ${palette.border}`,
        borderRadius: 12,
        pointerEvents: 'none',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 10,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: palette.text,
          background: 'rgba(255,255,255,0.85)',
          padding: '2px 8px',
          borderRadius: 6,
        }}
      >
        ∥ {data.actorLabel}
      </div>
    </div>
  )
}

export const ParallelSwimlaneNode = memo(ParallelSwimlaneNodeInner)
export default ParallelSwimlaneNode
