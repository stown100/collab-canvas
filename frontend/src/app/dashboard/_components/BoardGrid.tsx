'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import GridViewIcon from '@mui/icons-material/GridView';
import { useBoards } from '@/features/boards/hooks/useBoards';

export default function BoardGrid() {
  const { boards, createBoard } = useBoards();

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(1, 1fr)',
          sm: 'repeat(2, 1fr)',
          md: 'repeat(3, 1fr)',
          lg: 'repeat(4, 1fr)',
        },
        gap: 3,
      }}
    >
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
          onClick={createBoard}
          sx={{ height: 180, display: 'flex', flexDirection: 'column', gap: 1 }}
        >
          <AddIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="body1" fontWeight={600} sx={{ color: 'primary.main' }}>
            Новая доска
          </Typography>
        </CardActionArea>
      </Card>

      {boards.map((board) => (
        <Card
          key={board.id}
          elevation={0}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 3,
            overflow: 'hidden',
            transition: 'box-shadow 0.2s, transform 0.2s',
            '&:hover': {
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              transform: 'translateY(-2px)',
            },
          }}
        >
          <CardActionArea
            sx={{
              height: 180,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'flex-end',
              p: 0,
            }}
          >
            <Box sx={{ position: 'absolute', inset: 0, bgcolor: board.color, opacity: 0.12 }} />
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -60%)',
                opacity: 0.2,
              }}
            >
              <GridViewIcon sx={{ fontSize: 64, color: board.color }} />
            </Box>
            <CardContent
              sx={{ position: 'relative', width: '100%', bgcolor: 'background.paper', pt: 1.5 }}
            >
              <Typography variant="body1" fontWeight={600} noWrap>
                {board.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Изменено: {board.updatedAt}
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>
      ))}
    </Box>
  );
}
