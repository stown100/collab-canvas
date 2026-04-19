'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import AddIcon from '@mui/icons-material/Add';
import GridViewIcon from '@mui/icons-material/GridView';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useBoards, getBoardColor } from '@/features/boards/hooks/useBoards';
import CreateBoardDialog from '@/features/boards/ui/CreateBoardDialog';
import DeleteConfirmPopover from '@/features/boards/ui/DeleteConfirmPopover';

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

export default function BoardGrid() {
  const { boards, loading, createBoard, deleteBoard } = useBoards();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteAnchor, setDeleteAnchor] = useState<HTMLElement | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  function handleDeleteClick(e: React.MouseEvent<HTMLElement>, boardId: string) {
    e.stopPropagation();
    setDeleteAnchor(e.currentTarget);
    setPendingDeleteId(boardId);
  }

  function handleDeleteClose() {
    setDeleteAnchor(null);
    setPendingDeleteId(null);
  }

  function handleDeleteConfirm() {
    if (pendingDeleteId) deleteBoard(pendingDeleteId);
  }

  if (loading) {
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', md: 'repeat(3,1fr)', lg: 'repeat(4,1fr)' }, gap: 3 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={180} sx={{ borderRadius: 3 }} />
        ))}
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', md: 'repeat(3,1fr)', lg: 'repeat(4,1fr)' }, gap: 3 }}>
        {/* Create new board */}
        <Card
          elevation={0}
          sx={{
            border: '2px dashed',
            borderColor: 'primary.main',
            borderRadius: 3,
            bgcolor: 'transparent',
            transition: 'background-color 0.2s',
            '&:hover': { bgcolor: 'primary.main', '& *': { color: '#fff' } },
          }}
        >
          <CardActionArea
            onClick={() => setDialogOpen(true)}
            sx={{ height: 180, display: 'flex', flexDirection: 'column', gap: 1 }}
          >
            <AddIcon sx={{ fontSize: 40, color: 'primary.main' }} />
            <Typography variant="body1" fontWeight={600} sx={{ color: 'primary.main' }}>
              Новая доска
            </Typography>
          </CardActionArea>
        </Card>

        {/* Board cards */}
        {boards.map((board) => {
          const color = getBoardColor(board.id);
          return (
            <Card
              key={board.id}
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 3,
                overflow: 'hidden',
                position: 'relative',
                transition: 'box-shadow 0.2s, transform 0.2s',
                '&:hover': { boxShadow: '0 4px 20px rgba(0,0,0,0.1)', transform: 'translateY(-2px)' },
                '&:hover .delete-btn': { opacity: 1 },
              }}
            >
              <IconButton
                className="delete-btn"
                size="small"
                onClick={(e) => handleDeleteClick(e, board.id)}
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  zIndex: 1,
                  opacity: 0,
                  transition: 'opacity 0.2s',
                  bgcolor: 'background.paper',
                  '&:hover': { bgcolor: 'error.light', color: '#fff' },
                }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>

              <CardActionArea sx={{ height: 180, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-end', p: 0 }}>
                <Box sx={{ position: 'absolute', inset: 0, bgcolor: color, opacity: 0.12 }} />
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -60%)', opacity: 0.2 }}>
                  <GridViewIcon sx={{ fontSize: 64, color }} />
                </Box>

                <CardContent sx={{ position: 'relative', width: '100%', bgcolor: 'background.paper', pt: 1.5, pb: '12px !important' }}>
                  <Typography variant="body1" fontWeight={600} noWrap sx={{ mb: 0.5 }}>
                    {board.title}
                  </Typography>

                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                      <Avatar src={board.ownerImage ?? undefined} sx={{ width: 18, height: 18, fontSize: 10 }}>
                        {board.ownerName?.[0]}
                      </Avatar>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {board.ownerName ?? 'Вы'}
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                        Изменено: {formatDate(board.updatedAt)}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                        Создано: {formatDate(board.createdAt)}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>

      <CreateBoardDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={createBoard}
      />

      <DeleteConfirmPopover
        anchorEl={deleteAnchor}
        onClose={handleDeleteClose}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}
