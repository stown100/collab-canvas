import { create } from 'zustand';

export interface Board {
  id: string;
  title: string;
  updatedAt: string;
  color: string;
}

interface BoardState {
  boards: Board[];
  setBoards: (boards: Board[]) => void;
  addBoard: (board: Board) => void;
  removeBoard: (id: string) => void;
}

export const useBoardStore = create<BoardState>((set) => ({
  boards: [],
  setBoards: (boards) => set({ boards }),
  addBoard: (board) => set((state) => ({ boards: [board, ...state.boards] })),
  removeBoard: (id) => set((state) => ({ boards: state.boards.filter((b) => b.id !== id) })),
}));
