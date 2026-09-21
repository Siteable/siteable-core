import { useState } from 'react'
import { toast } from 'sonner'

/**
 * Gemini API Key FieldGroup — BYOK (bring-your-own-key) input with show/hide and a
 * live validation button that pings the Google Gemini REST API.
 *
 * Extracted from src/routes/Settings.tsx ApiPanel (Gemini FieldGroup only).
 * - Local state for show/hide + testing in-flight flag.
 * - Persists the key in localStorage under `openpage-gemini-key`; cleared when empty.
 * - Validates by GET https://generativelanguage.googleapis.com/v1beta/models?key=...
 * - `toast` (sonner) is the only external dependency preserved from the inline source.
 */
export function GeminiKeyInputField() {
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('openpage-gemini-key') || '')
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)

  function handleKeyChange(value: string) {
    setGeminiKey(value)
    if (value) {
      localStorage.setItem('openpage-gemini-key', value)
    } else {
      localStorage.removeItem('openpage-gemini-key')
    }
  }

  async function handleTest() {
    if (!geminiKey) return
    setTesting(true)
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`,
      )
      if (res.ok) {
        toast.success('API key is valid')
      } else {
        toast.error(`Invalid key: ${res.status}`)
      }
    } catch {
      toast.error('Connection failed')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="mb-5">
      <label className="block text-[11.5px] text-text-2 mb-1.5 font-medium">
        Gemini API Key
      </label>
      <div className="flex gap-2">
        <input
          type={showKey ? 'text' : 'password'}
          value={geminiKey}
          placeholder="AIza..."
          onChange={(e) => handleKeyChange(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg border border-border-default bg-bg-2 text-text-0 text-[13px] outline-none focus:border-green placeholder:text-text-3 transition-colors font-mono"
        />
        <button
          type="button"
          onClick={() => setShowKey(!showKey)}
          className="px-3 py-2 rounded-lg border border-border-default bg-bg-2 text-text-2 text-[12px] hover:text-text-0 hover:bg-bg-3 transition-colors shrink-0"
        >
          {showKey ? 'Hide' : 'Show'}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={!geminiKey || testing}
          className="px-3 py-2 rounded-lg bg-green/10 text-green text-[12px] font-medium hover:bg-green/20 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {testing ? 'Testing...' : 'Test'}
        </button>
      </div>
      <p className="text-[11px] text-text-3 mt-1.5">
        Used for client-side AI generation. Get one at{' '}
        <span className="text-text-2">aistudio.google.com</span>
      </p>
    </div>
  )
}
