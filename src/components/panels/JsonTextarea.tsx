/**
 * JsonTextarea — editable JSON field with parse validation.
 * Stores the raw string locally while the user types;
 * only calls onChange when the JSON parses cleanly.
 */
import { useState, useEffect } from 'react'

interface Props {
  label: string
  value: Record<string, unknown> | null | undefined
  onChange: (parsed: Record<string, unknown>) => void
  placeholder?: string
  rows?: number
}

export function JsonTextarea({ label, value, onChange, placeholder, rows = 4 }: Props) {
  const serialized = value ? JSON.stringify(value, null, 2) : ''
  const [raw, setRaw]     = useState(serialized)
  const [error, setError] = useState<string | null>(null)

  // Sync when parent changes the value from outside (e.g. step switch)
  useEffect(() => {
    setRaw(value ? JSON.stringify(value, null, 2) : '')
    setError(null)
  }, [JSON.stringify(value)]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (text: string) => {
    setRaw(text)
    if (!text.trim()) {
      setError(null)
      return
    }
    try {
      const parsed = JSON.parse(text)
      if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
        setError('Must be a JSON object { … }')
        return
      }
      setError(null)
      onChange(parsed as Record<string, unknown>)
    } catch {
      setError('Invalid JSON')
    }
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
        {label}
      </label>
      <textarea
        value={raw}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder ?? '{ "key": "value" }'}
        rows={rows}
        spellCheck={false}
        className={`
          w-full border rounded px-2 py-1.5 text-xs font-mono resize-y
          focus:outline-none focus:ring-1
          ${error
            ? 'border-red-400 focus:ring-red-300'
            : 'border-gray-300 focus:ring-blue-400'}
        `}
      />
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  )
}
