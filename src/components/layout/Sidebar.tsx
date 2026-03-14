import useStore from '../../store'
import type { ActivePanel } from '../../types/store.types'
import { Spinner } from '../shared/Spinner'
import { Badge } from '../shared/Badge'
import styles from './Sidebar.module.css'

const NAV_ITEMS: Array<{ panel: ActivePanel; label: string; key: string }> = [
  { panel: 'timeline', label: 'Timeline', key: '1' },
  { panel: 'logs', label: 'Log Viewer', key: '2' },
  { panel: 'clusters', label: 'Clusters', key: '3' },
  { panel: 'anomalies', label: 'Anomalies', key: '4' },
  { panel: 'forensics', label: 'AI Forensics', key: '5' },
]

export function Sidebar() {
  const activePanel = useStore((s) => s.ui.activePanel)
  const sidebarOpen = useStore((s) => s.ui.sidebarOpen)
  const setActivePanel = useStore((s) => s.setActivePanel)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const analysisStatus = useStore((s) => s.analysis.analysisStatus)

  const modelReady = analysisStatus === 'done'
  const modelLoading = analysisStatus === 'embedding' || analysisStatus === 'analyzing'

  return (
    <aside className={`${styles.sidebar} ${sidebarOpen ? '' : styles.collapsed}`}>
      <div className={styles.wordmark}>LogiLog</div>
      <div className={styles.wordmarkShort}>LL</div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map(({ panel, label, key }) => (
          <button
            key={panel}
            className={`${styles.navItem} ${activePanel === panel ? styles.active : ''}`}
            onClick={() => setActivePanel(panel)}
          >
            <span className={styles.navKey}>[{key}]</span>
            <span className={styles.navLabel}>{label}</span>
          </button>
        ))}
      </nav>

      <div className={styles.modelStatus}>
        <span className={`${styles.statusDot} ${modelReady ? styles.ready : ''}`} />
        {modelLoading && <Spinner />}
        <span className={styles.modelStatusText}>
          {modelReady ? (
            <Badge color="var(--color-accent-green)">ready</Badge>
          ) : modelLoading ? (
            'loading model...'
          ) : (
            'model idle'
          )}
        </span>
      </div>

      <button
        className={styles.collapseBtn}
        onClick={toggleSidebar}
        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {sidebarOpen ? '◂' : '▸'}
      </button>
    </aside>
  )
}
