import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import PasswordExpiryNotice from '@/components/common/PasswordExpiryNotice.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import {
  announcePasswordExpiry,
  dismissPasswordExpiry,
  expectPasswordExpiryNotice,
  passwordExpiryMessage,
  passwordExpiryNotice,
} from '@/services/password-expiry-notice'

afterEach(dismissPasswordExpiry)

describe('PasswordExpiryNotice', () => {
  it('renders nothing while there is no warning', () => {
    const wrapper = mount(PasswordExpiryNotice)
    expect(wrapper.findComponent(NotificationPopup).exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the warning as an alert popup and hides it when the popup closes', async () => {
    const wrapper = mount(PasswordExpiryNotice)
    expectPasswordExpiryNotice()
    announcePasswordExpiry({ status: 'valid', expirationDays: 30, expiresInDays: 2 })
    await nextTick()

    const popup = wrapper.getComponent(NotificationPopup)
    expect(wrapper.find('.password-expiry-notice').exists()).toBe(true)
    expect(popup.props()).toMatchObject({
      type: 'alert',
      message: passwordExpiryMessage(2),
      duration: 10000,
    })

    popup.vm.$emit('close')
    await nextTick()
    expect(passwordExpiryNotice.message.value).toBe('')
    expect(wrapper.findComponent(NotificationPopup).exists()).toBe(false)
    wrapper.unmount()
  })
})
