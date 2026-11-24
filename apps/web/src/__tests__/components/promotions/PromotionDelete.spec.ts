// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import PromotionDelete from '@/components/promotions/PromotionDelete.vue'
import { deletePromotion } from '@/services/promotion.service'

const { validate, session } = vi.hoisted(() => ({
  validate: vi.fn(), session: { user: { value: { email: 'admin@example.com' } } },
}))
vi.mock('@/services/promotion.service', () => ({ deletePromotion: vi.fn() }))
vi.mock('@/services/employee-session.service', () => ({ employeeSession: session }))
const BaseModalStub = defineComponent({
  name: 'BaseModal', props: ['open', 'title', 'closeDisabled'], emits: ['close'],
  template: '<section><h1>{{ title }}</h1><slot /></section>',
})
const EmailStub = defineComponent({
  name: 'EmailConfirmationField', props: ['expectedEmail', 'disabled'],
  setup(_, { expose }) { expose({ validate }) },
  template: '<input :disabled="disabled" aria-label="Correo de confirmación" />',
})
const NotificationStub = defineComponent({
  name: 'NotificationPopup', props: ['message', 'type', 'duration', 'placement'], emits: ['close'],
  template: '<p role="alert">{{ message }}</p>',
})
let wrapper: VueWrapper
function render(promotion: { id: number; title: string } | null = { id: 42, title: 'Oferta de cine' }) {
  wrapper = mount(PromotionDelete, { props: { promotion }, global: {
    stubs: { BaseModal: BaseModalStub, EmailConfirmationField: EmailStub, NotificationPopup: NotificationStub },
  } })
  return wrapper
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function confirm() { await wrapper.get('button.danger').trigger('click'); await flushPromises() }
function apiError(status: number) { return { isAxiosError: true, response: { status } } }
beforeEach(() => {
  vi.clearAllMocks()
  validate.mockReset().mockReturnValue('admin@example.com')
  vi.mocked(deletePromotion).mockReset().mockResolvedValue(undefined)
})
afterEach(() => wrapper?.unmount())

describe('PromotionDelete', () => {
  it('shows the title, warning, and signed-in email confirmation', () => {
    render()
    expect(wrapper.getComponent({ name: 'BaseModal' }).props('open')).toBe(true)
    expect(wrapper.get('h1').text()).toBe('Eliminar promoción')
    expect(wrapper.get('strong').text()).toBe('Oferta de cine')
    expect(wrapper.text()).toContain('Esta acción no se puede deshacer.')
    expect(wrapper.getComponent({ name: 'EmailConfirmationField' }).props('expectedEmail')).toBe('admin@example.com')
    expect(deletePromotion).not.toHaveBeenCalled()
  })
  it('does not confirm or request deletion when the promotion is null', async () => {
    render(null)
    expect(wrapper.getComponent({ name: 'BaseModal' }).props('open')).toBe(false)
    expect(wrapper.findComponent({ name: 'EmailConfirmationField' }).exists()).toBe(false)
    await confirm()
    expect(validate).not.toHaveBeenCalled()
    expect(deletePromotion).not.toHaveBeenCalled()
  })
  it.each([null, undefined, ''])('does not delete when email confirmation returns %p', async (email) => {
    render(); validate.mockReturnValueOnce(email)
    await confirm()
    expect(validate).toHaveBeenCalledTimes(1)
    expect(deletePromotion).not.toHaveBeenCalled()
    expect(wrapper.emitted('deleted')).toBeUndefined()
  })
  it('calls the ID-only delete API and emits deleted followed by close', async () => {
    render(); await confirm()
    expect(deletePromotion).toHaveBeenCalledTimes(1)
    expect(deletePromotion).toHaveBeenCalledWith(42)
    expect(wrapper.emitted('deleted')).toEqual([[]])
    expect(wrapper.emitted('close')).toEqual([[]])
  })
  it('cancels without requesting deletion', async () => {
    render(); await wrapper.get('button.secondary').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(validate).not.toHaveBeenCalled()
    expect(deletePromotion).not.toHaveBeenCalled()
  })
  it('forwards the shell close action while idle', async () => {
    render(); wrapper.getComponent({ name: 'BaseModal' }).vm.$emit('close'); await nextTick()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
  it('disables confirmation and closing, and blocks duplicate requests while pending', async () => {
    const pending = deferred<void>(); vi.mocked(deletePromotion).mockReturnValueOnce(pending.promise)
    render(); await wrapper.get('button.danger').trigger('click')
    expect(wrapper.get('button.danger').text()).toBe('Eliminando...')
    expect(wrapper.get('button.danger').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button.secondary').attributes('disabled')).toBeDefined()
    expect(wrapper.getComponent({ name: 'EmailConfirmationField' }).props('disabled')).toBe(true)
    expect(wrapper.getComponent({ name: 'BaseModal' }).props('closeDisabled')).toBe(true)
    await wrapper.get('button.danger').trigger('click')
    wrapper.getComponent({ name: 'BaseModal' }).vm.$emit('close'); await nextTick()
    expect(deletePromotion).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('close')).toBeUndefined()
    pending.resolve(); await flushPromises()
    expect(wrapper.emitted('deleted')).toHaveLength(1)
  })
  it.each([
    { status: 401, message: 'La sesión ha expirado.', event: 'session-expired' },
    { status: 403, message: 'No tienes permiso para eliminar esta promoción.', event: 'forbidden' },
    { status: 404, message: 'La promoción ya no existe.', event: 'not-found' },
  ])('handles HTTP $status and emits $event', async ({ status, message, event }) => {
    vi.mocked(deletePromotion).mockRejectedValueOnce(apiError(status))
    render(); await confirm()
    expect(wrapper.get('[role="alert"]').text()).toBe(message)
    expect(wrapper.emitted(event)).toHaveLength(1)
    expect(wrapper.emitted('deleted')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.get('button.danger').attributes('disabled')).toBeUndefined()
  })
  it.each([apiError(400), apiError(409), apiError(500), new Error('Offline')])('shows a generic notification for %p', async (error) => {
    vi.mocked(deletePromotion).mockRejectedValueOnce(error)
    render(); await confirm()
    const notification = wrapper.getComponent({ name: 'NotificationPopup' })
    expect(notification.props()).toMatchObject({ message: 'No se pudo eliminar la promoción.', type: 'error', duration: 0, placement: 'bottom-right' })
    expect(wrapper.emitted('deleted')).toBeUndefined()
  })
  it('allows dismissing the error and retrying', async () => {
    vi.mocked(deletePromotion).mockRejectedValueOnce(new Error('Offline'))
    render(); await confirm()
    wrapper.getComponent({ name: 'NotificationPopup' }).vm.$emit('close'); await nextTick()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    await confirm()
    expect(deletePromotion).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('deleted')).toHaveLength(1)
  })
  it('clears a previous error when the selected promotion changes', async () => {
    vi.mocked(deletePromotion).mockRejectedValueOnce(new Error('Offline'))
    render(); await confirm()
    await wrapper.setProps({ promotion: { id: 43, title: 'Otra promoción' } })
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('strong').text()).toBe('Otra promoción')
  })
  it('ignores a previous record deletion completion after the prop changes', async () => {
    const pending = deferred<void>(); vi.mocked(deletePromotion).mockReturnValueOnce(pending.promise)
    render(); await wrapper.get('button.danger').trigger('click')
    await wrapper.setProps({ promotion: { id: 43, title: 'Otra' } })
    pending.resolve(); await flushPromises()
    expect(wrapper.emitted('deleted')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
    await confirm()
    expect(deletePromotion).toHaveBeenLastCalledWith(43)
  })
  it('ignores pending failure after unmounting', async () => {
    const pending = deferred<void>(); vi.mocked(deletePromotion).mockReturnValueOnce(pending.promise)
    render(); await wrapper.get('button.danger').trigger('click')
    wrapper.unmount(); pending.reject(apiError(401)); await flushPromises()
    expect(wrapper.emitted('session-expired')).toBeUndefined()
    expect(wrapper.emitted('deleted')).toBeUndefined()
  })
})
