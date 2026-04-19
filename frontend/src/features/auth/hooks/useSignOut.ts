import { signOut } from 'next-auth/react';

export function useSignOut() {
  function handleSignOut() {
    signOut({ callbackUrl: '/login' });
  }

  return { handleSignOut };
}
