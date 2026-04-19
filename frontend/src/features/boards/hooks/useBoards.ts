import { useEffect, useState, useCallback } from 'react';
import { useBoardStore } from '@/shared/store/boardStore';

const BOARD_COLORS = ['#6366F1', '#06B6D4', '#F59E0B', '#10B981', '#EC4899', '#F97316'];

export function getBoardColor(id: string): string {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return BOARD_COLORS[hash % BOARD_COLORS.length];
}

export function useBoards() {
  const { boards, addBoard, removeBoard, setBoards } = useBoardStore();
  const [loading, setLoading] = useState(true);

  const fetchBoards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/boards');
      const data = await res.json();
      setBoards(data);
    } finally {
      setLoading(false);
    }
  }, [setBoards]);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  async function createBoard(title: string) {
    const res = await fetch('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const board = await res.json();
    addBoard(board);
  }

  async function deleteBoard(id: string) {
    removeBoard(id);
    await fetch(`/api/boards/${id}`, { method: 'DELETE' });
  }

  return { boards, loading, createBoard, deleteBoard };
}
