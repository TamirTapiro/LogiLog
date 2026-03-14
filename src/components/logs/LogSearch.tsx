import { useRef, useEffect, useState } from 'react'
import useStore from '../../store'
import styles from './LogSearch.module.css'

export function LogSearch() {
  const searchQuery = useStore((s) => s.ui.searchQuery)
  const setSearchQuery = useStore((s) => s.setSearchQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  const [regexMode, setRegexMode] = useState(false)
  const [filterMode, setFilterMode] = useState<'filter' | 'highlight'>('filter')

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '/') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setSearchQuery('')
      inputRef.current?.blur()
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    let value = e.target.value
    if (regexMode && value && !value.startsWith('/')) {
      value = `/${value}/`
    }
    setSearchQuery(value)
  }

  return (
    <div className={styles.container}>
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        placeholder={regexMode ? '/pattern/flags' : 'Search logs… (/ to focus)'}
        value={searchQuery}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-label="Search logs"
      />
      <button
        className={`${styles.toggle} ${regexMode ? styles.active : ''}`}
        onClick={() => setRegexMode((v) => !v)}
        title="Toggle regex mode"
        aria-pressed={regexMode}
      >
        /.*/
      </button>
      <button
        className={`${styles.toggle} ${filterMode === 'filter' ? styles.active : ''}`}
        onClick={() => setFilterMode((v) => (v === 'filter' ? 'highlight' : 'filter'))}
        title="Toggle filter vs highlight"
        aria-pressed={filterMode === 'filter'}
      >
        {filterMode === 'filter' ? 'Filter' : 'Highlight'}
      </button>
    </div>
  )
}
