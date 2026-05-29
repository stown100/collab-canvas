'use client';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useUploadStore } from '@/shared/store/uploadStore';

function statusLabel(status: string, progress: number): string {
  if (status === 'error') return 'Ошибка';
  if (status === 'processing') return 'Обработка…';
  return `${progress}%`;
}

export default function UploadProgress() {
  const uploads = useUploadStore((s) => s.uploads);

  if (uploads.length === 0) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: (theme) => theme.zIndex.snackbar,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        width: 320,
        maxWidth: 'calc(100vw - 48px)',
        // Never intercept clicks/drags on the board behind it.
        pointerEvents: 'none',
      }}
    >
      {uploads.map((upload) => {
        const isError = upload.status === 'error';
        return (
          <Paper key={upload.id} elevation={6} sx={{ p: 1.5, borderRadius: 2 }}>
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="center">
                {isError ? (
                  <ErrorOutlineIcon color="error" fontSize="small" />
                ) : (
                  <InsertDriveFileOutlinedIcon color="action" fontSize="small" />
                )}
                <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                  {upload.name}
                </Typography>
                <Typography variant="caption" color={isError ? 'error' : 'text.secondary'}>
                  {statusLabel(upload.status, upload.progress)}
                </Typography>
              </Stack>
              <LinearProgress
                variant={upload.status === 'processing' ? 'indeterminate' : 'determinate'}
                value={isError ? 100 : upload.progress}
                color={isError ? 'error' : 'primary'}
                sx={{ borderRadius: 1 }}
              />
            </Stack>
          </Paper>
        );
      })}
    </Box>
  );
}
