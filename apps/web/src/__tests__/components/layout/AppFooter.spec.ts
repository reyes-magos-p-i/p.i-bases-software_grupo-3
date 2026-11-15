import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppFooter from '@/components/layout/AppFooter.vue'
describe('Footer purchase access', () => {
  it('keeps the catalog and legal links without a purchase consultation section', async () => {
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
    expect(wrapper.findAll('a')).toHaveLength(4)
    expect(wrapper.get('a[href="/#cartelera"]').text()).toBe('Ver cartelera')
    expect(wrapper.findAll('.pending-option')).toHaveLength(2)
    expect(wrapper.get('a[href="/terms-and-conditions"]').text()).toBe('Términos y condiciones')
    expect(wrapper.get('a[href="/refund-policy"]').text()).toBe('Política de reembolso')
    expect(wrapper.get('a[href="/privacy-policy"]').text()).toBe('Aviso de privacidad')
    wrapper.unmount()
    router.options.history.destroy()
  })
})
