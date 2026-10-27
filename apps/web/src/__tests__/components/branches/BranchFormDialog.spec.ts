import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import BranchFormDialog from '@/components/branches/BranchFormDialog.vue'
import type { CompanyOption } from '@/types/branch'

const companies: CompanyOption[] = [
  { id: 21, name: 'Cinetadel S.A' },
  { id: 22, name: null },
  { id: 23, name: 'Cinetadel del Pacifico' },
  { id: 24, name: 'Cinetadel del Caribe' },
]
type Dialog = VueWrapper<InstanceType<typeof BranchFormDialog>>
let wrapper: Dialog | undefined

function render(props: Record<string, unknown> = {}): Dialog {
  wrapper = mount(BranchFormDialog, { props: { companies, ...props }, attachTo: document.body })
  wrapper.vm.open()
  return wrapper
}
function fieldError(view: Dialog, selector: string) {
  const field = view.get(selector)
  if (field.attributes('aria-invalid') !== 'true') return ''
  return view.get(`#${field.attributes('aria-describedby')}`).text()
}
const nameError = (view: Dialog) => fieldError(view, 'input[name="name"]')
const companyError = (view: Dialog) => fieldError(view, 'select[name="companyId"]')
const button = (view: Dialog, text: string) =>
  view.findAll('button').find((item) => item.text() === text)!
async function fill(view: Dialog, name: string, companyId: number | '') {
  await view.get('input[name="name"]').setValue(name)
  await view.get('select[name="companyId"]').setValue(String(companyId))
  await view.get('form').trigger('submit')
}

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: vi.fn(),
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: vi.fn(),
  })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

describe('BranchFormDialog', () => {
  it('shows an empty Nombre and the named companies (UT-001)', () => {
    const view = render()
    expect(view.get('h2').text()).toBe('Crear sucursal')
    expect((view.get('input[name="name"]').element as HTMLInputElement).value).toBe('')
    expect(view.findAll('select[name="companyId"] option').map((option) => option.text())).toEqual([
      'Selecciona una compañía',
      'Cinetadel S.A',
      'Cinetadel del Pacifico',
      'Cinetadel del Caribe',
    ])
    expect((view.get('select[name="companyId"]').element as HTMLSelectElement).value).toBe('')
  })

  it.each([
    ['', 'El nombre es obligatorio'],
    ['   ', 'El nombre es obligatorio'],
    ['Sucursal 01', 'El nombre solo puede contener letras y espacios'],
    ['Heredia@Centro#', 'El nombre solo puede contener letras y espacios'],
    ['Sucursal-Norte.', 'El nombre solo puede contener letras y espacios'],
    [
      'Sucursal Gran Centro Comercial Heredia Norte Oestes',
      'El nombre debe tener entre 1 y 50 caracteres',
    ],
  ])('shows the alert under Nombre for %p and does not submit', async (name, message) => {
    const view = render()
    await fill(view, name, 21)
    expect(nameError(view)).toBe(message)
    expect(companyError(view)).toBe('')
    expect(view.emitted('submit')).toBeUndefined()
  })

  it('requires a company (UT-012)', async () => {
    const view = render()
    await fill(view, 'Sucursal Cartago', '')
    expect(companyError(view)).toBe('Debe seleccionar una compañía')
    expect(nameError(view)).toBe('')
    expect(view.emitted('submit')).toBeUndefined()
  })

  it('shows both alerts at the same time (UT-013)', async () => {
    const view = render()
    await fill(view, '', '')
    expect(nameError(view)).toBe('El nombre es obligatorio')
    expect(companyError(view)).toBe('Debe seleccionar una compañía')
  })

  it.each([
    ['A', 24],
    ['Sucursal Gran Centro Comercial Heredia Norte Oeste', 21],
    ['  Sucursal Peñas Blancas San Ramón ', 23],
  ])('submits the valid branch %p (UT-007, UT-008, UT-010, UT-011)', async (name, companyId) => {
    const view = render()
    await fill(view, name, companyId)
    expect(view.emitted('submit')).toEqual([[{ name: name.trim(), companyId }]])
    expect(view.find('[aria-invalid="true"]').exists()).toBe(false)
  })

  it('clears an alert once its field changes', async () => {
    const view = render()
    await fill(view, '', '')
    await view.get('input[name="name"]').setValue('Sucursal Heredia Centro')
    expect(nameError(view)).toBe('')
    expect(companyError(view)).toBe('Debe seleccionar una compañía')
  })

  it('keeps the typed data and shows the save error (UT-014)', async () => {
    const view = render()
    await fill(view, 'Sucursal Liberia', 23)
    await view.setProps({ submissionError: 'No se pudo crear la sucursal, intenta de nuevo' })
    expect(view.get('.form-error').text()).toBe('No se pudo crear la sucursal, intenta de nuevo')
    expect((view.get('input[name="name"]').element as HTMLInputElement).value).toBe(
      'Sucursal Liberia',
    )
    expect((view.get('select[name="companyId"]').element as HTMLSelectElement).value).toBe('23')
  })

  it('shows field errors returned by the API', async () => {
    const view = render()
    await fill(view, 'Sucursal Liberia', 23)
    await view.setProps({ submissionFieldErrors: { companyId: 'Debe seleccionar una compañía' } })
    expect(companyError(view)).toBe('Debe seleccionar una compañía')
  })

  it('blocks the form while saving and cancels only when idle', async () => {
    const view = render({ submitting: true })
    await view.vm.$nextTick()
    expect(view.get('button[type="submit"]').text()).toBe('Guardando…')
    expect(view.get('input[name="name"]').attributes('disabled')).toBeDefined()
    await view.get('form').trigger('submit')
    await button(view, 'Cancelar').trigger('click')
    expect(view.emitted('submit')).toBeUndefined()
    expect(view.emitted('close')).toBeUndefined()

    await view.setProps({ submitting: false })
    await button(view, 'Cancelar').trigger('click')
    expect(view.emitted('close')).toHaveLength(1)
  })

  it('offers to retry the companies when they fail to load', async () => {
    const view = render({ companiesError: true })
    await view.vm.$nextTick()
    expect(view.text()).toContain('No se pudieron cargar las compañías.')
    await button(view, 'Reintentar').trigger('click')
    expect(view.emitted('retryCompanies')).toHaveLength(1)
    await view.setProps({ companiesError: false, companiesLoading: true })
    expect(view.text()).toContain('Cargando compañías…')
    expect(view.get('select[name="companyId"]').attributes('disabled')).toBeDefined()
  })

  it('starts empty again after a completed save', async () => {
    const view = render()
    await fill(view, 'Sucursal Liberia', 23)
    view.vm.complete()
    view.vm.open()
    await view.vm.$nextTick()
    expect((view.get('input[name="name"]').element as HTMLInputElement).value).toBe('')
    expect(view.find('[aria-invalid="true"]').exists()).toBe(false)
  })
})
