import { redirect } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { auth } from '@/shared/lib/auth';
import { StoreInitializer } from '@/shared/lib/StoreInitializer';
import Header from '@/widgets/header/ui/Header';
import BoardGrid from './_components/BoardGrid';
import Footer from './_components/Footer';

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <StoreInitializer user={session.user ?? null} />
      <Header />

      <Box component="main" sx={{ flex: 1, px: { xs: 2, sm: 4, md: 6 }, py: 5 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            Мои доски
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Создавайте и управляйте совместными досками
          </Typography>
        </Box>

        <BoardGrid />
      </Box>

      <Footer />
    </Box>
  );
}
