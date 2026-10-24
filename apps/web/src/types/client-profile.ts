import type { ClientDetail, UpdateClientRequest, UserEditOptions } from './user'

export type ClientProfile = ClientDetail
export type ClientProfileUpdate = Omit<UpdateClientRequest, 'email'> & {
  gender?: 'M' | 'F' | 'O' | 'N' | null
}
export type ClientAddressOptions = UserEditOptions
