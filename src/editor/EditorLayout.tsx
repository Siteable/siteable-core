import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { FolderOpen, Layers, Briefcase, UtensilsCrossed, Building2, BookOpen } from 'lucide-react'
import { CanvasToolbar } from './CanvasToolbar'
import { LeftSidebar } from './LeftSidebar'
import { Canvas } from './Canvas'
import { RightSidebar } from './RightSidebar'
import { JsonDrawer } from './JsonDrawer'
import { VersionHistory } from './VersionHistory'
import { GenerationOverlay } from './GenerationOverlay'
import { useConfigStore } from '@/store/configStore'
import { useEditorStore } from '@/store/editorStore'
import { generateSiteConfig } from '@/lib/generate-site'
import { templateMeta, buildTemplate } from '@/lib/templates'
import { hexToRgb } from '@/lib/theme-presets'
import type { SiteConfig } from '@/blocks/types'
import type { ExportSiteSettings } from '@/lib/export-html'

const templateIcons: Record<string, typeof Briefcase> = {
  Briefcase, UtensilsCrossed, Building2, BookOpen,
}

export interface EditorLayoutProps {
  onConfigChange?: (id: string, config: SiteConfig) => void
  onRename?: (id: string, name: string) => void
  onCreate?: (name: string) => string
  activeProject?: { name: string; settings?: ExportSiteSettings }
  onExit?: () => void
  onServerFallback?: (prompt: string, signal?: AbortSignal) => Promise<SiteConfig>
}

function useAutoSaveToProject(onConfigChange?: EditorLayoutProps['onConfigChange']) {
  const config = useConfigStore((s) => s.config)
  const activeProjectId = useEditorStore((s) => s.activeProjectId)
  const loadedConfigRef = useRef<string | null>(null)

  // Snapshot the config at load time so we can diff
  useEffect(() => {
    loadedConfigRef.current = JSON.stringify(config)
  }, [activeProjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeProjectId) return
    const serialized = JSON.stringify(config)
    // Only save when config actually differs from what was loaded
    if (serialized === loadedConfigRef.current) return
    onConfigChange?.(activeProjectId, config)
  }, [config, activeProjectId]) // eslint-disable-line react-hooks/exhaustive-deps
}

function useGenerationOrchestration(onConfigChange?: EditorLayoutProps['onConfigChange'], onRename?: EditorLayoutProps['onRename'], onServerFallback?: EditorLayoutProps['onServerFallback']) {
  const isGenerating = useEditorStore((s) => s.isGenerating)
  const generationPrompt = useEditorStore((s) => s.generationPrompt)
  const clearGeneration = useEditorStore((s) => s.clearGeneration)
  const setGenerationError = useEditorStore((s) => s.setGenerationError)
  const activeProjectId = useEditorStore((s) => s.activeProjectId)
  const setConfig = useConfigStore((s) => s.setConfig)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!isGenerating || !generationPrompt) return

    const controller = new AbortController()
    abortRef.current = controller

    // Timeout after 30s to prevent infinite loading
    const timeout = setTimeout(() => {
      controller.abort()
      setGenerationError('Generation timed out')
      toast.error('Generation timed out. Try again or add a Gemini API key in Settings.')
      clearGeneration()
    }, 30000)

    generateSiteConfig(generationPrompt, controller.signal, onServerFallback)
      .then(({ config, source }) => {
        clearTimeout(timeout)
        if (controller.signal.aborted) return
        setConfig(config)
        if (activeProjectId) {
          onConfigChange?.(activeProjectId, config)
          if (config.name) onRename?.(activeProjectId, config.name)
        }
        clearGeneration()
        if (source === 'template') {
          toast('Generated from template. Add a Gemini API key in Settings for AI generation.')
        }
      })
      .catch((err) => {
        clearTimeout(timeout)
        if (err instanceof Error && err.name === 'AbortError') return
        setGenerationError(err instanceof Error ? err.message : 'Generation failed')
        toast.error(err instanceof Error ? err.message : 'Generation failed')
        clearGeneration()
      })

    return () => {
      clearTimeout(timeout)
      controller.abort()
      abortRef.current = null
    }
  }, [isGenerating, generationPrompt]) // eslint-disable-line react-hooks/exhaustive-deps
}

