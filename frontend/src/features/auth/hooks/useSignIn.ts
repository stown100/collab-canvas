import { signIn } from 'next-auth/react';

export enum OAuthProviders {
  GOOGLE = "google",
  YANDEX = "yandex"
}

export function useSignIn() {
  function handleSignIn(provider: OAuthProviders) {
    signIn(provider, { callbackUrl: '/dashboard' });
  }

  return { handleSignIn };
}
