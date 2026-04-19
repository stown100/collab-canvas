import type { Metadata } from 'next';
import ThemeRegistry from '@/shared/lib/theme/ThemeRegistry';

export const metadata: Metadata = {
  title: 'Collab Canvas',
  description: 'Collaborative whiteboard for teams',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
