import { create } from 'zustand';

export interface Board {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string | null;
  ownerImage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BoardState {
  boards: Board[];
  setBoards: (boards: Board[]) => void;
  addBoard: (board: Board) => void;
  removeBoard: (id: string) => void;
  updateBoard: (id: string, patch: Partial<Board>) => void;
}

export const useBoardStore = create<BoardState>((set) => ({
  boards: [],
  setBoards: (boards) => set({ boards }),
  addBoard: (board) => set((state) => ({ boards: [board, ...state.boards] })),
  removeBoard: (id) => set((state) => ({ boards: state.boards.filter((b) => b.id !== id) })),
  updateBoard: (id, patch) =>
    set((state) => ({ boards: state.boards.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),
}));
