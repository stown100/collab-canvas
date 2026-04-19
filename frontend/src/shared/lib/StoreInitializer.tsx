'use client';

import { useRef } from 'react';
import { useUserStore, type User } from '@/shared/store/userStore';

interface Props {
  user: User | null;
}

// Hydrates Zustand store with server-side session data on first render.
// Called once per page load before any client component reads the store.
export function StoreInitializer({ user }: Props) {
  const initialized = useRef(false);
  if (!initialized.current) {
    useUserStore.setState({ user });
    initialized.current = true;
  }
  return null;
}
