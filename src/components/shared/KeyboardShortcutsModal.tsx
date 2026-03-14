import { useEffect, useRef } from 'react'
import { KeyboardHint } from './KeyboardHint'
import styles from './KeyboardShortcutsModal.module.css'

interface ShortcutEntry {
  keys: string[]
  description: string
}

interface ShortcutSection {
  title: string
  shortcuts: ShortcutEntry[]
}

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Log Navigation',
    shortcuts: [
      { keys: ['j'], description: 'Next log row' },
      { keys: ['k'], description: 'Previous log row' },
      { keys: ['g'], description: 'Jump to first row' },
      { keys: ['G'], description: 'Jump to last row' },
      { keys: ['Enter'], description: 'Select focused row' },
    ],
  },
  {
    title: 'Anomaly Navigation',
    shortcuts: [
      { keys: ['n'], description: 'Next anomaly' },
      { keys: ['N'], description: 'Previous anomaly' },
    ],
  },
  {
    title: 'Search',
    shortcuts: [
      { keys: ['/'], description: 'Focus search input' },
      { keys: ['Esc'], description: 'Clear search and close panel' },
    ],
  },
  {
    title: 'Panels',
    shortcuts: [
      { keys: ['1'], description: 'Timeline view' },
      { keys: ['2'], description: 'Log Viewer' },
      { keys: ['3'], description: 'Clusters' },
      { keys: ['4'], description: 'Anomalies' },
      { keys: ['5'], description: 'AI Forensics' },
    ],
  },
  {
    title: 'General',
    shortcuts: [{ keys: ['?'], description: 'Toggle this shortcuts overlay' }],
  },
]

interface KeyboardShortcutsModalProps {
  open: boolean
  onClose: () => void
}

export function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  // Focus the close button when the modal opens
  useEffect(() => {
    if (open) {
      closeBtnRef.current?.focus()
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [open, onClose])

  if (!open) return null

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={handleBackdropClick}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>Keyboard Shortcuts</span>
          <button
            ref={closeBtnRef}
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
          >
            Esc
          </button>
        </div>

        {SHORTCUT_SECTIONS.map((section) => (
          <div key={section.title} className={styles.section}>
            <div className={styles.sectionTitle}>{section.title}</div>
            <div className={styles.table} role="table" aria-label={section.title}>
              {section.shortcuts.map((shortcut) => (
                <div key={shortcut.description} className={styles.row} role="row">
                  <div className={styles.keys} role="cell">
                    <KeyboardHint keys={shortcut.keys} />
                  </div>
                  <div className={styles.desc} role="cell">
                    {shortcut.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className={styles.footer}>shortcuts disabled when a text input is focused</div>
      </div>
    </div>
  )
}
