import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ProjectionsSection from '@/components/projections/ProjectionsSection.vue'
import ProjectionFormDialog from '@/components/projections/ProjectionFormDialog.vue'
import {
  invalidateEmployeeSession,
  restoreEmployeeSession,
} from '@/services/employee-session.service'
import type { CreateProjectionRequest } from '@/types/projection'

const {
  getProjectionSchedulingOptions,
  createProjections,
  replace,
  getProjections,
  getProjectionFilterOptions,
} = vi.hoisted(() => ({
  getProjections: vi.fn(),
  getProjectionFilterOptions: vi.fn(),
  getProjectionSchedulingOptions: vi.fn(),
  createProjections: vi.fn(),
  replace: vi.fn(),
}))
vi.mock('@/services/projection.service', () => ({
  getProjectionSchedulingOptions,
  createProjections,
  searchAvailableMovies: vi.fn(),
  getProjections,
  getProjectionFilterOptions,
}))
vi.mock('@/services/employee-session.service', () => ({
  invalidateEmployeeSession: vi.fn(),
  restoreEmployeeSession: vi.fn(),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))

const payload = { movieId: 3, theaterId: 7 } as CreateProjectionRequest
const options = {
  cinemas: [{ branchId: 2, name: 'Mall Oxígeno' }],
  theaters: [{ theaterId: 7, branchId: 2, numberOfSeats: 80 }],
  defaultTicketPrice: 3500,
}
const httpError = (status: number, message?: unknown) => ({
  isAxiosError: true,
  response: { status, data: { message } },
})

let wrapper: VueWrapper | undefined
const dialogPrototype = HTMLDialogElement.prototype

function render(disabled = false) {
  wrapper = mount(ProjectionsSection, { props: { disabled }, attachTo: document.body })
  return wrapper
}

const form = () => wrapper!.getComponent(ProjectionFormDialog)

async function submit() {
  form().vm.$emit('submit', payload)
  await flushPromises()
}

beforeEach(() => {
  vi.resetAllMocks()
  getProjectionSchedulingOptions.mockResolvedValue(options)
  getProjections.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 })
  getProjectionFilterOptions.mockResolvedValue({ cinemas: [], theaters: [], movies: [] })
  createProjections.mockResolvedValue({ status: 'ACTIVE', price: 4500, projections: [{}] })
  vi.mocked(restoreEmployeeSession).mockResolvedValue({ id: 21 } as never)
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
        this.removeAttribute('open')
      }),
    },
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  Reflect.deleteProperty(dialogPrototype, 'showModal')
  Reflect.deleteProperty(dialogPrototype, 'close')
  document.body.innerHTML = ''
})

describe('ProjectionsSection', () => {
  it('loads the scheduling options once when opening the form', async () => {
    render()
    await wrapper!.get('.add-user-button').trigger('click')
    await flushPromises()
    await wrapper!.get('.add-user-button').trigger('click')
    await flushPromises()

    expect(getProjectionSchedulingOptions).toHaveBeenCalledTimes(1)
    expect(form().props('cinemas')).toEqual(options.cinemas)
    expect(form().props('theaters')).toEqual(options.theaters)
    expect(form().props('defaultPrice')).toBe(3500)
    expect(form().get('dialog').attributes('open')).toBeDefined()
  })

  it.each([
    [403, 'No tienes permisos para realizar esta acción.'],
    [500, 'No se pudieron cargar las sucursales y salas. Inténtalo nuevamente.'],
  ])('reports option failures with status %i and retries', async (status, message) => {
    getProjectionSchedulingOptions.mockRejectedValueOnce(httpError(status))
    render()
    await wrapper!.get('.add-user-button').trigger('click')
    await flushPromises()
    expect(form().props('optionsError')).toBe(message)

    form().vm.$emit('retryOptions')
    await flushPromises()
    expect(form().props('optionsError')).toBe('')
    expect(getProjectionSchedulingOptions).toHaveBeenCalledTimes(2)
  })

  it('leaves the dashboard when the session expired', async () => {
    getProjectionSchedulingOptions.mockRejectedValueOnce(httpError(401))
    render()
    await wrapper!.get('.add-user-button').trigger('click')
    await flushPromises()
    expect(invalidateEmployeeSession).toHaveBeenCalled()

    form().vm.$emit('sessionExpired')
    await submit()
    expect(replace).toHaveBeenCalledTimes(2)
  })

  it('confirms the projections created and closes the form', async () => {
    render()
    await wrapper!.get('.add-user-button').trigger('click')
    await submit()

    expect(createProjections).toHaveBeenCalledExactlyOnceWith(payload)
    expect(getProjections).toHaveBeenCalledTimes(2)
    expect(wrapper!.find('.preview-placeholder').exists()).toBe(false)
    expect(wrapper!.get('.creation-result').text()).toBe('Se creó 1 proyección.')
    expect(document.activeElement).toBe(wrapper!.get('.creation-result').element)
    expect(form().get('dialog').attributes('open')).toBeUndefined()
    expect(wrapper!.emitted('busy')).toEqual([[true], [false]])

    createProjections.mockResolvedValueOnce({ status: 'INACTIVE', projections: [{}, {}, {}] })
    await submit()
    expect(wrapper!.get('.creation-result').text()).toBe(
      'Se crearon 3 proyecciones. Está en estado inactiva: no será visible para los Clientes hasta activarla.',
    )
  })

  it.each([
    [httpError(409, 'La sala ya tiene una proyección asignada en ese horario.'), ['La sala ya tiene una proyección asignada en ese horario.']],
    [httpError(400, ['Introduce una hora válida (HH:mm).', ' ']), ['Introduce una hora válida (HH:mm).']],
    [httpError(400), ['Revisa los datos de la proyección e inténtalo nuevamente.']],
    [httpError(403), ['No tienes permisos para realizar esta acción.']],
    [new Error('Network Error'), ['No se pudo crear la proyección, intenta de nuevo.']],
  ])('keeps the form open and explains failure %#', async (error, messages) => {
    createProjections.mockRejectedValueOnce(error)
    render()
    await wrapper!.get('.add-user-button').trigger('click')
    await submit()

    expect(form().props('submissionErrors')).toEqual(messages)
    expect(form().get('dialog').attributes('open')).toBeDefined()
    expect(wrapper!.find('.creation-result').exists()).toBe(false)
  })

  it('does nothing while disabled', async () => {
    render(true)
    await wrapper!.get('.add-user-button').trigger('click')
    await submit()
    expect(getProjectionSchedulingOptions).not.toHaveBeenCalled()
    expect(createProjections).not.toHaveBeenCalled()
  })

  it('ignores answers that arrive after leaving the section', async () => {
    let finish!: (value: unknown) => void
    createProjections.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    render()
    form().vm.$emit('submit', payload)
    form().vm.$emit('submit', payload)
    wrapper!.unmount()
    finish({ status: 'ACTIVE', projections: [] })
    await flushPromises()
    expect(createProjections).toHaveBeenCalledTimes(1)
    wrapper = undefined
  })
})
