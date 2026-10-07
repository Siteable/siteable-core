import { useState, useRef, useEffect } from 'react'
import {
  Monitor,
  Tablet,
  Smartphone,
  Undo2,
  Redo2,
  Code,
  Clock,
  Eye,
  Plus,
  HelpCircle,
  Download,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useEditorStore, type Viewport } from '@/store/editorStore'
import { useConfigStore } from '@/store/configStore'
import type { PageConfig } from '@/blocks/types'
import { exportToHTML, downloadHTML, type ExportSiteSettings } from '@/lib/export-html'
import { isValidPagePath, slugifyPagePath } from '@/lib/page-path'

const viewports: { value: Viewport; icon: typeof Monitor; label: string }[] = [
  { value: 'desktop', icon: Monitor, label: 'Desktop' },
  { value: 'tablet', icon: Tablet, label: 'Tablet' },
  { value: 'mobile', icon: Smartphone, label: 'Mobile' },
]

function AddPagePopover({ onAdd, onClose, existingPaths }: {
  onAdd: (name: string, path: string) => void
  onClose: () => void
  existingPaths: string[]
}) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('/')
  // Whether the PATH is the auto-suggestion or something the user typed. This
  // is tracked as state rather than sniffed from the path's VALUE: sniffing
  // `path === '/'` meant the very first keystroke replaced `/` with `/c` and
  // the suggestion then froze on that first character, so typing
  // "Contact & Info" character by character suggested `/c`.
  const [pathEdited, setPathEdited] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    // The suggested default comes from the SAME rule-1 slugifier the exporter
    // applies, so the flow can never reject its own suggestion (SC-003).
    const cleanPath = path.trim() || slugifyPagePath(trimmed)
    // FR-003 — reject before the store, so a rejected path leaves the page list
    // untouched. Duplicate check is EXACT raw equality against existing paths
    // (spec-literal); the publish normalizer resolves anything looser.
    if (!isValidPagePath(cleanPath)) {
      setError('Use lowercase letters, numbers and dashes, up to 3 levels, e.g. /about')
      return
    }
    if (existingPaths.includes(cleanPath)) {
      setError(`A page already uses ${cleanPath}`)
      return
    }
    onAdd(trimmed, cleanPath)
    onClose()
  }

  return (
    <div className="absolute top-full left-0 mt-1 bg-bg-2 border border-border-default rounded-lg p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-20 w-52">
      <div className="space-y-2">
        <div>
          <label htmlFor="add-page-name" className="block text-[10px] text-text-3 mb-0.5">Page name</label>
          <input
            id="add-page-name"
            ref={inputRef}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
              if (!pathEdited) setPath(slugifyPagePath(e.target.value))
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose() }}
            placeholder="About"
            className="w-full px-2 py-1.5 rounded border border-border-default bg-bg-3 text-text-0 text-[11.5px] outline-none focus:border-green"
          />
        </div>
        <div>
          {/* The error is only useful if it is attached to the field it is about,
              so the input gets a real label + description rather than relying on
              proximity. `role="alert"` already announces assertively; an explicit
              `aria-live` here would contradict it. */}
          <label htmlFor="add-page-path" className="block text-[10px] text-text-3 mb-0.5">Path</label>
          <input
            id="add-page-path"
            value={path}
            onChange={(e) => { setPath(e.target.value); setPathEdited(true); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose() }}
            placeholder="/about"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'add-page-path-error' : undefined}
            className="w-full px-2 py-1.5 rounded border border-border-default bg-bg-3 text-text-0 text-[11.5px] outline-none focus:border-green font-mono"
          />
          {error && (
            <p id="add-page-path-error" role="alert" className="text-status-red text-[10px] mt-1 leading-tight">
              {error}
            </p>
          )}
        </div>
        <button
          onClick={submit}
          disabled={!name.trim()}
          className="w-full py-1.5 rounded bg-green text-black text-[11px] font-semibold hover:bg-green-dim transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Add Page
        </button>
      </div>
    </div>
  )
}

