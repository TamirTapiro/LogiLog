import { type ReactNode } from 'react'
import useStore from '../../store'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import styles from './AppShell.module.css'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const sidebarOpen = useStore((s) => s.ui.sidebarOpen)

  return (
    <div className={`${styles.appShell} ${sidebarOpen ? '' : styles.collapsed}`}>
      <Sidebar />
      <main className={styles.main}>{children}</main>
      <StatusBar />
    </div>
  )
}
