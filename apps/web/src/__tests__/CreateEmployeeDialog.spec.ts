import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import CreateEmployeeDialog from '@/components/users/CreateEmployeeDialog.vue'

let wrapper: VueWrapper<InstanceType<typeof CreateEmployeeDialog>> | undefined
let opener: HTMLButtonElement
const dialogPrototype = HTMLDialogElement.prototype
const originalShowModal = Object.getOwnPropertyDescriptor(dialogPrototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(dialogPrototype, 'close')

beforeEach(() => {
  opener = document.createElement('button')
  opener.textContent = 'Añadir empleado'
  document.body.append(opener)
  // jsdom does not implement the native dialog methods.
  Object.defineProperties(dialogPrototype, {
    showModal: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.setAttribute('open', '')
      }),
    },
    close: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        if (!this.open) return
        this.removeAttribute('open')
        this.dispatchEvent(new Event('close'))
      }),
    },
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  for (const [name, descriptor] of [
    ['showModal', originalShowModal],
    ['close', originalClose],
  ] as const) {
    if (descriptor) Object.defineProperty(dialogPrototype, name, descriptor)
    else Reflect.deleteProperty(dialogPrototype, name)
  }
  document.body.innerHTML = ''
})

async function renderDialog(
  props: Partial<InstanceType<typeof CreateEmployeeDialog>['$props']> = {},
) {
  wrapper = mount(CreateEmployeeDialog, { props, attachTo: document.body })
  opener.focus()
  wrapper.vm.open()
  await nextTick()
  return wrapper
}

