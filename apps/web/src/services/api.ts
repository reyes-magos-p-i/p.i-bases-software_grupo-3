import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL?.trim(),
})

export function getApi() {
  if (!api.defaults.baseURL) {
    throw new Error('Falta configurar VITE_API_BASE_URL para conectar con el backend.')
  }
  return api
}
