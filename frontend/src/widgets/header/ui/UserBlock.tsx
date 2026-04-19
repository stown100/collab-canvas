import { useSignOut } from '@/features/auth/hooks/useSignOut';
import { useUserStore } from '@/shared/store/userStore';
import { Avatar, Box, Button, Typography } from '@mui/material';

export default function UserBlock() {
    const user = useUserStore((state) => state.user);
    const { handleSignOut } = useSignOut();

    if (!user) return null;

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar
                src={user.image ?? undefined}
                alt={user.name ?? 'User'}
                sx={{ width: 36, height: 36 }}
            >
                {user.name?.[0]}
            </Avatar>
            <Typography
                variant="body2"
                sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}
            >
                {user.name}
            </Typography>
            <Button
                variant="outlined"
                size="small"
                onClick={handleSignOut}
                sx={{ color: 'text.secondary', borderColor: 'divider' }}
            >
                Выйти
            </Button>
        </Box>
    )
}
