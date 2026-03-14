import { useRef, useCallback, useSyncExternalStore } from 'react'
import * as Comlink from 'comlink'
import type { InferenceWorker, WorkerProgressEvent } from '../workers/inference.worker'
import useStore from '../store'

interface InferenceWorkerState {
  isReady: boolean
  isRunning: boolean
  error: string | null
}

const initialState: InferenceWorkerState = { isReady: false, isRunning: false, error: null }

export function useInferenceWorker() {
  const stateRef = useRef<InferenceWorkerState>(initialState)
  const listenersRef = useRef<Set<() => void>>(new Set())
  const workerRef = useRef<Worker | null>(null)
  const apiRef = useRef<Comlink.Remote<InferenceWorker> | null>(null)

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
    (patch: Partial<InferenceWorkerState>) => {
      stateRef.current = { ...stateRef.current, ...patch }
      notify()
    },
    [notify],
  )

  const getOrCreateWorker = useCallback((): Comlink.Remote<InferenceWorker> => {
    if (!apiRef.current) {
      workerRef.current = new Worker(new URL('../workers/inference.worker.ts', import.meta.url), {
        type: 'module',
      })
      apiRef.current = Comlink.wrap<InferenceWorker>(workerRef.current)
    }
    return apiRef.current
  }, [])

  const checkReady = useCallback(async () => {
    const api = getOrCreateWorker()
    const ready = await api.isReady()
    setState({ isReady: ready })
    return ready
  }, [getOrCreateWorker, setState])

  const embedLogs = useCallback(
    async (messages: string[]) => {
      setState({ isRunning: true, error: null })
      useStore.getState().setAnalysisStatus('analyzing')

      try {
        const api = getOrCreateWorker()
        const embeddings = await api.embed(
          messages,
          Comlink.proxy((_: WorkerProgressEvent) => {
            // progress update — could update store if needed
          }),
        )
        setState({ isRunning: false })
        return embeddings
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setState({ isRunning: false, error: msg })
        useStore.getState().setAnalysisStatus('error')
        return null
      }
    },
    [getOrCreateWorker, setState],
  )

  const terminate = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    apiRef.current = null
    setState({ isReady: false, isRunning: false })
  }, [setState])

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return { state, checkReady, embedLogs, terminate }
}
