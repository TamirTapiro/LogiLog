import { useRef, useCallback, useSyncExternalStore } from 'react'
import * as Comlink from 'comlink'
import type { ParseWorkerAPI } from '../workers/parse.worker'
import { openLogFile } from '../lib/fileSystemAccess'
import useStore from '../store'

interface IngestionWorkerState {
  isActive: boolean
  error: string | null
}

const initialState: IngestionWorkerState = { isActive: false, error: null }

export function useFileIngestion() {
  const stateRef = useRef<IngestionWorkerState>(initialState)
  const listenersRef = useRef<Set<() => void>>(new Set())
  const workerRef = useRef<Worker | null>(null)
  const apiRef = useRef<Comlink.Remote<ParseWorkerAPI> | null>(null)

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener)
    return () => listenersRef.current.delete(listener)
  }, [])

  const getSnapshot = useCallback(() => stateRef.current, [])

  const notify = useCallback(() => {
    listenersRef.current.forEach((l) => l())
  }, [])

  const setState = useCallback(
    (patch: Partial<IngestionWorkerState>) => {
      stateRef.current = { ...stateRef.current, ...patch }
      notify()
    },
    [notify],
  )

  const getOrCreateWorker = useCallback((): Comlink.Remote<ParseWorkerAPI> => {
    if (!apiRef.current) {
      workerRef.current = new Worker(new URL('../workers/parse.worker.ts', import.meta.url), {
        type: 'module',
      })
      apiRef.current = Comlink.wrap<ParseWorkerAPI>(workerRef.current)
    }
    return apiRef.current
  }, [])

  const ingestFile = useCallback(
    async (file: File) => {
      const store = useStore.getState()
      store.startIngestion(file.name, file.size)
      setState({ isActive: true, error: null })

      try {
        const api = getOrCreateWorker()

        await api.parseFile(
          file,
          Comlink.proxy((output) => {
            const s = useStore.getState()
            if (output.type === 'batch' && output.entries) {
              s.appendBatch(output.entries)
              s.updateProgress(output.totalParsed ?? 0)
            } else if (output.type === 'done') {
              s.finishIngestion(output.totalParsed ?? 0)
              setState({ isActive: false })
            } else if (output.type === 'error') {
              s.setIngestionError(output.error ?? 'Parse error')
              setState({ isActive: false, error: output.error ?? 'Parse error' })
            }
          }),
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        useStore.getState().setIngestionError(msg)
        setState({ isActive: false, error: msg })
      }
    },
    [getOrCreateWorker, setState],
  )

  const openFilePicker = useCallback(async () => {
    try {
      const file = await openLogFile()
      await ingestFile(file)
    } catch (err) {
      // User cancelled picker — not an error
      if (err instanceof Error && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : String(err)
      setState({ error: msg })
    }
  }, [ingestFile, setState])

  const cancel = useCallback(() => {
    apiRef.current?.cancel()
    setState({ isActive: false })
  }, [setState])

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return { state, ingestFile, openFilePicker, cancel }
}
