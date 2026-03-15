import { lazy, Suspense, useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { KeyboardShortcutsModal } from './components/shared/KeyboardShortcutsModal'
import { FileDropZone } from './components/ingestion/FileDropZone'
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation'
import { useAnalysisPipeline } from './hooks/useAnalysisPipeline'
import useStore from './store'

const Timeline = lazy(() =>
  import('./components/timeline/Timeline').then((m) => ({ default: m.Timeline })),
)
const LogViewer = lazy(() =>
  import('./components/logs/LogViewer').then((m) => ({ default: m.LogViewer })),
)
const ClusteringView = lazy(() =>
  import('./components/clustering/ClusteringView').then((m) => ({ default: m.ClusteringView })),
)
const AnomalyList = lazy(() =>
  import('./components/anomaly/AnomalyList').then((m) => ({ default: m.AnomalyList })),
)
const ForensicsView = lazy(() =>
  import('./components/forensics/ForensicsView').then((m) => ({ default: m.ForensicsView })),
)

function PanelContent() {
  const activePanel = useStore((s) => s.ui.activePanel)
  const ingestionStatus = useStore((s) => s.ingestion.status)

  if (ingestionStatus === 'idle') {
    return <FileDropZone />
  }

  return (
    <Suspense fallback={null}>
      {activePanel === 'timeline' && <Timeline />}
      {activePanel === 'logs' && <LogViewer />}
      {activePanel === 'clusters' && <ClusteringView />}
      {activePanel === 'anomalies' && <AnomalyList />}
      {activePanel === 'forensics' && <ForensicsView />}
    </Suspense>
  )
}

function App() {
  const { showShortcuts, setShowShortcuts } = useKeyboardNavigation()
  useAnalysisPipeline()
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
