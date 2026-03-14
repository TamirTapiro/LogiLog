import { useEffect } from 'react'
import useStore from '../store'
import { useInferenceWorker } from './useInferenceWorker'
import { useAnalysisWorker } from './useAnalysisWorker'
import { useContextWorker } from './useContextWorker'
import { runAiForensics } from '../lib/forensicsAI'

export function useAnalysisPipeline() {
  const { embedLogs } = useInferenceWorker()
  const { runAnalysis } = useAnalysisWorker()
  const { extractContext } = useContextWorker()
  const ingestionStatus = useStore((s) => s.ingestion.status)
  const analysisStatus = useStore((s) => s.analysis.analysisStatus)

  // Reset analysis state when a new file starts loading
  useEffect(() => {
    if (ingestionStatus === 'loading') {
      useStore.getState().resetAnalysis()
    }
  }, [ingestionStatus])

  // Run the full analysis pipeline once ingestion completes
  useEffect(() => {
    if (ingestionStatus !== 'done') return
    if (analysisStatus !== 'idle') return

    const { entries } = useStore.getState().logs
    if (entries.length === 0) return

    const messages = entries.map((e) => e.message)
    const ids = entries.map((e) => e.id)

    void (async () => {
      const embeddings = await embedLogs(messages)
      if (!embeddings) return

      await runAnalysis(ids, embeddings, messages)

      // Build embedding map and extract context for the top anomaly
      const embeddingMap = new Map<number, Float32Array>()
      ids.forEach((id, i) => embeddingMap.set(id, embeddings[i]!))

      const { anomalies } = useStore.getState().analysis
      const top = anomalies[0]
      if (top) {
        const allLogs = useStore.getState().logs.entries
        await extractContext(top.logId, allLogs, embeddingMap, top.score)

        // Run AI forensics after context is ready
        const store = useStore.getState()
        const topLog = store.logs.entries.find((e) => e.id === top.logId)
        if (topLog) {
          store.setAiForensics(null, 'loading')
          try {
            const context = store.analysis.smartContexts[top.logId]
            const result = await runAiForensics({
              log: topLog,
              context,
              score: top.score,
              rank: top.rank,
              totalAnomalies: store.analysis.anomalies.length,
            })
            useStore.getState().setAiForensics(result, 'done')
          } catch (err) {
            const isNoKey = err instanceof Error && err.message === 'no-key'
            useStore.getState().setAiForensics(null, isNoKey ? 'no-key' : 'error')
          }
        }
      }
    })()
  }, [ingestionStatus, analysisStatus, embedLogs, runAnalysis, extractContext])
}
