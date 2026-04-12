import { useState, useEffect } from 'react'
import { useSettingsStore } from '../../store/settings-store'
import { pingBackend } from '../../services/apiClient'

interface Props {
  onClose: () => void
}

type PingState = 'idle' | 'testing' | 'ok' | 'fail'

export function SettingsModal({ onClose }: Props) {
  const { backendUrl, setBackendUrl } = useSettingsStore()
  const [draft, setDraft]         = useState(backendUrl)
  const [pingState, setPingState] = useState<PingState>('idle')
  const [pingMsg, setPingMsg]     = useState('')

  // Reset draft when modal opens
  useEffect(() => { setDraft(backendUrl) }, [backendUrl])

  const save = () => {
    setBackendUrl(draft.trim().replace(/\/$/, ''))
    onClose()
  }

  const test = async () => {
    const url = draft.trim().replace(/\/$/, '')
    setBackendUrl(url)   // apply before ping so getBackendBase() sees the new value
    setPingState('testing')
    setPingMsg('')
    const result = await pingBackend()
    if (result.reachable) {
      setPingState('ok')
      setPingMsg('Backend reachable')
    } else {
      setPingState('fail')
      setPingMsg(result.error ?? 'Unknown error')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center px-4 py-3 border-b border-gray-200">
          <span className="text-sm font-bold text-gray-800">Settings</span>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Backend URL */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
              Backend Base URL
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Spring Boot server address — no trailing slash.<br />
              Leave blank to use the same origin (e.g. behind a reverse proxy).
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setPingState('idle'); setPingMsg('') }}
                onKeyDown={(e) => e.key === 'Enter' && test()}
                placeholder="http://localhost:1235"
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm font-mono"
              />
              <button
                onClick={test}
                disabled={pingState === 'testing' || !draft.trim()}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap"
              >
                {pingState === 'testing' ? 'Testing…' : 'Test'}
              </button>
            </div>

            {/* Connection feedback */}
            {pingState === 'ok' && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-green-700">
                <span className="text-green-500">●</span>
                {pingMsg}
              </div>
            )}
            {pingState === 'fail' && (
              <div className="mt-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 space-y-1">
                <p className="font-semibold">Connection failed</p>
                <p>{pingMsg}</p>
                <p className="text-red-500">
                  Make sure the backend is running and has CORS configured for this origin.
                  The backend must be rebuilt after adding <code className="bg-red-100 px-0.5 rounded">WorkflowBuilderSecurityConfig.java</code>.
                </p>
              </div>
            )}
          </div>

          {/* Info box */}
          <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 space-y-1">
            <p className="font-semibold">Usage</p>
            <p>Used for: Monitoring, ticket management, publishing workflows.</p>
            <p>XML import/export works <strong>offline</strong> — no backend needed.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 pb-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
