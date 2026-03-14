import { Component, ErrorInfo, ReactNode } from 'react'
import { AppShell } from './components/layout/AppShell'
import useStore from './store'
import type { ActivePanel } from './types/store.types'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[LogiLog] Uncaught error:', error, info)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div role="alert" style={{ padding: '2rem', fontFamily: 'monospace' }}>
          <h1>Something went wrong</h1>
          <pre>{this.state.error?.message}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

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
  return (
    <ErrorBoundary>
      <AppShell>
        <PanelContent />
      </AppShell>
    </ErrorBoundary>
  )
}

export default App
