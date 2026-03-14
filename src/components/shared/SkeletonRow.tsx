import styles from './SkeletonRow.module.css'

interface SkeletonRowProps {
  height?: number
  width?: string
}

export function SkeletonRow({ height = 40, width = '100%' }: SkeletonRowProps) {
  return <div className={styles.skeleton} style={{ height, width }} aria-hidden="true" />
}
