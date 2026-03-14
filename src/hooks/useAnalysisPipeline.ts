import { useEffect } from 'react'
import useStore from '../store'
import { useInferenceWorker } from './useInferenceWorker'
import { useAnalysisWorker } from './useAnalysisWorker'

export function useAnalysisPipeline() {
  const { embedLogs } = useInferenceWorker()
  const { runAnalysis } = useAnalysisWorker()
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
    })()
  }, [ingestionStatus, analysisStatus, embedLogs, runAnalysis])
}
