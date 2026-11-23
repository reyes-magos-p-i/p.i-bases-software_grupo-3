import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import applicationRouter from '@/router'
import { requireClientSession } from '@/router/client-session.guard'
import {
  clearClientSession,
  clientSession,
  establishClientSession,
} from '@/services/client-session.service'
import { getClientPasswordStatus, getClientSession } from '@/services/authService'

vi.mock('@/services/authService', async (original) => ({
  ...(await original<typeof import('@/services/authService')>()),
  getClientSession: vi.fn(),
  getClientPasswordStatus: vi.fn(),
}))

const pages = [
  { path: '/terms-and-conditions', title: 'Términos y condiciones' },
  { path: '/refund-policy', title: 'Política de reembolso' },
  { path: '/privacy-policy', title: 'Aviso de privacidad' },
]

describe('Public legal documents', () => {
  let wrapper: VueWrapper | undefined
  let router: Router | undefined

  async function render(path: string) {
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<main>Portal de Cinetadel</main>' } },
        ...applicationRouter.options.routes.filter((route) => route.meta?.publicLegal === true),
      ],
    })
    router.beforeEach(requireClientSession)
    await router.push(path)
    await router.isReady()
    wrapper = mount(
      { template: '<RouterView />' },
      {
        attachTo: document.body,
        global: {
          plugins: [router],
          stubs: { AppHeader: { template: '<header>Cabecera del portal</header>' } },
        },
      },
    )
    await flushPromises()
    return wrapper
  }

  beforeEach(() => {
    clearClientSession()
    vi.clearAllMocks()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vi.mocked(getClientSession).mockRejectedValue(new Error('API unavailable'))
    vi.mocked(getClientPasswordStatus).mockRejectedValue(new Error('API unavailable'))
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    router?.options.history.destroy()
    router = undefined
    clearClientSession()
    vi.restoreAllMocks()
  })

  afterAll(() => applicationRouter.options.history.destroy())

  it.each(pages)(
    'reads $title without a session or an available authentication API',
    async ({ path, title }) => {
      const view = await render(path)
      expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({
        top: 0,
        left: 0,
        behavior: 'instant',
      })
      expect(router!.currentRoute.value.path).toBe(path)
      expect(view.findAll('h1')).toHaveLength(1)
      expect(view.get('h1').text()).toBe(title)
      expect(view.get('.legal-updated').text()).toContain('17 de noviembre de 2026')
      expect(view.findAll('article section').length).toBeGreaterThan(0)
      for (const section of view.findAll('article section')) {
        expect(section.find('h2').exists()).toBe(true)
        expect(section.find('p').exists()).toBe(true)
      }
      expect(view.get('main').attributes('aria-labelledby')).toBe(view.get('h1').attributes('id'))
      expect(view.text()).not.toMatch(
        /Sed ut perspiciatis|Lorem ipsum|Nota: En el texto original|ICO/,
      )
      expect(view.get('main').get('a[href="mailto:cinetadel2026@gmail.com"]').text()).toBe(
        'cinetadel2026@gmail.com',
      )
      expect(getClientSession).not.toHaveBeenCalled()
      expect(getClientPasswordStatus).not.toHaveBeenCalled()
      expect(localStorage.getItem('accessToken')).toBeNull()
    },
  )

  it.each(pages)('preserves the existing client session while reading $title', async ({ path }) => {
    const identity = { id: 7, email: 'ana@example.com', firstName: 'Ana', lastName: 'Rojas' }
    establishClientSession(identity, 'unchanged-client-token')
    await render(path)

    expect(router!.currentRoute.value.path).toBe(path)
    expect(clientSession.user.value).toEqual(identity)
    expect(localStorage.getItem('accessToken')).toBe('unchanged-client-token')
    expect(getClientSession).not.toHaveBeenCalled()
    expect(getClientPasswordStatus).not.toHaveBeenCalled()
  })

  it('navigates through the real footer links and returns to the portal', async () => {
    const view = await render('/terms-and-conditions')
    for (const { path, title } of [...pages.slice(1), pages[0]!]) {
      vi.mocked(window.scrollTo).mockClear()
      await view.get('footer').get(`a[href="${path}"]`).trigger('click')
      await flushPromises()
      expect(router!.currentRoute.value.path).toBe(path)
      expect(view.get('h1').text()).toBe(title)
      expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({
        top: 0,
        left: 0,
        behavior: 'instant',
      })
    }

    vi.mocked(window.scrollTo).mockClear()
    await view.get('.legal-navigation a[href="/"]').trigger('click')
    await flushPromises()
    expect(router!.currentRoute.value.path).toBe('/')
    expect(view.get('main').text()).toBe('Portal de Cinetadel')
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('offers a keyboard-accessible link to the document content', async () => {
    const view = await render('/terms-and-conditions')
    const link = view.get<HTMLAnchorElement>('.legal-skip-link')
    expect(link.attributes('href')).toBe(`#${view.get('main').attributes('id')}`)
    expect(view.get('main').attributes('tabindex')).toBe('-1')
    link.element.focus()
    expect(document.activeElement).toBe(link.element)
  })

  it('describes the current purchase and reprogramming flow without claiming a QR admission validator', async () => {
    const view = await render('/terms-and-conditions')
    expect(view.text()).toContain('Seleccionar un asiento no lo reserva')
    expect(view.text()).toContain('misma película y sucursal')
    expect(view.text()).toContain('enlace privado')
    expect(view.text()).not.toContain('escanea el QR para validar tu ingreso')
    expect(view.get('main').get('a[href="/refund-policy"]').text()).toBe('política de reembolso')
    expect(view.get('main').get('a[href="/privacy-policy"]').text()).toBe('aviso de privacidad')
  })

  it('describes manual refund assistance without exposing an unimplemented refund form', async () => {
    const view = await render('/refund-policy')
    expect(view.text()).toContain('corresponde la devolución de los boletos afectados')
    expect(view.text()).toContain('no genera una devolución automática')
    expect(view.text()).toContain('no registra una solicitud ni realiza una devolución')
    expect(view.get('main').find('form').exists()).toBe(false)
    expect(view.get('main').get('a[href="/terms-and-conditions"]').text()).toBe(
      'términos y condiciones',
    )
  })

  it('discloses existing browser storage, social-provider events and account deactivation limits', async () => {
    const view = await render('/privacy-policy')
    expect(view.text()).toContain('almacenamiento local del navegador')
    expect(view.text()).toContain('hasta 24 horas')
    expect(view.text()).toContain('registra un evento de visita')
    expect(view.text()).toContain('no elimina automáticamente sus registros ni sus compras')
    expect(view.text()).toContain('supresión de tus datos')
    for (const provider of ['Google', 'Facebook']) {
      const link = view
        .get('main')
        .findAll('a')
        .find((anchor) => anchor.text() === provider)!
      expect(link.attributes('href')).toMatch(/^https:\/\//)
      expect(link.attributes('target')).toBe('_blank')
      expect(link.attributes('rel')).toBe('noopener noreferrer')
    }
  })
})
