import { useState } from 'react'
import { Toolbar } from './components/Toolbar'
import { WorkflowCanvas } from './components/WorkflowCanvas'
import { Sidebar } from './components/Sidebar'
import { FormBuilder } from './components/FormBuilder/FormBuilder'
import { MonitoringPage } from './pages/MonitoringPage'
import { DashboardPage } from './pages/DashboardPage'
import { SettingsModal } from './components/settings/SettingsModal'
import { useWorkflowStore } from './store/workflow-store'

type LeftTab = 'dashboard' | 'canvas' | 'variables' | 'monitor'

export default function App() {
  const dsl                  = useWorkflowStore((s) => s.dsl)
  const activeDefinitionId   = useWorkflowStore((s) => s.activeDefinitionId)
  const [leftTab, setLeftTab]         = useState<LeftTab>('dashboard')
  const [monitorHighlight, setMonitorHighlight] = useState<number | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const tabs: { id: LeftTab; label: string; dot?: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    ...(dsl ? [
      { id: 'canvas'    as LeftTab, label: 'Canvas' },
      { id: 'variables' as LeftTab, label: 'Variables' },
    ] : []),
    { id: 'monitor', label: 'Monitor', dot: 'text-green-500' },
  ]

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <Toolbar onOpenSettings={() => setShowSettings(true)} activeTab={leftTab} />

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-white px-4 gap-1 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setLeftTab(tab.id)}
            className={`
              px-4 py-2 text-xs font-semibold uppercase tracking-wide border-b-2 -mb-px transition-colors
              ${leftTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'}
            `}
          >
            {tab.label}
            {tab.dot && <span className={`ml-1 text-xs ${tab.dot}`}>●</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main area — h-full ensures child height:100% resolves correctly */}
        <div className="flex-1 h-full overflow-hidden">
          {leftTab === 'dashboard' && <DashboardPage onNavigate={(tab) => setLeftTab(tab as LeftTab)} />}
          {leftTab === 'canvas'    && <WorkflowCanvas monitorHighlightStep={monitorHighlight} />}
          {leftTab === 'variables' && dsl && <FormBuilder />}
          {leftTab === 'monitor'   && (
            <MonitoringPage
              filterDefinitionId={activeDefinitionId ?? undefined}
              onHighlightStep={(n) => { setMonitorHighlight(n) }}
            />
          )}
        </div>

        {/* Right sidebar — only on canvas tab with workflow loaded */}
        {dsl && leftTab === 'canvas' && <Sidebar />}
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
