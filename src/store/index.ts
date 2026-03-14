import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { createIngestionSlice, type IngestionSlice } from './slices/ingestion.slice'
import { createLogsSlice, type LogsSlice } from './slices/logs.slice'
import { createAnalysisSlice, type AnalysisSlice } from './slices/analysis.slice'
import { createUiSlice, type UiSlice } from './slices/ui.slice'

export type StoreState = IngestionSlice & LogsSlice & AnalysisSlice & UiSlice

const useStore = create<StoreState>()(
  devtools(
    (...a) => ({
      ...createIngestionSlice(...a),
      ...createLogsSlice(...a),
      ...createAnalysisSlice(...a),
      ...createUiSlice(...a),
    }),
    {
      name: 'LogiLog',
      enabled: import.meta.env.DEV,
    },
  ),
)

export default useStore
