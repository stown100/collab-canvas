'use client';

import { useState, MouseEvent } from 'react';
import { useSignOut } from '@/features/auth/hooks/useSignOut';
import { useUserStore } from '@/shared/store/userStore';
import {
    Avatar,
    Box,
    Button,
    IconButton,
    Menu,
    Stack,
    Typography,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';

export default function UserBlock() {
    const user = useUserStore((state) => state.user);
    const { handleSignOut } = useSignOut();
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const open = Boolean(anchorEl);

    if (!user) return null;

    const handleOpen = (e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
    const handleClose = () => setAnchorEl(null);

    return (
        <>
            <IconButton onClick={handleOpen} sx={{ p: 0 }}>
                <Avatar
                    src={user.image ?? undefined}
                    alt={user.name ?? 'User'}
                    sx={{ width: 36, height: 36 }}
                >
                    {user.name?.[0]}
                </Avatar>
            </IconButton>

            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{ paper: { sx: { minWidth: 200, p: 1.5 } } }}
            >
                <Stack spacing={1.5}>
                    <Box>
                        <Typography variant="subtitle2" noWrap>
                            {user.name ?? 'User'}
                        </Typography>
                        {user.email && (
                            <Typography variant="caption" color="text.secondary" noWrap component="div">
                                {user.email}
                            </Typography>
                        )}
                    </Box>
                    <Button
                        fullWidth
                        variant="outlined"
                        size="small"
                        startIcon={<LogoutIcon />}
                        onClick={() => {
                            handleClose();
                            handleSignOut();
                        }}
                        sx={{ color: 'text.secondary', borderColor: 'divider' }}
                    >
                        Log Out
                    </Button>
                </Stack>
            </Menu>
        </>
    );
}
