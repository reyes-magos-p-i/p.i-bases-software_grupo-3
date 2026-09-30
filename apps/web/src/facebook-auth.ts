/// <reference path="./types/facebook.d.ts" />

import { reactive } from 'vue'

export const fbAuth = reactive({
  status: 'unknown' as fb.LoginStatus, // connected | not_authorized | unknown
  authResponse: null as fb.AuthResponse | null,
  user: null as unknown,
})

export function applyLoginStatus(response: fb.StatusResponse) {
  fbAuth.status = response.status
  fbAuth.authResponse = response.authResponse ?? null
}

export function loginWithFacebook(): Promise<fb.StatusResponse> {
  return new Promise((resolve) => {
    FB.login((response) => {
      applyLoginStatus(response)
      resolve(response)
    }, { scope: 'public_profile,email' })
  })
}

export function logoutFromFacebook() {
  return new Promise((resolve) => {
    FB.logout((response) => {
      applyLoginStatus(response)
      fbAuth.user = null
      resolve(response)
    })
  })
}