import { BarChart, Bar, XAxis, YAxis, Tooltip, Brush, ResponsiveContainer, Cell } from 'recharts'
import { useTimeline } from '../../hooks/useTimeline'
import { useVirtualLog } from '../../hooks/useVirtualLog'
import { BucketTooltip } from './TimelineBucket'
import styles from './Timeline.module.css'

export function Timeline() {
  const { buckets, containerRef } = useTimeline()
  const { scrollToIndex } = useVirtualLog()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleBarClick(data: any) {
    const idx = data?.activePayload?.[0]?.payload?.firstIndex
    if (idx !== undefined && idx >= 0) {
      scrollToIndex(idx)
    }
  }

  const chartData = buckets.map((b, i) => ({
    ...b,
    name: i,
    normalCount: b.count - b.anomalyCount,
  }))

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.chartWrapper} aria-label="Log timeline chart" role="img">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
            onClick={handleBarClick}
            style={{ cursor: 'pointer' }}
          >
            <XAxis dataKey="name" hide />
            <YAxis hide />
            <Tooltip content={<BucketTooltip />} />
            <Bar dataKey="normalCount" stackId="a" isAnimationActive={false}>
              {chartData.map((_, i) => (
                <Cell key={i} fill="var(--color-accent-green, #4ade80)" fillOpacity={0.3} />
              ))}
            </Bar>
            <Bar dataKey="anomalyCount" stackId="a" isAnimationActive={false}>
              {chartData.map((_, i) => (
                <Cell key={i} fill="var(--color-accent-red, #f87171)" fillOpacity={0.85} />
              ))}
            </Bar>
            <Brush
              dataKey="name"
              height={16}
              stroke="var(--color-border, #333)"
              fill="var(--color-bg-panel, #1a1a1a)"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
