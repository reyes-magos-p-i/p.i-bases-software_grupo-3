import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SocialAuthButtons from '@/components/auth/SocialAuthButtons.vue'

describe('SocialAuthButtons.vue', () => {
  it('emite evento "google" al hacer clic', async () => {
    const wrapper = mount(SocialAuthButtons)
    const buttons = wrapper.findAll('button')

    await buttons[0]!.trigger('click')

    expect(wrapper.emitted('google')).toHaveLength(1)
  })

  it('emite evento "facebook" al hacer clic', async () => {
    const wrapper = mount(SocialAuthButtons)
    const buttons = wrapper.findAll('button')

    await buttons[1]!.trigger('click')

    expect(wrapper.emitted('facebook')).toHaveLength(1)
  })
})