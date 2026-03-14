import type { StateCreator } from 'zustand'
import type { AnalysisState, AiForensicsResult } from '../../types/store.types'
import type { AnomalyResult, ClusterResult, SmartContext } from '../../types/analysis.types'

export interface AnalysisSlice {
  analysis: AnalysisState
  setAnomalies: (anomalies: AnomalyResult[]) => void
  setClusters: (clusters: ClusterResult[]) => void
  addSmartContext: (logId: number, context: SmartContext) => void
  resetAnalysis: () => void
  setAnalysisStatus: (status: AnalysisState['analysisStatus']) => void
  setAiForensics: (
    result: AiForensicsResult | null,
    status: AnalysisState['aiForensicsStatus'],
  ) => void
}

const initialAnalysisState: AnalysisState = {
  anomalies: [],
  clusters: [],
  smartContexts: {},
  analysisStatus: 'idle',
  aiForensics: null,
  aiForensicsStatus: 'idle',
}

export const createAnalysisSlice: StateCreator<AnalysisSlice> = (set) => ({
  analysis: initialAnalysisState,

  setAnomalies: (anomalies) =>
    set((state) => ({
      analysis: {
        ...state.analysis,
        anomalies,
      },
    })),

  setClusters: (clusters) =>
    set((state) => ({
      analysis: {
        ...state.analysis,
        clusters,
      },
    })),

  addSmartContext: (logId, context) =>
    set((state) => ({
      analysis: {
        ...state.analysis,
        smartContexts: {
          ...state.analysis.smartContexts,
          [logId]: context,
        },
      },
    })),

  resetAnalysis: () =>
    set(() => ({
      analysis: initialAnalysisState,
    })),

  setAnalysisStatus: (analysisStatus) =>
    set((state) => ({
      analysis: {
        ...state.analysis,
        analysisStatus,
      },
    })),

  setAiForensics: (aiForensics, aiForensicsStatus) =>
    set((state) => ({
      analysis: {
        ...state.analysis,
        aiForensics,
        aiForensicsStatus,
      },
    })),
})
