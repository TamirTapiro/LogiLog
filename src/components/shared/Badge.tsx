import styles from './Badge.module.css'

interface BadgeProps {
  color?: string
  children: React.ReactNode
}

export function Badge({ color, children }: BadgeProps) {
  return (
    <span
      className={styles.badge}
      style={color ? { color, borderColor: color } : undefined}
    >
      {children}
    </span>
  )
}