describe('CreateEmployeeDialog', () => {
  it('opens a labelled modal and focuses the first field without opening twice', async () => {
    const view = await renderDialog()
    const dialog = view.get<HTMLDialogElement>('dialog')

    expect(dialog.element.open).toBe(true)
    expect(dialog.attributes('aria-labelledby')).toBe(view.get('h2').attributes('id'))
    expect(view.get('h2').text()).toBe('Crear empleado')
    expect(document.activeElement).toBe(view.get('[name="firstName"]').element)
    view.vm.open()
    expect(dialog.element.showModal).toHaveBeenCalledOnce()
  })

  it('provides the employee fields with persistent labels and marks only second name optional', async () => {
    const view = await renderDialog()
    const required = [
      'firstName',
      'firstSurname',
      'secondSurname',
      'birthday',
      'email',
      'phoneNumber',
      'role',
      'addressId',
      'branchId',
    ]

    expect(view.findAll('input, select')).toHaveLength(10)
    for (const name of required) {
      const field = view.get('[name="' + name + '"]')
      expect(field.attributes('required')).toBeDefined()
      expect(view.find('label[for="' + field.attributes('id') + '"]').exists()).toBe(true)
    }
    expect(view.get('[name="secondName"]').attributes('required')).toBeUndefined()
    expect(view.get('[name="birthday"]').attributes('type')).toBe('date')
    expect(view.get('[name="email"]').attributes('type')).toBe('email')
    expect(view.get('[name="phoneNumber"]').attributes('type')).toBe('tel')
    expect(view.find('input[type="password"]').exists()).toBe(false)
    expect(view.text()).not.toContain('cédula')
    expect(view.text()).toContain('El sistema generará la contraseña inicial')
  })

  it('allows employee and administrator roles with a corresponding dialog title', async () => {
    const view = await renderDialog()
    const role = view.get('select[name="role"]')
    expect(role.findAll('option').map((option) => option.attributes('value'))).toEqual([
      'EMPLOYEE',
      'ADMINISTRATOR',
    ])

    await role.setValue('ADMINISTRATOR')
    expect(view.get('h2').text()).toBe('Crear administrador')
    await role.setValue('EMPLOYEE')
    expect(view.get('h2').text()).toBe('Crear empleado')
  })

  it('explains empty catalogs without inventing selectable records', async () => {
    const view = await renderDialog()

    for (const name of ['addressId', 'branchId']) {
      const select = view.get('select[name="' + name + '"]')
      expect(select.attributes('disabled')).toBeDefined()
      expect(select.findAll('option')).toHaveLength(1)
      expect(select.get('option').attributes('value')).toBe('')
      expect(select.get('option').attributes('disabled')).toBeDefined()
      expect(view.get('[id="' + select.attributes('aria-describedby') + '"]').text()).toContain(
        'disponibles',
      )
    }
  })

  it('accepts labelled catalog entries and preserves the selected identifiers', async () => {
    const view = await renderDialog({
      addresses: [{ id: 4, label: 'San José, dirección de prueba' }],
      branches: [{ id: 7, label: 'Sucursal de prueba' }],
    })
    const address = view.get<HTMLSelectElement>('[name="addressId"]')
    const branch = view.get<HTMLSelectElement>('[name="branchId"]')

    expect(address.attributes('disabled')).toBeUndefined()
    expect(branch.attributes('disabled')).toBeUndefined()
    expect(address.get('option[value="4"]').text()).toBe('San José, dirección de prueba')
    expect(branch.get('option[value="7"]').text()).toBe('Sucursal de prueba')
    await address.setValue('4')
    await branch.setValue('7')
    await view.get('.cancel-button').trigger('click')
    view.vm.open()

    expect(address.element.value).toBe('4')
    expect(branch.element.value).toBe('7')
    expect(view.find('.field-help').exists()).toBe(false)
    expect(view.get('[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it.each(['cancel', 'close-button', 'escape', 'native-close'])(
    'closes through %s and returns focus to the opener',
    async (method) => {
      const view = await renderDialog()
      const dialog = view.get<HTMLDialogElement>('dialog')
      if (method === 'cancel') await view.get('.cancel-button').trigger('click')
      if (method === 'close-button') await view.get('.close-button').trigger('click')
      if (method === 'escape') await dialog.trigger('cancel')
      if (method === 'native-close') dialog.element.close()

      expect(dialog.element.open).toBe(false)
      expect(document.activeElement).toBe(opener)
    },
  )

  it('keeps the local draft when reopened and does not dismiss on a backdrop click', async () => {
    const view = await renderDialog()
    await view.get('[name="firstName"]').setValue('Ana')
    await view.get('[name="email"]').setValue('ana@example.com')
    await view.get('[name="role"]').setValue('ADMINISTRATOR')
    await view.get('dialog').trigger('click')
    expect(view.get<HTMLDialogElement>('dialog').element.open).toBe(true)

    await view.get('.close-button').trigger('click')
    view.vm.open()

    expect(view.get<HTMLInputElement>('[name="firstName"]').element.value).toBe('Ana')
    expect(view.get<HTMLInputElement>('[name="email"]').element.value).toBe('ana@example.com')
    expect(view.get('h2').text()).toBe('Crear administrador')
  })

  it('wraps keyboard focus around the enabled controls and leaves interior navigation to the browser', async () => {
    const view = await renderDialog()
    const first = view.get<HTMLButtonElement>('.close-button')
    const last = view.get<HTMLButtonElement>('.cancel-button')

    first.element.focus()
    await first.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last.element)
    await last.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(first.element)

    const input = view.get<HTMLInputElement>('[name="firstName"]')
    input.element.focus()
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    input.element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('prevents submission and explains why creation is disabled', async () => {
    const view = await renderDialog()
    const submit = view.get('[type="submit"]')
    const event = new Event('submit', { bubbles: true, cancelable: true })

    view.get('form').element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(submit.attributes('disabled')).toBeDefined()
    expect(view.get('[id="' + submit.attributes('aria-describedby') + '"]').text()).toContain(
      'todavía no está habilitada',
    )
    expect(view.emitted('submit')).toBeUndefined()
    expect(view.get<HTMLDialogElement>('dialog').element.open).toBe(true)
  })

  it('releases the native modal when the component is removed', async () => {
    const view = await renderDialog()
    const dialog = view.get<HTMLDialogElement>('dialog').element

    view.unmount()

    expect(dialog.open).toBe(false)
  })
})
