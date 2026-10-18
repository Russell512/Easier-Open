import { signInWithProvider } from './oauthAuth'

export async function signInWithGoogle() {
  await signInWithProvider('google')
}
