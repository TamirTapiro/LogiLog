import { useRef, useCallback, useSyncExternalStore } from 'react'
import * as Comlink from 'comlink'
import type { ContextWorker } from '../workers/context.worker'
import useStore from '../store'
import type { LogEntry } from '../types/log.types'

interface ContextWorkerState {
  isRunning: boolean
  error: string | null
}

const initialState: ContextWorkerState = { isRunning: false, error: null }

export function useContextWorker() {
  const stateRef = useRef<ContextWorkerState>(initialState)
  const listenersRef = useRef<Set<() => void>>(new Set())
  const workerRef = useRef<Worker | null>(null)
  const apiRef = useRef<Comlink.Remote<ContextWorker> | null>(null)

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
    (patch: Partial<ContextWorkerState>) => {
      stateRef.current = { ...stateRef.current, ...patch }
      notify()
    },
    [notify],
  )

  const getOrCreateWorker = useCallback((): Comlink.Remote<ContextWorker> => {
    if (!apiRef.current) {
      workerRef.current = new Worker(new URL('../workers/context.worker.ts', import.meta.url), {
        type: 'module',
      })
      apiRef.current = Comlink.wrap<ContextWorker>(workerRef.current)
    }
    return apiRef.current
  }, [])

  const extractContext = useCallback(
    async (
      anchorLogId: number,
      allLogs: LogEntry[],
      embeddings: Map<number, Float32Array>,
      anomalyScore: number,
    ) => {
      setState({ isRunning: true, error: null })

      try {
        const api = getOrCreateWorker()
        const result = await api.extractContext(anchorLogId, allLogs, embeddings, anomalyScore)
        useStore.getState().addSmartContext(anchorLogId, result)
        setState({ isRunning: false })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setState({ isRunning: false, error: msg })
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

  return { state, extractContext, terminate }
}
