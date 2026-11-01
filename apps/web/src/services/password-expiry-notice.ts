import { readonly, ref } from 'vue'
import type { PasswordExpiry } from '@/services/authService'

const message = ref('')
// In memory on purpose: a page refresh clears it, so only a real login shows the warning.
let loginPending = false

/** Warning shown right after logging in during the last 72 hours of the password. */
export const passwordExpiryNotice = { message: readonly(message) }

export function passwordExpiryMessage(days: number): string {
  return `Tu contraseña vence en ${days} ${days === 1 ? 'día' : 'días'}. Cámbiala en Perfil > Cambiar contraseña.`
}

/** Called by the login flows; the next password-status check may show the warning. */
export function expectPasswordExpiryNotice(): void {
  loginPending = true
}

/**
 * Shows the warning only for the first password-status check after a login, and only
 * when the API reports days left. Checks from page loads or refreshes are ignored.
 */
export function announcePasswordExpiry(expiry: PasswordExpiry): void {
  if (!loginPending) return
  loginPending = false
  if (expiry.status === 'valid' && expiry.expiresInDays !== null) {
    message.value = passwordExpiryMessage(expiry.expiresInDays)
  }
}

/** Hides the warning and forgets a login whose status check never completed. */
export function dismissPasswordExpiry(): void {
  message.value = ''
  loginPending = false
}
