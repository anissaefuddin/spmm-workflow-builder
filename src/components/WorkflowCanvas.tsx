import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useWorkflowStore } from '../store/workflow-store'
import { dslToReactFlow } from '../lib/graph-adapter'
import FormNode from './nodes/FormNode'
import DecisionUserNode from './nodes/DecisionUserNode'
import DecisionSistemNode from './nodes/DecisionSistemNode'
import SystemActionNode from './nodes/SystemActionNode'
import EndNode from './nodes/EndNode'

// nodeTypes MUST be defined outside the component — a stable reference is required.
// Defining it inside triggers React Flow to remount every node on each render.
const nodeTypes: NodeTypes = {
  formNode: FormNode,
  decisionUserNode: DecisionUserNode,
  decisionSistemNode: DecisionSistemNode,
  systemActionNode: SystemActionNode,
  endNode: EndNode,
}

export function WorkflowCanvas({ monitorHighlightStep }: { monitorHighlightStep?: number | null }) {
  const { dsl, selectedStepId, selectStep } = useWorkflowStore()
  const rfInstance = useRef<ReactFlowInstance | null>(null)

  // ── Graph state ──────────────────────────────────────────────
  // Pre-compute from the DSL already in store at mount so fitView fires on real nodes.
  const initGraph = useRef(dsl ? dslToReactFlow(dsl) : { nodes: [], edges: [], meta: { mainPathSteps: new Set<number>(), isComplex: false } })
  const [nodes, setNodes, onNodesChange] = useNodesState(initGraph.current.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initGraph.current.edges)
  const [graphMeta, setGraphMeta] = useState(initGraph.current.meta)

  // Toggles
  const [showOnlyMain, setShowOnlyMain] = useState(false)

  // Version bump triggers fitView after state settles
  const [graphVersion, setGraphVersion] = useState(0)

  // ── Recompute on DSL change ───────────────────────────────────
  useEffect(() => {
    if (!dsl) {
      setNodes([])
      setEdges([])
      setGraphMeta({ mainPathSteps: new Set(), isComplex: false })
      return
    }
    const result = dslToReactFlow(dsl)
    setNodes(result.nodes)
    setEdges(result.edges)
    setGraphMeta(result.meta)
    setGraphVersion((v) => v + 1)
  }, [dsl, setNodes, setEdges])

  // ── fitView after graph is painted ───────────────────────────
  useEffect(() => {
    if (graphVersion === 0) return
    requestAnimationFrame(() => {
      rfInstance.current?.fitView({ padding: 0.15, duration: 250 })
    })
  }, [graphVersion])

  // ── Auto-center canvas on selected step ──────────────────────
  useEffect(() => {
    if (!selectedStepId || !dsl || !rfInstance.current) return
    const selectedStep = dsl.process.steps.find((s) => s.id === selectedStepId)
    if (!selectedStep) return
    const nodeId = `step-${selectedStep.number}`
    // Use fitView scoped to the single node so it centers without full re-fit
    requestAnimationFrame(() => {
      rfInstance.current?.fitView({ nodes: [{ id: nodeId }], duration: 300, padding: 1.5 })
    })
  }, [selectedStepId, dsl])

  // ── Apply selection + monitor highlight + collapse filter ────
  const visibleNodes = useMemo(() => {
    return nodes
      .filter((n) => {
        if (!showOnlyMain) return true
        const num = parseInt(n.id.replace('step-', ''), 10)
        return graphMeta.mainPathSteps.has(num)
      })
      .map((n) => {
        const stepNum = parseInt(n.id.replace('step-', ''), 10)
        const isSelected = (() => {
          if (!selectedStepId || !dsl) return false
          const selNum = dsl.process.steps.find((s) => s.id === selectedStepId)?.number
          return n.id === `step-${selNum}`
        })()
        const isMonitorActive = monitorHighlightStep != null && stepNum === monitorHighlightStep
        return {
          ...n,
          selected: isSelected,
          className: isMonitorActive ? 'monitor-active-node' : '',
        }
      })
  }, [nodes, selectedStepId, dsl, monitorHighlightStep, showOnlyMain, graphMeta])

  const visibleEdges = useMemo(() => {
    if (!showOnlyMain) return edges
    // Keep only edges where both source and target are in visibleNodes
    const visibleIds = new Set(visibleNodes.map((n) => n.id))
    return edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
  }, [edges, visibleNodes, showOnlyMain])

  const onPaneClick = useCallback(() => selectStep(null), [selectStep])

  // ── No workflow ───────────────────────────────────────────────
  if (!dsl) {
    return (
      <div style={{ width: '100%', height: '100%' }}
        className="flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">⬡</div>
          <h2 className="text-xl font-bold text-gray-700 mb-2">No Workflow Loaded</h2>
          <p className="text-gray-500 text-sm mb-4">
            Import an XML file or start a new workflow from scratch.
          </p>
          <button
            onClick={() => useWorkflowStore.getState().resetDSL()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            Start New Workflow
          </button>
        </div>
      </div>
    )
  }

  // ── Canvas ───────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={visibleNodes}
        edges={visibleEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={onPaneClick}
        onInit={(instance) => { rfInstance.current = instance }}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.15}
        maxZoom={2}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        attributionPosition="bottom-right"
      >
        <Background gap={20} color="#e5e7eb" size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === 'formNode')           return '#3b82f6'
            if (n.type === 'decisionUserNode')   return '#f59e0b'
            if (n.type === 'decisionSistemNode') return '#a855f7'
            if (n.type === 'systemActionNode')   return '#14b8a6'
            return '#6b7280'
          }}
          maskColor="rgba(249,250,251,0.7)"
          style={{ background: 'white', border: '1px solid #e5e7eb' }}
        />
      </ReactFlow>

      {/* ── Top-left overlay: info + controls ─────────────────── */}
      <div className="absolute top-3 left-3 flex flex-col gap-2 z-10 pointer-events-none">

        {/* Workflow info badge */}
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm pointer-events-none">
          <span className="text-xs text-gray-600">
            <span className="font-bold text-gray-800">{dsl.process.steps.length}</span> steps
            {' · '}
            <span className="font-bold text-gray-800">{dsl.process.variables.length}</span> vars
            {' · '}
            <span className="font-bold text-gray-800">{dsl.process.roles.length}</span> roles
          </span>
        </div>

        {/* Collapse toggle — only shown for complex workflows */}
        {graphMeta.isComplex && (
          <button
            onClick={() => setShowOnlyMain((v) => !v)}
            className={`
              pointer-events-auto text-xs font-medium px-3 py-1.5 rounded-lg border shadow-sm transition-colors
              ${showOnlyMain
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}
            `}
          >
            {showOnlyMain ? '◉ Main path only' : '○ Show all paths'}
          </button>
        )}
      </div>

      {/* ── Bottom-left legend ────────────────────────────────── */}
      <div className="absolute bottom-8 left-3 z-10 pointer-events-none">
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg px-3 py-2 shadow-sm space-y-1.5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Legend</p>

          {/* Node types */}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-blue-500 shrink-0" />
            <span className="text-xs text-gray-600">Form</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-amber-400 shrink-0" />
            <span className="text-xs text-gray-600">User Decision</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-purple-500 shrink-0" />
            <span className="text-xs text-gray-600">System Check</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-teal-500 shrink-0" />
            <span className="text-xs text-gray-600">System Action</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-500 shrink-0" />
            <span className="text-xs text-gray-600">End</span>
          </div>

          {/* Edge types */}
          <div className="border-t border-gray-100 pt-1.5 mt-1.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#15803d" strokeWidth="2.5" /></svg>
              <span className="text-xs text-gray-600">Main path</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#22c55e" strokeWidth="1.5" /></svg>
              <span className="text-xs text-gray-600">Approve</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="24" height="10">
                <line x1="0" y1="5" x2="24" y2="5" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="5 3" />
              </svg>
              <span className="text-xs text-gray-600">Reject</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="24" height="10">
                <line x1="0" y1="5" x2="24" y2="5" stroke="#d97706" strokeWidth="1.5" strokeDasharray="4 4" />
              </svg>
              <span className="text-xs text-gray-600">Rollback</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