function EditorEmptyState({ onCreate, onExit }: Pick<EditorLayoutProps, 'onCreate' | 'onExit'>) {
  const setConfig = useConfigStore((s) => s.setConfig)
  const setActiveProject = useEditorStore((s) => s.setActiveProject)

  function startFromTemplate(tplId: string, tplName: string) {
    const id = onCreate?.(tplName) ?? `local-${Date.now()}` // eslint-disable-line react-hooks/purity
    setActiveProject(id)
    setConfig(buildTemplate(tplId, tplName))
  }

  return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center text-center px-6 max-w-md">
        <div className="w-12 h-12 rounded-xl bg-bg-3 border border-border-default flex items-center justify-center mb-4">
          <FolderOpen size={20} className="text-text-3" />
        </div>
        <h2 className="text-[16px] font-display font-semibold text-text-1 mb-1">No project selected</h2>
        <p className="text-text-2 text-[13px] mb-6">Open a project from the Dashboard, or start from a template.</p>

        <button
          onClick={() => onExit?.()}
          className="px-5 py-2 rounded-xl bg-green text-black text-[13px] font-semibold hover:bg-green-dim active:scale-[0.97] transition-all mb-6"
        >
          Go to Dashboard
        </button>

        <div className="grid grid-cols-2 gap-2 w-full">
          {templateMeta.map((tpl) => {
            const rgb = hexToRgb(tpl.accent)
            const Icon = templateIcons[tpl.icon] || Layers
            return (
              <button
                key={tpl.id}
                onClick={() => startFromTemplate(tpl.id, tpl.name)}
                className="group relative bg-bg-1 border border-border-default rounded-lg p-3 text-left transition-all hover:border-border-hover card-lift hover:card-lift-hover active:scale-[0.97]"
              >
                <div
                  className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                  style={{ background: `rgba(${rgb}, 0.06)` }}
                />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div
                      className="w-6 h-6 rounded flex items-center justify-center shrink-0 transition-all opacity-70 group-hover:opacity-100 group-hover:scale-110"
                      style={{ background: `rgba(${rgb}, 0.12)`, color: tpl.accent }}
                    >
                      <Icon size={12} />
                    </div>
                    <div className="text-[11.5px] font-semibold text-text-0">{tpl.name}</div>
                  </div>
                  <div className="text-[10px] text-text-2 leading-snug mb-1.5">{tpl.description}</div>
                  <div className="text-[10px] text-text-3 flex items-center gap-1">
                    <Layers size={9} />
                    {tpl.blockCount} blocks
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function EditorLayout({ onConfigChange, onRename, onCreate, activeProject, onExit, onServerFallback }: EditorLayoutProps = {}) {
  useAutoSaveToProject(onConfigChange)
  useGenerationOrchestration(onConfigChange, onRename, onServerFallback)
  const previewMode = useEditorStore((s) => s.previewMode)
  const activeProjectId = useEditorStore((s) => s.activeProjectId)

  if (!activeProjectId) {
    return <EditorEmptyState onCreate={onCreate} onExit={onExit} />
  }

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex-1 flex overflow-hidden">
        {!previewMode && <LeftSidebar />}
        <div className="flex-1 flex flex-col min-w-0 relative">
          <CanvasToolbar activeProject={activeProject} onExit={onExit} />
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <Canvas />
            <JsonDrawer />
            <GenerationOverlay />
          </div>
        </div>
        {!previewMode && <RightSidebar />}
      </div>
      <VersionHistory />
    </div>
  )
}
