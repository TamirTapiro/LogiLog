import { useRef, useCallback, useSyncExternalStore } from 'react'
import * as Comlink from 'comlink'
import type { AnalysisWorker } from '../workers/analysis.worker'
import useStore from '../store'

interface AnalysisWorkerState {
  isRunning: boolean
  error: string | null
}

const initialState: AnalysisWorkerState = { isRunning: false, error: null }

export function useAnalysisWorker() {
  const stateRef = useRef<AnalysisWorkerState>(initialState)
  const listenersRef = useRef<Set<() => void>>(new Set())
  const workerRef = useRef<Worker | null>(null)
  const apiRef = useRef<Comlink.Remote<AnalysisWorker> | null>(null)

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  const getSnapshot = useCallback(() => stateRef.current, [])

  const notify = useCallback(() => {
    listenersRef.current.forEach((l) => l())
  }, [])

  const setState = useCallback(
    (patch: Partial<AnalysisWorkerState>) => {
      stateRef.current = { ...stateRef.current, ...patch }
      notify()
    },
    [notify],
  )

  const getOrCreateWorker = useCallback((): Comlink.Remote<AnalysisWorker> => {
    if (!apiRef.current) {
      workerRef.current = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), {
        type: 'module',
      })
      apiRef.current = Comlink.wrap<AnalysisWorker>(workerRef.current)
    }
    return apiRef.current
  }, [])

  const runAnalysis = useCallback(
    async (ids: number[], vectors: Float32Array[], messages: string[]) => {
      setState({ isRunning: true, error: null })
      useStore.getState().setAnalysisStatus('analyzing')

      try {
        const api = getOrCreateWorker()

        const [anomalies, clusters] = await Promise.all([
          api.scoreAnomalies(vectors, ids),
          api.cluster(vectors, ids, messages),
        ])

        useStore.getState().setAnomalies(anomalies)
        useStore.getState().setClusters(clusters)
        useStore.getState().setAnalysisStatus('done')
        setState({ isRunning: false })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setState({ isRunning: false, error: msg })
        useStore.getState().setAnalysisStatus('error')
      }
    },
    [getOrCreateWorker, setState],
  )

  const terminate = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    apiRef.current = null
    setState({ isRunning: false })
  }, [setState])

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return { state, runAnalysis, terminate }
}
