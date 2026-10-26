import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import UserStatusBadge from '@/components/users/UserStatusBadge.vue'

describe('UserStatusBadge', () => {
  it.each([
    ['ACTIVE', 'Activo', true],
    ['INACTIVE', 'Inactivo', false],
  ] as const)('explains %s with text as well as color', (status, label, active) => {
    const view = mount(UserStatusBadge, { props: { status } })
    expect(view.text()).toBe(label)
    expect(view.classes().includes('active')).toBe(active)
    view.unmount()
  })
})
