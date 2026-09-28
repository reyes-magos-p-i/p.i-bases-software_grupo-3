import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import LoginModal from '@/components/auth/LoginModal.vue'
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

  it('shows email feedback after blur and clears it as the value is corrected', async () => {
    const wrapper = render()
    const email = wrapper.get<HTMLInputElement>('[name="email"]')
    await email.setValue('invalid')
    expect(wrapper.find('.field-error').exists()).toBe(false)
    await email.trigger('blur')
    expect(email.attributes('aria-invalid')).toBe('true')
    expect(wrapper.get(`[id="${email.attributes('aria-describedby')}"]`).text()).toContain('válido')
    await email.setValue('staff@example.com')
    expect(email.attributes('aria-invalid')).toBe('false')
    expect(email.attributes('aria-describedby')).toBeUndefined()
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
    expect(wrapper.find('.field-error').exists()).toBe(false)
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
