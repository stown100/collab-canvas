import { create } from 'zustand';

export interface User {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface UserState {
  user: User | null;
  setUser: (user: User | null) => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
