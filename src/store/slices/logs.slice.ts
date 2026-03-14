import type { StateCreator } from 'zustand'
import type { LogsState } from '../../types/store.types'
import type { LogEntry } from '../../types/log.types'

export interface LogsSlice {
  logs: LogsState
  appendBatch: (entries: LogEntry[]) => void
  setFilter: (ids: number[] | null) => void
  clearLogs: () => void
}

const initialLogsState: LogsState = {
  entries: [],
  filteredIds: null,
}

export const createLogsSlice: StateCreator<LogsSlice> = (set) => ({
  logs: initialLogsState,

  appendBatch: (entries) =>
    set((state) => ({
      logs: {
        ...state.logs,
        entries: [...state.logs.entries, ...entries],
      },
    })),

  setFilter: (ids) =>
    set((state) => ({
      logs: {
        ...state.logs,
        filteredIds: ids,
      },
    })),

  clearLogs: () =>
    set(() => ({
      logs: initialLogsState,
    })),
})
