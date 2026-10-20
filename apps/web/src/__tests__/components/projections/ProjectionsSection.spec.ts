import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ProjectionsSection from '@/components/projections/ProjectionsSection.vue'
import ProjectionFormDialog from '@/components/projections/ProjectionFormDialog.vue'
import ProjectionListPanel from '@/components/projections/ProjectionListPanel.vue'
import CancelProjectionDialog from '@/components/projections/CancelProjectionDialog.vue'
import {
  invalidateEmployeeSession,
  restoreEmployeeSession,
} from '@/services/employee-session.service'
import type { CreateProjectionRequest, ProjectionDetail } from '@/types/projection'

const {
  getProjectionSchedulingOptions,
  createProjections,
  replace,
  getProjections,
  getProjectionFilterOptions,
  getProjectionDetail,
  updateProjection,
  cancelProjection,
} = vi.hoisted(() => ({
  getProjections: vi.fn(),
  getProjectionFilterOptions: vi.fn(),
  getProjectionDetail: vi.fn(),
  updateProjection: vi.fn(),
  cancelProjection: vi.fn(),
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
  getProjectionDetail,
  updateProjection,
  cancelProjection,
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

  describe('modification', () => {
    const detail = {
      movieFunctionId: 100,
      movieId: 3,
      movieTitle: 'The Odyssey',
      branchId: 2,
      branchName: 'Mall Oxígeno',
      theaterId: 7,
      startTime: '2099-07-22T21:00',
      endTime: '2099-07-23T00:55',
      status: 'ACTIVE',
      price: 3500,
      runningTime: 190,
      posterImage: 'o.jpg',
      createdAt: '2099-07-01T09:30',
      cleaningMinutes: 30,
      advertisementMinutes: 15,
    } as ProjectionDetail
    const changes = { movieId: 3, theaterId: 7, price: 4200 } as never

    async function startEditing() {
      render()
      wrapper!.getComponent(ProjectionListPanel).vm.$emit('edit', 100)
      await flushPromises()
    }

    beforeEach(() => {
      getProjectionDetail.mockResolvedValue(detail)
      updateProjection.mockResolvedValue(detail)
    })

    it('opens the selected projection in the form and saves its changes', async () => {
      await startEditing()
      expect(getProjectionDetail).toHaveBeenCalledWith(100, expect.any(AbortSignal))
      expect(getProjectionSchedulingOptions).toHaveBeenCalled()
      expect(form().get('h2').text()).toBe('Modificar proyección')
      expect(form().get('dialog').attributes('open')).toBeDefined()

      form().vm.$emit('save', changes)
      await flushPromises()
      expect(updateProjection).toHaveBeenCalledExactlyOnceWith(100, changes)
      expect(createProjections).not.toHaveBeenCalled()
      expect(wrapper!.get('.creation-result').text()).toBe(
        'Se guardaron los cambios de la proyección MF-100.',
      )
      expect(form().get('dialog').attributes('open')).toBeUndefined()
      expect(getProjections).toHaveBeenCalledTimes(2)
    })

    it.each([
      [httpError(404), ['Esta proyección ya no está disponible.']],
      [httpError(409, 'El elemento seleccionado ya no está disponible.'), ['El elemento seleccionado ya no está disponible.']],
      [new Error('Network Error'), ['No se pudieron guardar los cambios, intenta de nuevo.']],
    ])('keeps the entered data when saving fails %#', async (error, messages) => {
      updateProjection.mockRejectedValueOnce(error)
      await startEditing()
      form().vm.$emit('save', changes)
      await flushPromises()
      expect(form().props('submissionErrors')).toEqual(messages)
      expect(form().get('dialog').attributes('open')).toBeDefined()
    })

    it.each([
      [404, 'Esta proyección ya no está disponible.'],
      [403, 'No tienes permisos para realizar esta acción.'],
      [500, 'No se pudo cargar el detalle, intenta de nuevo.'],
    ])('explains a projection that cannot be loaded (%i)', async (status, message) => {
      getProjectionDetail.mockRejectedValueOnce(httpError(status))
      await startEditing()
      expect(wrapper!.get('.edit-error').text()).toBe(message)
      expect(form().get('dialog').attributes('open')).toBeUndefined()
    })

    it('handles an expired session, a newer selection and creation afterwards', async () => {
      getProjectionDetail.mockRejectedValueOnce(httpError(401))
      await startEditing()
      expect(invalidateEmployeeSession).toHaveBeenCalled()

      let finishFirst!: (value: ProjectionDetail) => void
      getProjectionDetail.mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
      const list = wrapper!.getComponent(ProjectionListPanel)
      list.vm.$emit('edit', 100)
      await flushPromises()
      expect(wrapper!.text()).toContain('Cargando la proyección…')
      list.vm.$emit('edit', 101)
      finishFirst({ ...detail, movieTitle: 'Old' })
      await flushPromises()
      expect(form().vm.$el).toBeDefined()

      await wrapper!.get('.add-user-button').trigger('click')
      form().vm.$emit('save', changes)
      await flushPromises()
      expect(updateProjection).not.toHaveBeenCalled()
    })
  })

})

describe('cancellation', () => {
  const projection = {
    movieFunctionId: 21,
    movieId: 42,
    movieTitle: 'The Odyssey',
    branchId: 2,
    branchName: 'Mall Oxígeno',
    theaterId: 1,
    startTime: '2099-10-08T14:55',
    endTime: '2099-10-08T18:30',
    status: 'ACTIVE',
    price: 3500,
  } as ProjectionDetail

  beforeEach(() => vi.spyOn(window, 'scrollTo').mockImplementation(() => {}))

  it('confirms a cancellation requested from the list', async () => {
    render()
    await flushPromises()
    const cancelDialog = wrapper!.getComponent(CancelProjectionDialog)
    expect(cancelDialog.props('projection')).toBeNull()
    wrapper!.getComponent(ProjectionListPanel).vm.$emit('cancel', projection)
    await flushPromises()
    expect(cancelDialog.props('projection')).toEqual(projection)

    cancelDialog.vm.$emit('cancelled', { ...projection, status: 'CANCELLED' })
    await flushPromises()
    expect(cancelDialog.props('projection')).toBeNull()
    expect(wrapper!.get('.creation-result').text()).toBe(
      'La proyección MF-021 fue cancelada. La sala queda disponible para programar en ese horario.',
    )
    expect(getProjections).toHaveBeenCalledTimes(2)

    wrapper!.getComponent(ProjectionListPanel).vm.$emit('cancel', projection)
    await flushPromises()
    cancelDialog.vm.$emit('close')
    cancelDialog.vm.$emit('sessionExpired')
    cancelDialog.vm.$emit('forbidden')
    await flushPromises()
    expect(cancelDialog.props('projection')).toBeNull()
    expect(invalidateEmployeeSession).toHaveBeenCalled()
    expect(restoreEmployeeSession).toHaveBeenCalled()
  })

  it('closes the modification form of the cancelled projection', async () => {
    getProjectionDetail.mockResolvedValue({ ...projection, runningTime: 170, posterImage: 'o.jpg' })
    render()
    wrapper!.getComponent(ProjectionListPanel).vm.$emit('edit', 21)
    await flushPromises()
    expect(form().get('dialog').attributes('open')).toBeDefined()

    form().vm.$emit('cancel', projection)
    await flushPromises()
    const cancelDialog = wrapper!.getComponent(CancelProjectionDialog)
    expect(cancelDialog.props('projection')).toEqual(projection)
    cancelDialog.vm.$emit('cancelled', { ...projection, status: 'CANCELLED' })
    await flushPromises()
    expect(form().get('dialog').attributes('open')).toBeUndefined()

    form().vm.$emit('save', {} as never)
    await flushPromises()
    expect(updateProjection).not.toHaveBeenCalled()
  })
})
