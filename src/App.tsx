import { useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { KeyboardShortcutsModal } from './components/shared/KeyboardShortcutsModal'
import { FileDropZone } from './components/ingestion/FileDropZone'
import { Timeline } from './components/timeline/Timeline'
import { LogViewer } from './components/logs/LogViewer'
import { ClusteringView } from './components/clustering/ClusteringView'
import { AnomalyList } from './components/anomaly/AnomalyList'
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation'
import useStore from './store'

function PanelContent() {
  const activePanel = useStore((s) => s.ui.activePanel)
  const ingestionStatus = useStore((s) => s.ingestion.status)

  if (ingestionStatus === 'idle') {
    return <FileDropZone />
  }

  if (activePanel === 'timeline') return <Timeline />
  if (activePanel === 'logs') return <LogViewer />
  if (activePanel === 'clusters') return <ClusteringView />
  if (activePanel === 'anomalies') return <AnomalyList />
  return null
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

  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault()
    document.addEventListener('dragover', prevent)
    document.addEventListener('drop', prevent)
    return () => {
      document.removeEventListener('dragover', prevent)
      document.removeEventListener('drop', prevent)
    }
  }, [])

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