function PageTab({ page, isActive, onClick, onRename, onDelete, canDelete }: {
  page: PageConfig
  isActive: boolean
  onClick: () => void
  onRename: (name: string) => void
  onDelete: () => void
  canDelete: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(page.name)
  const [showContext, setShowContext] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commitRename() {
    const trimmed = name.trim()
    if (trimmed && trimmed !== page.name) onRename(trimmed)
    else setName(page.name)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitRename()
          if (e.key === 'Escape') { setName(page.name); setEditing(false) }
        }}
        className="px-2 py-1 rounded text-xs bg-bg-3 border border-green outline-none w-20"
        onClick={(e) => e.stopPropagation()}
      />
    )
  }

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
        onContextMenu={(e) => { e.preventDefault(); setShowContext(true) }}
        className={`px-2 py-1 rounded text-xs transition-all ${
          isActive ? 'bg-bg-3 text-text-0' : 'text-text-3 hover:text-text-1 hover:bg-bg-2'
        }`}
        title={`${page.name} (${page.path})`}
      >
        {page.name}
      </button>
      {showContext && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowContext(false)} />
          <div className="absolute top-full left-0 mt-1 bg-bg-2 border border-border-default rounded-lg p-1 shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-20 min-w-[100px]">
            <button
              onClick={() => { setShowContext(false); setEditing(true) }}
              className="w-full text-left px-2.5 py-1.5 rounded text-[11px] text-text-1 hover:bg-bg-3 hover:text-text-0 transition-colors"
            >
              Rename
            </button>
            {canDelete && (
              <button
                onClick={() => { setShowContext(false); onDelete() }}
                className="w-full text-left px-2.5 py-1.5 rounded text-[11px] text-text-1 hover:bg-status-red/10 hover:text-status-red transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export interface CanvasToolbarProps {
  activeProject?: { name: string; settings?: ExportSiteSettings }
  onExit?: () => void
}

export function CanvasToolbar({ activeProject, onExit }: CanvasToolbarProps = {}) {
  const { viewport, setViewport, toggleJsonDrawer, jsonDrawerOpen, toggleHistory, togglePreview, toggleShortcutsModal, previewMode } = useEditorStore()
  const { undo, redo, canUndo, canRedo } = useConfigStore()
  const undoStack = useConfigStore((s) => s.undoStack)
  const redoStack = useConfigStore((s) => s.redoStack)
  const pages = useConfigStore((s) => s.config.pages) ?? []
  const activePageId = useConfigStore((s) => s.activePageId)
  const setActivePage = useConfigStore((s) => s.setActivePage)
  const addPage = useConfigStore((s) => s.addPage)
  const removePage = useConfigStore((s) => s.removePage)
  const renamePage = useConfigStore((s) => s.renamePage)
  const configName = useConfigStore((s) => s.config.name)
  const config = useConfigStore((s) => s.config)
  const [showAddPage, setShowAddPage] = useState(false)
  const [exporting, setExporting] = useState(false)

  const projectName = activeProject?.name || configName

  async function handleExport() {
    setExporting(true)
    try {
      const html = await exportToHTML(config, { settings: activeProject?.settings })
      const filename = `${(activeProject?.name || config.name || 'site').toLowerCase().replace(/\s+/g, '-')}.html`
      downloadHTML(html, filename)
      toast('HTML exported')
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="h-10 bg-bg-1 border-b border-border-default flex items-center px-3 gap-1">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-text-3 shrink-0">
        <span
          className="cursor-pointer hover:text-text-1 transition-colors"
          onClick={() => onExit?.()}
        >
          Projects
        </span>
        <span>/</span>
        <span className="text-text-0 font-medium max-w-[120px] truncate">{projectName}</span>
      </div>

      <div className="w-px h-5 bg-border-default mx-1.5 shrink-0" />

      {/* Page tabs */}
      <div className="flex items-center gap-0.5 relative overflow-x-auto">
        {pages.map((page) => (
          <PageTab
            key={page.id}
            page={page}
            isActive={activePageId === page.id}
            onClick={() => setActivePage(page.id)}
            onRename={(name) => renamePage(page.id, name)}
            onDelete={() => removePage(page.id)}
            canDelete={pages.length > 1}
          />
        ))}
        <div className="relative">
          <button
            onClick={() => setShowAddPage(!showAddPage)}
            className="w-6 h-6 rounded flex items-center justify-center text-text-3 hover:text-green hover:bg-bg-2 transition-all"
            title="Add page"
            aria-label="Add page"
          >
            <Plus size={12} />
          </button>
          {showAddPage && (
            <AddPagePopover
              onAdd={(name, path) => addPage(name, path)}
              onClose={() => setShowAddPage(false)}
              existingPaths={pages.map((p) => p.path)}
            />
          )}
        </div>
      </div>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-1 shrink-0">
        {/* Viewport toggle */}
        {viewports.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            title={label}
            aria-label={label}
            aria-pressed={viewport === value}
            onClick={() => setViewport(value)}
            className={`w-7 h-7 rounded flex items-center justify-center text-xs transition-all ${
              viewport === value
                ? 'bg-bg-3 text-text-0'
                : 'text-text-3 hover:text-text-1 hover:bg-bg-3'
            }`}
          >
            <Icon size={14} />
          </button>
        ))}

        <div className="w-px h-5 bg-border-default mx-1" />

        {/* Undo/Redo */}
        <button
          onClick={() => {
            const label = undoStack[undoStack.length - 1]?.label
            undo()
            if (label) toast(`Undo: ${label}`, { duration: 1500 })
          }}
          disabled={!canUndo()}
          className="w-7 h-7 rounded flex items-center justify-center text-text-3 hover:text-text-1 hover:bg-bg-3 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          title="Undo"
          aria-label="Undo"
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={() => {
            const label = redoStack[redoStack.length - 1]?.label
            redo()
            if (label) toast(`Redo: ${label}`, { duration: 1500 })
          }}
          disabled={!canRedo()}
          className="w-7 h-7 rounded flex items-center justify-center text-text-3 hover:text-text-1 hover:bg-bg-3 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          title="Redo"
          aria-label="Redo"
        >
          <Redo2 size={14} />
        </button>

        <div className="w-px h-5 bg-border-default mx-1" />

        {/* Preview toggle */}
        <button
          onClick={togglePreview}
          className={`h-7 px-2 rounded flex items-center gap-1 text-[11px] transition-all ${
            previewMode ? 'bg-green-glow text-green' : 'text-text-3 hover:text-text-1 hover:bg-bg-3'
          }`}
          title="Preview (P)"
          aria-label="Toggle preview mode"
          aria-pressed={previewMode}
        >
          <Eye size={13} />
          <span>Preview</span>
        </button>

        {/* JSON drawer toggle */}
        <button
          onClick={toggleJsonDrawer}
          className={`h-7 px-2 rounded flex items-center gap-1 text-[11px] transition-all ${
            jsonDrawerOpen ? 'bg-green-glow text-green' : 'text-text-3 hover:text-text-1 hover:bg-bg-3'
          }`}
          title="JSON (J)"
          aria-label="Toggle JSON drawer"
          aria-pressed={jsonDrawerOpen}
        >
          <Code size={13} />
          <span>JSON</span>
        </button>

        {/* History */}
        <button
          onClick={toggleHistory}
          className="h-7 px-2 rounded flex items-center gap-1 text-[11px] text-text-3 hover:text-text-1 hover:bg-bg-3 transition-all"
          title="History (H)"
          aria-label="Toggle version history"
        >
          <Clock size={13} />
          <span>History</span>
        </button>

        {/* Shortcuts help */}
        <button
          onClick={toggleShortcutsModal}
          className="w-7 h-7 rounded flex items-center justify-center text-text-3 hover:text-text-1 hover:bg-bg-3 transition-all"
          title="Keyboard shortcuts (?)"
          aria-label="Show keyboard shortcuts"
        >
          <HelpCircle size={14} />
        </button>

        <div className="w-px h-5 bg-border-default mx-1" />

        <button
          onClick={handleExport}
          disabled={exporting}
          className="h-7 px-3 rounded-lg bg-green text-bg-0 text-[11.5px] font-semibold hover:bg-green/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {exporting ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              <span>Exporting...</span>
            </>
          ) : (
            <>
              <Download size={12} />
              <span>Export</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
