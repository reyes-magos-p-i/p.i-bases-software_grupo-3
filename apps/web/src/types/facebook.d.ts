export {}

declare global {
  interface Window {
    FB: typeof FB
    fbAsyncInit: () => void
  }

  namespace fb {
    type LoginStatus = 'connected' | 'not_authorized' | 'unknown'

    interface AuthResponse {
      accessToken: string
      expiresIn: number
      signedRequest: string
      userID: string
    }

    interface StatusResponse {
      status: LoginStatus
      authResponse?: AuthResponse
    }
  }

  const FB: {
    init(params: {
      appId: string
      cookie?: boolean
      xfbml?: boolean
      version: string
    }): void
    AppEvents: { logPageView(): void }
    getLoginStatus(cb: (response: fb.StatusResponse) => void): void
    login(
      cb: (response: fb.StatusResponse) => void,
      opts?: { scope?: string }
    ): void
    logout(cb: (response: fb.StatusResponse) => void): void
  }
}
