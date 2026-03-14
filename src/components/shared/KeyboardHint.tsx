import styles from './KeyboardHint.module.css'

interface KeyboardHintProps {
  keys: string[]
}

export function KeyboardHint({ keys }: KeyboardHintProps) {
  return (
    <span className={styles.hint}>
      {keys.map((key, i) => (
        <span key={key} className={styles.keyWrapper}>
          {i > 0 && <span className={styles.separator}>+</span>}
          <kbd className={styles.key}>{key}</kbd>
        </span>
      ))}
    </span>
  )
}
