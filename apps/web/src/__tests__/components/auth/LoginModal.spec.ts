import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import LoginModal from '@/components/auth/LoginModal.vue'
import SocialAuthButtons from '@/components/auth/SocialAuthButtons.vue'
import { nextTick } from 'vue'

describe('LoginModal', () => {
  const wrappers: VueWrapper[] = []
  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
  })
  function render(props: Partial<InstanceType<typeof LoginModal>['$props']> = {}) {
    const wrapper = mount(LoginModal, {
      props: { open: true, ...props },
      attachTo: document.body,
      global: {
        stubs: {
          BaseModal: {
            props: ['open', 'title'],
            emits: ['close'],
            template:
              '<section v-if="open"><h2>{{ title }}</h2><button class="close" @click="$emit(\'close\')">Cerrar</button><slot /></section>',
          },
        },
      },
    })
    wrappers.push(wrapper)
    return wrapper
  }

  it.each(['client', 'employee'] as const)(
    'renders %s with required fields and pending actions',
    (mode) => {
      const wrapper = render({ mode })
      expect(wrapper.get('h2').text()).toBe(
        mode === 'client' ? 'Iniciar sesión' : 'Inicio de sesión del personal',
      )
      expect(wrapper.findAll('.bi-google')).toHaveLength(mode === 'client' ? 1 : 0)
      expect(wrapper.text()).toContain('estará disponible próximamente')
      expect(wrapper.get<HTMLButtonElement>('[type="submit"]').element.disabled).toBe(true)
      expect(wrapper.findAll('label .required-mark')).toHaveLength(2)
      for (const name of ['email', 'password']) {
        const control = wrapper.get<HTMLInputElement>(`[name="${name}"]`)
        expect(control.element.required).toBe(true)
        expect(wrapper.find(`label[for="${control.attributes('id')}"]`).exists()).toBe(true)
      }
      expect(wrapper.get('[name="password"]').attributes('autocomplete')).toBe('current-password')
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    },
  )

  it('offers client social sign-in and forwards the authenticated identity', async () => {
    const wrapper = render({ mode: 'client' })
    const identity = {
      id: 7,
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'Perez',
    }
    const socialButtons = wrapper.getComponent(SocialAuthButtons)

    expect(socialButtons.props('disabled')).toBe(false)
    socialButtons.vm.$emit('authenticated', identity)

    expect(wrapper.emitted('authenticated')).toEqual([[identity]])
  })

  it('shows email feedback after blur and clears it as the value is corrected', async () => {
    const wrapper = render()
    const email = wrapper.get<HTMLInputElement>('[name="email"]')
    await email.setValue('invalid')
    expect(
      wrapper.findAll('.field-error').every((error) => error.attributes('aria-hidden') === 'true'),
    ).toBe(true)
    await email.trigger('blur')
    expect(email.attributes('aria-invalid')).toBe('true')
    expect(wrapper.get(`[id="${email.attributes('aria-describedby')}"]`).text()).toContain('válido')
    await email.setValue('staff@example.com')
    expect(email.attributes('aria-invalid')).toBe('false')
    expect(email.attributes('aria-describedby')).toBeUndefined()
  })

  it.each(['', 'invalid'])(
    'does not flash feedback when leaving email %p to switch login modes',
    async (value) => {
      const wrapper = render()
      const email = wrapper.get<HTMLInputElement>('[name="email"]')
      await email.setValue(value)
      const feedback = wrapper.get('.field-error')
      const originalFeedback = feedback.element
      expect(feedback.attributes('aria-hidden')).toBe('true')
      const originalMessage = feedback.text()
      const switchButton = wrapper.get<HTMLButtonElement>('.switch-mode')
      email.element.focus()
      switchButton.element.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }),
      )
      await nextTick()
      expect(wrapper.get('.field-error').element).toBe(originalFeedback)
      expect(feedback.text()).toBe(originalMessage)
      expect(document.activeElement).toBe(switchButton.element)
      expect(feedback.attributes('aria-hidden')).toBe('true')
      expect(email.attributes('aria-invalid')).toBe('false')
      await switchButton.trigger('click')
      expect(wrapper.emitted('switchMode')).toEqual([['employee']])
      expect(wrapper.emitted('submit')).toBeUndefined()
    },
  )

  it.each(['email', 'password'] as const)(
    'does not validate %s when keyboard focus moves to the mode switch',
    async (field) => {
      const wrapper = render({ mode: 'employee', enabled: true })
      const control = wrapper.get<HTMLInputElement>(`[name="${field}"]`)
      control.element.focus()
      wrapper.get<HTMLButtonElement>('.switch-mode').element.focus()
      await nextTick()
      expect(control.attributes('aria-invalid')).toBe('false')
      expect(control.attributes('aria-describedby')).toBeUndefined()
      await wrapper.get('.switch-mode').trigger('click')
      expect(wrapper.emitted('switchMode')).toEqual([['client']])
    },
  )

  it('keeps touch navigation free of errors and validates normally after a cancelled gesture', async () => {
    const wrapper = render()
    const email = wrapper.get<HTMLInputElement>('[name="email"]')
    const password = wrapper.get<HTMLInputElement>('[name="password"]')
    const switchButton = wrapper.get<HTMLButtonElement>('.switch-mode')
    email.element.focus()
    switchButton.element.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'touch' }),
    )
    await nextTick()
    expect(document.activeElement).toBe(switchButton.element)
    expect(email.attributes('aria-invalid')).toBe('false')
    await switchButton.trigger('pointercancel')
    expect(wrapper.emitted('switchMode')).toBeUndefined()
    email.element.focus()
    password.element.focus()
    await nextTick()
    expect(email.attributes('aria-invalid')).toBe('true')
    await password.trigger('blur')
    expect(password.attributes('aria-invalid')).toBe('true')
  })

  it('validates required fields, focuses the first error and never emits invalid credentials', async () => {
    const wrapper = render({ enabled: true })
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Introduce tu correo electrónico')
    expect(wrapper.text()).toContain('Introduce tu contraseña')
    expect(document.activeElement).toBe(wrapper.get('[name="email"]').element)
    await wrapper.get('[name="email"]').setValue('staff@example.com')
    await wrapper.get('form').trigger('submit')
    expect(document.activeElement).toBe(wrapper.get('[name="password"]').element)
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('checks field length without silently truncating input', async () => {
    const wrapper = render({ enabled: true })
    await wrapper.get('[name="email"]').setValue('a'.repeat(145) + '@example.com')
    await wrapper.get('[name="password"]').setValue('🎬'.repeat(129))
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('El correo electrónico es demasiado largo.')
    expect(wrapper.text()).toContain('128 caracteres')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('normalizes email but preserves the exact password without registration complexity rules', async () => {
    const wrapper = render({ enabled: true, mode: 'employee' })
    await wrapper.get('[name="email"]').setValue(' Staff@Example.COM ')
    await wrapper.get('[name="password"]').setValue(' simple password 🎬 ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toEqual([
      [{ email: 'staff@example.com', password: ' simple password 🎬 ' }],
    ])
  })

  it('cannot submit while unavailable or loading, even through a form event', async () => {
    const wrapper = render()
    await wrapper.get('[name="email"]').setValue('staff@example.com')
    await wrapper.get('[name="password"]').setValue('password')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
    await wrapper.setProps({ enabled: true, submitting: true })
    await wrapper.get('form').trigger('submit')
    await wrapper.get('.switch-mode').trigger('click')
    expect(wrapper.get('form').attributes('aria-busy')).toBe('true')
    expect(wrapper.text()).toContain('Iniciando sesión')
    expect(wrapper.get<HTMLInputElement>('[name="email"]').element.disabled).toBe(true)
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.emitted('switchMode')).toBeUndefined()
    await wrapper.get('.close').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('blocks submission until the server retry delay ends without treating login as unavailable', async () => {
    const wrapper = render({ enabled: true, mode: 'employee', retryAfterSeconds: 12 })
    await wrapper.get('[name="email"]').setValue('staff@example.com')
    await wrapper.get('[name="password"]').setValue('password')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('12 segundos')
    expect(wrapper.text()).not.toContain('El inicio de sesión estará disponible')
    expect(wrapper.get<HTMLButtonElement>('[type="submit"]').element.disabled).toBe(true)
    expect(wrapper.emitted('submit')).toBeUndefined()
    await wrapper.setProps({ retryAfterSeconds: 0 })
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toHaveLength(1)
  })

  it('toggles visibility and clears the password immediately on mode switch or close', async () => {
    const wrapper = render()
    await wrapper.get('[name="password"]').setValue('secret')
    await wrapper.get('.password-toggle').trigger('click')
    expect(wrapper.get('[name="password"]').attributes('type')).toBe('text')
    expect(wrapper.get('.password-toggle').attributes('aria-label')).toBe('Ocultar contraseña')
    await wrapper.get('.password-toggle').trigger('click')
    expect(wrapper.get('[name="password"]').attributes('type')).toBe('password')
    await wrapper.get('.switch-mode').trigger('click')
    expect(wrapper.emitted('switchMode')).toEqual([['employee']])
    expect(wrapper.get<HTMLInputElement>('[name="password"]').element.value).toBe('')
    await wrapper.setProps({ mode: 'employee' })
    await wrapper.get('.switch-mode').trigger('click')
    expect(wrapper.emitted('switchMode')?.[1]).toEqual(['client'])
    await wrapper.get('[name="password"]').setValue('another secret')
    await wrapper.get('.close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.get<HTMLInputElement>('[name="password"]').element.value).toBe('')
  })

  it('clears state after external close and reopening', async () => {
    const wrapper = render()
    await wrapper.get('[name="email"]').setValue('invalid')
    await wrapper.get('[name="email"]').trigger('blur')
    await wrapper.get('[name="password"]').setValue('secret')
    await wrapper.get('.password-toggle').trigger('click')
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    await nextTick()
    expect(wrapper.get<HTMLInputElement>('[name="email"]').element.value).toBe('')
    expect(wrapper.get<HTMLInputElement>('[name="password"]').element.value).toBe('')
    expect(wrapper.get('[name="password"]').attributes('type')).toBe('password')
    expect(
      wrapper.findAll('.field-error').every((error) => error.attributes('aria-hidden') === 'true'),
    ).toBe(true)
    expect(document.activeElement).toBe(wrapper.get('[name="email"]').element)
  })

  it('announces a supplied server error without treating it as markup', async () => {
    const wrapper = render({ enabled: true })
    await wrapper.setProps({ errorMessage: '<strong>Credenciales incorrectas</strong>' })
    await nextTick()
    expect(wrapper.get('[role="alert"]').text()).toContain('<strong>')
    expect(wrapper.find('strong').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('[role="alert"]').element)
  })
})
