import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppFooter from '@/components/layout/AppFooter.vue'
describe('Footer purchase access', () => {
  it('provides a public consultation entry alongside the existing legal links', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<p/>' } },
        { path: '/guest-purchases', component: { template: '<p/>' } },
      ],
    })
    await router.push('/')
    const wrapper = mount(AppFooter, { global: { plugins: [router] } })
    const link = wrapper.get('a[href="/guest-purchases"]')
    expect(link.text()).toBe('Consultar compra')
    await link.trigger('click')
    await router.isReady()
    expect(wrapper.findAll('a')).toHaveLength(7)
    wrapper.unmount()
    router.options.history.destroy()
  })
})
