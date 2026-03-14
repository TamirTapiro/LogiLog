import { useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { KeyboardShortcutsModal } from './components/shared/KeyboardShortcutsModal'
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation'
import useStore from './store'
import type { ActivePanel } from './types/store.types'

const PANEL_LABELS: Record<ActivePanel, string> = {
  timeline: 'Timeline',
  logs: 'Log Viewer',
  clusters: 'Clusters',
  anomalies: 'Anomalies',
}

function PanelContent() {
  const activePanel = useStore((s) => s.ui.activePanel)
  const label = PANEL_LABELS[activePanel]

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-muted)',
        fontSize: 'var(--font-size-sm)',
      }}
    >
      {label}
    </div>
  )
}

function App() {
  const { showShortcuts, setShowShortcuts } = useKeyboardNavigation()
  const ingestionStatus = useStore((s) => s.ingestion.status)
  const ingestionError = useStore((s) => s.ingestion.error)
  const ingestionProgress = useStore((s) => s.ingestion.progress)
  const analysisStatus = useStore((s) => s.analysis.analysisStatus)
  const fileName = useStore((s) => s.ingestion.fileName)

  useEffect(() => {
    if (fileName) {
      document.title = `${fileName} — LogiLog`
    } else {
      document.title = 'LogiLog'
    }
  }, [fileName])

  let statusMessage = ''
  if (ingestionStatus === 'error') {
    statusMessage = `Error: ${ingestionError ?? 'Unknown error'}`
  } else if (ingestionStatus === 'loading') {
    statusMessage = 'Opening file'
  } else if (ingestionStatus === 'parsing') {
    statusMessage = `Parsing log file: ${Math.round(ingestionProgress * 100)}%`
  } else if (analysisStatus === 'embedding') {
    statusMessage = 'Loading analysis model'
  } else if (analysisStatus === 'analyzing') {
    statusMessage = `Analyzing: ${Math.round(ingestionProgress * 100)}%`
  } else if (ingestionStatus === 'done' && analysisStatus === 'done') {
    statusMessage = 'Analysis complete'
  }

  return (
    <ErrorBoundary>
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
        }}
      >
        {statusMessage}
      </div>
      <AppShell>
        <PanelContent />
      </AppShell>
      <KeyboardShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </ErrorBoundary>
  )
}

export default App
