import { signIn } from 'next-auth/react';

export function useSignIn() {
  function handleGoogleSignIn() {
    signIn('google', { callbackUrl: '/dashboard' });
  }

  return { handleGoogleSignIn };
}
