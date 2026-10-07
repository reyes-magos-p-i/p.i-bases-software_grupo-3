import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ProjectionDetailDialog from '@/components/projections/ProjectionDetailDialog.vue'
import type { ProjectionDetail } from '@/types/projection'

const { getProjectionDetail } = vi.hoisted(() => ({ getProjectionDetail: vi.fn() }))
vi.mock('@/services/projection.service', () => ({ getProjectionDetail }))

const detail: ProjectionDetail = {
  movieFunctionId: 100,
  movieId: 3,
  movieTitle: 'Spider-Man: Brand New Day',
  branchId: 2,
  branchName: 'Mall Oxígeno',
  theaterId: 7,
  startTime: '2099-07-22T21:00',
  endTime: '2099-07-23T01:55',
  status: 'CANCELLED',
  price: null,
  runningTime: 190,
  posterImage: 'spiderman.jpg',
  createdAt: '2099-07-01T09:30',
  cleaningMinutes: 30,
  advertisementMinutes: null,
}
const httpError = (status: number) => ({ isAxiosError: true, response: { status } })
const dialogPrototype = HTMLDialogElement.prototype
let wrapper: VueWrapper | undefined

function render(projectionId: number | null = 100) {
  wrapper = mount(ProjectionDetailDialog, { props: { projectionId }, attachTo: document.body })
  return wrapper
}

const isOpen = () => wrapper!.get('dialog').attributes('open') !== undefined

beforeEach(() => {
  getProjectionDetail.mockReset().mockResolvedValue(detail)
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

describe('ProjectionDetailDialog', () => {
  it('stays closed without a selection', async () => {
    render(null)
    await flushPromises()
    expect(isOpen()).toBe(false)
    expect(getProjectionDetail).not.toHaveBeenCalled()

    getProjectionDetail.mockReturnValueOnce(new Promise(() => {}))
    await wrapper!.setProps({ projectionId: 5 })
    await flushPromises()
    expect(wrapper!.text()).toContain('Cargando el detalle…')
  })

  it('shows every field of the selected projection', async () => {
    render()
    await flushPromises()

    expect(isOpen()).toBe(true)
    expect(getProjectionDetail).toHaveBeenCalledWith(100, expect.any(AbortSignal))
    expect(wrapper!.get('h2').text()).toBe('Detalle de proyección')
    const fields = Object.fromEntries(
      wrapper!.findAll('.detail-field').map((field) => [field.get('dt').text(), field.get('dd').text()]),
    )
    expect(fields).toMatchObject({
      'ID de proyección': 'MF-100',
      Estado: 'Cancelada',
      Sucursal: 'Mall Oxígeno',
      Sala: 'Sala 7',
      'Fecha de proyección': '22/07/2099',
      'Hora inicio': '9:00 pm',
      'Hora fin': '1:55 am',
      'Ocupación de la sala': '4 horas 55 minutos',
      Anuncios: 'Sin registrar',
      'Duración de la película': '190 minutos',
      Limpieza: '30 minutos',
      'Precio por persona': 'Sin precio',
      'Fecha de creación': '01/07/2099 9:30 am',
    })
    expect(wrapper!.get('.poster-title').text()).toBe(detail.movieTitle)
  })

  it.each([
    [404, 'Esta proyección ya no está disponible.', undefined],
    [403, 'No tienes permisos para realizar esta acción.', 'forbidden'],
    [500, 'No se pudo cargar el detalle, intenta de nuevo.', undefined],
  ])('explains a %i answer and retries', async (status, message, event) => {
    getProjectionDetail.mockRejectedValueOnce(httpError(status))
    render()
    await flushPromises()
    expect(wrapper!.get('[role="alert"]').text()).toContain(message)
    if (event) expect(wrapper!.emitted(event)).toHaveLength(1)

    await wrapper!.get('.link-button').trigger('click')
    await flushPromises()
    expect(getProjectionDetail).toHaveBeenCalledTimes(2)
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
  })

  it('reports an expired session', async () => {
    getProjectionDetail.mockRejectedValueOnce(httpError(401))
    render()
    await flushPromises()
    expect(wrapper!.emitted('sessionExpired')).toHaveLength(1)
  })

  it('closes from the button or when the selection is cleared', async () => {
    render()
    await flushPromises()
    await wrapper!.get('.close-button').trigger('click')
    expect(wrapper!.emitted('close')).toHaveLength(1)

    await wrapper!.setProps({ projectionId: null })
    expect(isOpen()).toBe(false)
  })

  it('ignores a detail replaced by another selection', async () => {
    let finishFirst!: (value: ProjectionDetail) => void
    getProjectionDetail.mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
    render()
    await flushPromises()
    await wrapper!.setProps({ projectionId: 101 })
    finishFirst({ ...detail, movieTitle: 'Otra' })
    await flushPromises()
    expect(wrapper!.get('.detail-title').text()).toBe(detail.movieTitle)

    getProjectionDetail.mockRejectedValueOnce(new Error('late'))
    await wrapper!.setProps({ projectionId: 102 })
    await wrapper!.setProps({ projectionId: null })
    await flushPromises()
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
  })
})
