import type { StateCreator } from 'zustand'
import type { UiState, ActivePanel } from '../../types/store.types'

export interface UiSlice {
  ui: UiState
  selectLog: (logId: number | null) => void
  setActivePanel: (panel: ActivePanel) => void
  setSearchQuery: (query: string) => void
  toggleSidebar: () => void
  setFocusedRowIndex: (index: number) => void
}

const initialUiState: UiState = {
  selectedLogId: null,
  activePanel: 'timeline',
  searchQuery: '',
  sidebarOpen: true,
  focusedRowIndex: 0,
}

export const createUiSlice: StateCreator<UiSlice> = (set) => ({
  ui: initialUiState,

  selectLog: (logId) =>
    set((state) => ({
      ui: {
        ...state.ui,
        selectedLogId: logId,
      },
    })),

  setActivePanel: (panel) =>
    set((state) => ({
      ui: {
        ...state.ui,
        activePanel: panel,
      },
    })),

  setSearchQuery: (query) =>
    set((state) => ({
      ui: {
        ...state.ui,
        searchQuery: query,
      },
    })),

  toggleSidebar: () =>
    set((state) => ({
      ui: {
        ...state.ui,
        sidebarOpen: !state.ui.sidebarOpen,
      },
    })),

  setFocusedRowIndex: (index) =>
    set((state) => ({
      ui: {
        ...state.ui,
        focusedRowIndex: index,
      },
    })),
})
