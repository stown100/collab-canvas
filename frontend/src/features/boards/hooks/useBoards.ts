import { useEffect } from 'react';
import { useBoardStore, type Board } from '@/shared/store/boardStore';

const MOCK_BOARDS: Board[] = [
  { id: '1', title: 'Дизайн главной страницы', updatedAt: '2 часа назад', color: '#6366F1' },
  { id: '2', title: 'Брейншторм: новые функции', updatedAt: 'Вчера', color: '#06B6D4' },
  { id: '3', title: 'Архитектура бекенда', updatedAt: '3 дня назад', color: '#F59E0B' },
  { id: '4', title: 'Планирование спринта', updatedAt: 'Неделю назад', color: '#10B981' },
];

export function useBoards() {
  const { boards, addBoard, removeBoard, setBoards } = useBoardStore();

  useEffect(() => {
    if (boards.length === 0) {
      setBoards(MOCK_BOARDS);
    }
  }, [boards.length, setBoards]);

  function createBoard() {
    addBoard({
      id: Date.now().toString(),
      title: 'Новая доска',
      updatedAt: 'Только что',
      color: '#4F46E5',
    });
  }

  return { boards, createBoard, removeBoard };
}
