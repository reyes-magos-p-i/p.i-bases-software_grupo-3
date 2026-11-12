import type { ClientDetail, UpdateClientRequest, UserEditOptions } from './user'

export const CLIENT_PROFILE_SECTIONS = [
  { id: 'personal', label: 'Mis datos', icon: 'bi-person' },
  { id: 'security', label: 'Seguridad', icon: 'bi-shield-lock' },
  { id: 'purchases', label: 'Historial de compras', icon: 'bi-ticket-perforated' },
  { id: 'preferences', label: 'Preferencias', icon: 'bi-sliders' },
  { id: 'deactivation', label: 'Desactivar cuenta', icon: 'bi-person-dash' },
] as const

export type ClientProfile = ClientDetail
export type ClientProfileUpdate = Omit<UpdateClientRequest, 'email'> & {
  gender?: 'M' | 'F' | 'O' | 'N' | null
}
export type ClientAddressOptions = UserEditOptions
