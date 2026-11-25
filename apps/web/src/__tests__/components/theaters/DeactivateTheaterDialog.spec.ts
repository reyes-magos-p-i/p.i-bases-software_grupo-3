import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import DeactivateTheaterDialog from '@/components/theaters/DeactivateTheaterDialog.vue'
import { deleteTheater } from '@/services/theater.service'
import type { Theater } from '@/types/theater'

vi.mock('@/services/theater.service', () => ({ deleteTheater: vi.fn() }))
vi.mock('@/services/employee-session.service', () => ({
  employeeSession: { user: { value: { email: 'admin@example.com' } } },
}))
let wrapper: VueWrapper
const theater = { theaterId: 7 } as Theater
function render() {
  return (wrapper = mount(DeactivateTheaterDialog, {
    props: { theater },
    global: { stubs: { BaseModal: { template: '<section><slot/></section>' } } },
  }))
}
beforeEach(() => vi.resetAllMocks())
afterEach(() => wrapper?.unmount())

describe('Theater deactivation email confirmation', () => {
  it('requires the actor email before sending the selected theater', async () => {
    const view = render()
    await view.get('.primary').trigger('click')
    expect(deleteTheater).not.toHaveBeenCalled()
    await view.get('input').setValue('other@example.com')
    await view.get('.primary').trigger('click')
    expect(deleteTheater).not.toHaveBeenCalled()
    await view.get('input').setValue(' ADMIN@example.com ')
    await view.get('.primary').trigger('click')
    await flushPromises()
    expect(deleteTheater).toHaveBeenCalledExactlyOnceWith(7, 'admin@example.com')
    expect(view.emitted('deactivated')).toHaveLength(1)
  })
  it('allows cancelling with incomplete confirmation data', async () => {
    const view = render()
    await view.get('input').setValue('invalid')
    await view.get('.secondary').trigger('click')
    expect(view.emitted('close')).toHaveLength(1)
    expect(deleteTheater).not.toHaveBeenCalled()
  })
  it.each([401, 403, 404, 409, 500])(
    'preserves the failure message for HTTP %s',
    async (status) => {
      vi.mocked(deleteTheater).mockRejectedValue({ isAxiosError: true, response: { status } })
      const view = render()
      await view.get('input').setValue('admin@example.com')
      await view.get('.primary').trigger('click')
      await flushPromises()
      expect(view.find('[role="alert"]').exists()).toBe(true)
      expect(view.emitted('deactivated')).toBeUndefined()
      expect(view.get('.primary').attributes('disabled')).toBeDefined()
    },
  )
})
