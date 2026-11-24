import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type RouteLocationNormalized } from 'vue-router'
import AppFooter from '@/components/layout/AppFooter.vue'
import appRouter from '@/router'
describe('Footer purchase access', () => {
  it('links each portal section and the legal pages, without a purchase consultation', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<p/>' } },
        ...['/terms-and-conditions', '/refund-policy', '/privacy-policy'].map((path) => ({
          path,
          component: { template: '<p/>' },
        })),
      ],
    })
    await router.push('/')
    const wrapper = mount(AppFooter, { global: { plugins: [router] } })
    expect(wrapper.find('a[href^="/guest-purchases"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Consultar compra')
    expect(wrapper.text()).not.toContain('Próximamente')
    expect(wrapper.findAll('a')).toHaveLength(6)
    expect(wrapper.get('a[href="/#cartelera"]').text()).toBe('Ver cartelera')
    expect(wrapper.get('a[href="/#preventas"]').text()).toBe('Preventas')
    expect(wrapper.get('a[href="/#estrenos"]').text()).toBe('Estrenos')
    expect(wrapper.get('a[href="/terms-and-conditions"]').text()).toBe('Términos y condiciones')
    expect(wrapper.get('a[href="/refund-policy"]').text()).toBe('Política de reembolso')
    expect(wrapper.get('a[href="/privacy-policy"]').text()).toBe('Aviso de privacidad')
    wrapper.unmount()
    router.options.history.destroy()
  })

  it('scrolls to the linked section, and otherwise keeps the saved position', () => {
    const scroll = appRouter.options.scrollBehavior!
    const home = appRouter.resolve('/') as RouteLocationNormalized
    const preventas = appRouter.resolve('/#preventas') as RouteLocationNormalized

    expect(scroll(preventas, home, null)).toEqual({ el: '#preventas', behavior: 'smooth' })
    expect(scroll(home, preventas, { left: 0, top: 300 })).toEqual({ left: 0, top: 300 })
    expect(scroll(home, preventas, null)).toBeUndefined()
  })
})
