import { create } from 'zustand';

interface IKnowledgeGraphState {
  focusedNodeId: string | null;
  /** EXCLUSIONS, not inclusions — an empty list means "show everything". */
  hiddenTypeIds: string[];
  searchQuery: string;
  autoRotate: boolean;
  showLegend: boolean;

  setFocusedNode: (nodeId: string | null) => void;
  toggleType: (typeNodeId: string) => void;
  showAllTypes: () => void;
  setSearchQuery: (query: string) => void;
  setAutoRotate: (on: boolean) => void;
  toggleLegend: () => void;
  reset: () => void;
}

const INITIAL = {
  focusedNodeId: null,
  hiddenTypeIds: [] as string[],
  searchQuery: '',
  autoRotate: true,
  showLegend: true,
};

/**
 * zustand is v4.5.2, so the plain `create<T>(...)` form is correct. The curried
 * `create<T>()(...)` form is only required with middleware such as `persist`,
 * and this store is intentionally not persisted.
 *
 * `isFullscreen` is deliberately absent: the browser owns it via
 * `document.fullscreenElement`, and a mirrored copy desyncs the moment the user
 * presses Escape. See useFullscreen.
 */
export const useKnowledgeGraphStore = create<IKnowledgeGraphState>((set) => ({
  ...INITIAL,
  setFocusedNode: (focusedNodeId) => set({ focusedNodeId }),
  toggleType: (typeNodeId) =>
    set((state) => ({
      hiddenTypeIds: state.hiddenTypeIds.includes(typeNodeId)
        ? state.hiddenTypeIds.filter((id) => id !== typeNodeId)
        : [...state.hiddenTypeIds, typeNodeId],
    })),
  showAllTypes: () => set({ hiddenTypeIds: [] }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setAutoRotate: (autoRotate) => set({ autoRotate }),
  toggleLegend: () => set((state) => ({ showLegend: !state.showLegend })),
  reset: () => set(INITIAL),
}));
