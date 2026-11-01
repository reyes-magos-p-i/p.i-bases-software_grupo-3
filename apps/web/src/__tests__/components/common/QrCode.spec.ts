import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { create } from 'qrcode'
import QrCode from '@/components/common/QrCode.vue'

describe('QrCode', () => {
  it('renders a real QR matrix with a clear scanning margin and an accessible label', () => {
    const value = 'https://cinema.example/account/profile?section=purchases&purchaseId=12'
    const size = create(value, { errorCorrectionLevel: 'M' }).modules.size + 8
    const wrapper = mount(QrCode, {
      props: { value, label: 'Compra ORD-000012' },
      slots: { default: 'Escanea para consultar tu compra.' },
    })
    expect(wrapper.get('svg').attributes('viewBox')).toBe(`0 0 ${size} ${size}`)
    expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe('Compra ORD-000012')
    expect(wrapper.get('path').attributes('d')).toContain('M4 4h1v1h-1z')
    expect(wrapper.get('figcaption').text()).toBe('Escanea para consultar tu compra.')
    expect(wrapper.find('img').exists()).toBe(false)
    wrapper.unmount()
  })
  it('updates the encoded value without interpreting it as HTML', async () => {
    const wrapper = mount(QrCode, { props: { value: 'ORD-000012' } })
    const original = wrapper.get('path').attributes('d')
    await wrapper.setProps({ value: '<script>alert(1)</script>' })
    expect(wrapper.get('path').attributes('d')).not.toBe(original)
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.get('svg').attributes('aria-label')).toBe('Código QR')
    wrapper.unmount()
  })
  it('reports encoding failures without hiding the surrounding purchase', async () => {
    const wrapper = mount(QrCode, { props: { value: '' } })
    expect(wrapper.get('[role="alert"]').text()).toBe('No se pudo mostrar el código QR.')
    expect(wrapper.find('svg').exists()).toBe(false)
    await wrapper.setProps({ value: 'ORD-000012' })
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
