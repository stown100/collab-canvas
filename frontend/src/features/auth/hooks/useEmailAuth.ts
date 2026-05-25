'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { registerUser } from '../api/register';

const DASHBOARD_URL = '/dashboard';

export function useEmailAuth() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function login(email: string, password: string) {
    setError(null);
    setIsPending(true);
    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        setError('Неверный email или пароль');
        return false;
      }

      router.push(DASHBOARD_URL);
      router.refresh();
      return true;
    } finally {
      setIsPending(false);
    }
  }

  async function register(email: string, password: string) {
    setError(null);
    setIsPending(true);
    try {
      const result = await registerUser({ email, password });
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      // Account created — sign the user in right away.
      return await login(email, password);
    } finally {
      setIsPending(false);
    }
  }

  return { login, register, error, isPending, clearError: () => setError(null) };
}
