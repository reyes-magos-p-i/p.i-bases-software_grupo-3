import { readonly, ref } from 'vue'
import type { PasswordExpiry } from '@/services/authService'

const message = ref('')

/** Warning shown when a user enters the system during the last 72 hours of their password. */
export const passwordExpiryNotice = { message: readonly(message) }

export function passwordExpiryMessage(days: number): string {
  return `Tu contraseña vence en ${days} ${days === 1 ? 'día' : 'días'}. Cámbiala en Perfil > Cambiar contraseña.`
}

/** Shows the warning when the API reports days left; otherwise hides any previous one. */
export function announcePasswordExpiry(expiry: PasswordExpiry): void {
  message.value =
    expiry.status === 'valid' && expiry.expiresInDays !== null
      ? passwordExpiryMessage(expiry.expiresInDays)
      : ''
}

export function dismissPasswordExpiry(): void {
  message.value = ''
}
