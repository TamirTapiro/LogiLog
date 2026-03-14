import { useRef, useCallback, useSyncExternalStore } from 'react'
import * as Comlink from 'comlink'
import type { ParseWorker } from '../workers/parse.worker'
import useStore from '../store'

interface ParseWorkerState {
  isActive: boolean
  error: string | null
}

const initialState: ParseWorkerState = { isActive: false, error: null }

export function useParseWorker() {
  const stateRef = useRef<ParseWorkerState>(initialState)
  const listenersRef = useRef<Set<() => void>>(new Set())
  const workerRef = useRef<Worker | null>(null)
  const apiRef = useRef<Comlink.Remote<ParseWorker> | null>(null)

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
    (patch: Partial<ParseWorkerState>) => {
      stateRef.current = { ...stateRef.current, ...patch }
      notify()
    },
    [notify],
  )

  const getOrCreateWorker = useCallback((): Comlink.Remote<ParseWorker> => {
    if (!apiRef.current) {
      workerRef.current = new Worker(new URL('../workers/parse.worker.ts', import.meta.url), {
        type: 'module',
      })
      apiRef.current = Comlink.wrap<ParseWorker>(workerRef.current)
    }
    return apiRef.current
  }, [])

  const parseFile = useCallback(
    async (file: File) => {
      const { startIngestion, updateProgress, finishIngestion, setIngestionError } =
        useStore.getState()
      startIngestion(file.name, file.size)
      setState({ isActive: true, error: null })

      try {
        const api = getOrCreateWorker()

        await api.parseFile(
          file,
          Comlink.proxy((output) => {
            if (output.type === 'batch' && output.entries) {
              useStore.getState().appendBatch(output.entries.map((e) => ({ ...e })))
              updateProgress(output.totalParsed ?? 0)
            } else if (output.type === 'done') {
              finishIngestion(output.totalParsed ?? 0)
              setState({ isActive: false })
            } else if (output.type === 'error') {
              setIngestionError(output.error ?? 'Parse error')
              setState({ isActive: false, error: output.error ?? 'Parse error' })
            }
          }),
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setIngestionError(msg)
        setState({ isActive: false, error: msg })
      }
    },
    [getOrCreateWorker, setState],
  )

  const terminate = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    apiRef.current = null
    setState({ isActive: false })
  }, [setState])

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return { state, parseFile, terminate }
}
