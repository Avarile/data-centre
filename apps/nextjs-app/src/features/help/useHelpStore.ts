import { create } from 'zustand';

interface IHelpState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useHelpStore = create<IHelpState>((set) => ({
  open: false,
  setOpen: (open: boolean) => set({ open }),
}));
