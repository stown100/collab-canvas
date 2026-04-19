'use client';

import { useLayoutEffect } from 'react';
import { useUserStore, type User } from '@/shared/store/userStore';

interface Props {
  user: User | null;
}

export function StoreInitializer({ user }: Props) {
  useLayoutEffect(() => {
    useUserStore.setState({ user });
  }, [user]);
  return null;
}
