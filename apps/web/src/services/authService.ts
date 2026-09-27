import type { RegisterPayload } from '@/types/client'

// VITE only exposes env variables prefixed with VITE_ to the client-side code.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export async function registerUser(payload: RegisterPayload): Promise<void> {
  // The caller must handle throwing errors, so we don't catch them here.
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const msg = Array.isArray(body?.message) ? body.message.join('. ') : body?.message
    throw new Error(msg ?? 'No se pudo crear la cuenta')
  }
}