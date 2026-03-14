import type { StateCreator } from 'zustand'
import type { IngestionState } from '../../types/store.types'

export interface IngestionSlice {
  ingestion: IngestionState
  startIngestion: (fileName: string, fileSizeBytes: number) => void
  updateProgress: (parsedLines: number, totalLines?: number) => void
  finishIngestion: (totalLines: number) => void
  resetIngestion: () => void
  setIngestionError: (error: string) => void
}

const initialIngestionState: IngestionState = {
  status: 'idle',
  fileName: null,
  fileSizeBytes: null,
  totalLines: null,
  parsedLines: 0,
  progress: 0,
  error: null,
}

export const createIngestionSlice: StateCreator<IngestionSlice> = (set) => ({
  ingestion: initialIngestionState,

  startIngestion: (fileName, fileSizeBytes) =>
    set((state) => ({
      ingestion: {
        ...state.ingestion,
        status: 'loading',
        fileName,
        fileSizeBytes,
        parsedLines: 0,
        progress: 0,
        error: null,
      },
    })),

  updateProgress: (parsedLines, totalLines) =>
    set((state) => ({
      ingestion: {
        ...state.ingestion,
        status: 'parsing',
        parsedLines,
        totalLines: totalLines ?? state.ingestion.totalLines,
        progress:
          totalLines != null && totalLines > 0
            ? parsedLines / totalLines
            : state.ingestion.progress,
      },
    })),

  finishIngestion: (totalLines) =>
    set((state) => ({
      ingestion: {
        ...state.ingestion,
        status: 'done',
        totalLines,
        parsedLines: totalLines,
        progress: 1,
      },
    })),

  resetIngestion: () =>
    set(() => ({
      ingestion: initialIngestionState,
    })),

  setIngestionError: (error) =>
    set((state) => ({
      ingestion: {
        ...state.ingestion,
        status: 'error',
        error,
      },
    })),
})
