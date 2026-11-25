// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import PromotionSection from '@/components/promotions/PromotionsSection.vue'
import { getBranches } from '@/services/branch.service'
import { getPromotions } from '@/services/promotion.service'
import type { BranchListItem, BranchListResult } from '@/types/branch'

// Mock only network access; keep the service's real formatBranchId implementation.
vi.mock('@/services/branch.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/branch.service')>()
  return { ...actual, getBranches: vi.fn() }
})
// The creation form has its own spec; this section tests its props/events only.
vi.mock('@/components/promotions/PromotionCreate.vue', () => ({
  default: {
    name: 'PromotionCreate',
    props: ['cinemas', 'mode', 'promotionId'],
    emits: ['close', 'saved', 'session-expired', 'forbidden'],
    template: '<div data-testid="promotion-create" />',
  },
}))

vi.mock('@/services/promotion.service', () => ({ getPromotions: vi.fn() }))
vi.mock('@/components/promotions/PromotionList.vue', () => ({
  default: {
    name: 'PromotionList', props: ['promotions', 'loading', 'error'], emits: ['view', 'edit', 'delete', 'retry'],
    template: '<div data-testid="promotion-list" />',
  },
}))

vi.mock('@/components/promotions/PromotionView.vue', () => ({
  default: {
    name: 'PromotionView', props: ['promotionId', 'cinemas'],
    emits: ['close', 'sessionExpired', 'forbidden'],
    template: '<div data-testid="promotion-view" />',
  },
}))
vi.mock('@/components/common/LoadingState.vue', () => ({
  default: { name: 'LoadingState', props: ['message'], template: '<p role="status">{{ message }}</p>' },
}))

vi.mock('@/components/promotions/PromotionDelete.vue', () => ({
  default: {
    name: 'PromotionDelete', props: ['promotion'],
    emits: ['deleted', 'close', 'not-found', 'session-expired', 'forbidden'],
    template: '<div data-testid="promotion-delete" />',
  },
}))

function branch(id: number, overrides: Partial<BranchListItem> = {}): BranchListItem {
  return { id, name: `Cine ${id}`, companyId: 1, companyName: 'Empresa', ...overrides }
}
function page(
  items: BranchListItem[],
  overrides: Partial<BranchListResult> = {},
): BranchListResult {
  return { items, total: items.length, page: 1, pageSize: 50, totalPages: 1, ...overrides }
}
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
function apiError(status: number) {
  return { isAxiosError: true, response: { status, data: {} } }
}

let wrapper: VueWrapper
function render() {
  wrapper = mount(PromotionSection)
  return wrapper
}
function view() {
  return wrapper.findComponent({ name: 'PromotionView' })
}
function modal() {
  return wrapper.findComponent({ name: 'PromotionCreate' })
}
async function open() {
  await wrapper.get('button.add-user-button').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.mocked(getPromotions).mockReset().mockResolvedValue([])
  vi.mocked(getBranches).mockReset().mockResolvedValue(page([branch(1)]))
})
afterEach(() => { wrapper?.unmount() })

describe('PromotionSection', () => {
  it('renders the heading and starts with the modal closed', () => {
    render()
    expect(wrapper.get('h1').text()).toBe('Promociones')
    expect(wrapper.get('button').text()).toBe('Crear promoción')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    expect(modal().exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(getBranches).not.toHaveBeenCalled()
  })

  it('loads the catalog and passes mapped cinemas to the modal', async () => {
    vi.mocked(getBranches).mockResolvedValueOnce(page([
      branch(1, { name: '  Central  ', companyName: '  Empresa ABC  ' }),
      branch(23, { name: 'Norte', companyName: null }),
    ]))
    render()
    await open()
    expect(getBranches).toHaveBeenCalledTimes(1)
    expect(getBranches).toHaveBeenCalledWith({ page: 1, pageSize: 50 })
    expect(modal().props('cinemas')).toEqual([
      { id: 1, name: 'SU-001 — Central — Empresa ABC' },
      { id: 23, name: 'SU-023 — Norte' },
    ])
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })

  it('loads every page before opening the modal', async () => {
    const second = deferred<BranchListResult>()
    vi.mocked(getBranches)
      .mockResolvedValueOnce(page([branch(1)], { total: 3, totalPages: 3 }))
      .mockReturnValueOnce(second.promise)
      .mockResolvedValueOnce(page([branch(3)], { page: 3, total: 3, totalPages: 3 }))
    render()
    await open()
    expect(getBranches).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 50 })
    expect(getBranches).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 50 })
    expect(modal().exists()).toBe(false)
    expect(wrapper.get('button').text()).toBe('Cargando sucursales...')
    second.resolve(page([branch(2)], { page: 2, total: 3, totalPages: 3 }))
    await flushPromises()
    expect(getBranches).toHaveBeenNthCalledWith(3, { page: 3, pageSize: 50 })
    expect(getBranches).toHaveBeenCalledTimes(3)
    expect(modal().props('cinemas').map((item: { id: number }) => item.id)).toEqual([1, 2, 3])
  })

  it('deduplicates IDs across pages and keeps the latest information', async () => {
    vi.mocked(getBranches)
      .mockResolvedValueOnce(page([branch(1), branch(2)], { totalPages: 2 }))
      .mockResolvedValueOnce(page([
        branch(2, { name: 'Nombre actualizado' }), branch(3),
      ], { page: 2, totalPages: 2 }))
    render()
    await open()
    expect(modal().props('cinemas')).toEqual([
      { id: 1, name: 'SU-001 — Cine 1 — Empresa' },
      { id: 2, name: 'SU-002 — Nombre actualizado — Empresa' },
      { id: 3, name: 'SU-003 — Cine 3 — Empresa' },
    ])
  })

  it.each([
    { name: null, companyName: null },
    { name: '   ', companyName: '   ' },
    { name: '', companyName: '' },
  ])('handles missing names: %p', async (names) => {
    vi.mocked(getBranches).mockResolvedValueOnce(page([branch(1, names)]))
    render()
    await open()
    expect(modal().props('cinemas')).toEqual([{ id: 1, name: 'SU-001 — Sin nombre' }])
  })

  it.each([0, 1])('handles an empty catalog with totalPages=%s', async (totalPages) => {
    vi.mocked(getBranches).mockResolvedValueOnce(page([], { totalPages }))
    render()
    await open()
    expect(modal().exists()).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toBe('No hay sucursales disponibles.')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    expect(getBranches).toHaveBeenCalledTimes(1)
  })

  it('prevents concurrent loads and disables the button while loading', async () => {
    const pending = deferred<BranchListResult>()
    vi.mocked(getBranches).mockReturnValueOnce(pending.promise)
    render()
    // Invoke twice in the same tick to exercise the function guard as well as disabled UI.
    const first = wrapper.get('button').trigger('click')
    const second = wrapper.get('button').trigger('click')
    await Promise.all([first, second])
    expect(getBranches).toHaveBeenCalledTimes(1)
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button').text()).toBe('Cargando sucursales...')
    pending.resolve(page([branch(1)]))
    await flushPromises()
    expect(modal().exists()).toBe(true)
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })

  it('does not reload the catalog while the modal is open', async () => {
    render()
    await open()
    await open()
    expect(getBranches).toHaveBeenCalledTimes(1)
  })

  it('closes the modal and reloads fresh options when reopened', async () => {
    vi.mocked(getBranches)
      .mockResolvedValueOnce(page([branch(1)]))
      .mockResolvedValueOnce(page([branch(2)]))
    render()
    await open()
    modal().vm.$emit('close')
    await nextTick()
    expect(modal().exists()).toBe(false)
    await open()
    expect(getBranches).toHaveBeenCalledTimes(2)
    expect(modal().props('cinemas')).toEqual([{ id: 2, name: 'SU-002 — Cine 2 — Empresa' }])
  })

  it.each([
    { status: 401, message: 'La sesión ha expirado. Inicia sesión nuevamente.' },
    { status: 403, message: 'No tienes permisos para crear promociones.' },
    { status: 500, message: 'No se pudieron cargar las sucursales. Vuelve a intentarlo.' },
  ])('handles HTTP $status during catalog loading', async ({ status, message }) => {
    vi.mocked(getBranches).mockRejectedValueOnce(apiError(status))
    render()
    await open()
    expect(wrapper.get('[role="alert"]').text()).toBe(message)
    expect(modal().exists()).toBe(false)
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })

  it('handles non-Axios errors', async () => {
    vi.mocked(getBranches).mockRejectedValueOnce(new Error('Network unavailable'))
    render()
    await open()
    expect(wrapper.get('[role="alert"]').text())
      .toBe('No se pudieron cargar las sucursales. Vuelve a intentarlo.')
    expect(modal().exists()).toBe(false)
  })

  it('does not expose a partial catalog if a later page fails', async () => {
    vi.mocked(getBranches)
      .mockResolvedValueOnce(page([branch(1)], { totalPages: 2 }))
      .mockRejectedValueOnce(apiError(500))
    render()
    await open()
    expect(getBranches).toHaveBeenCalledTimes(2)
    expect(modal().exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })

  it('clears an old error as soon as a retry starts and opens on success', async () => {
    const retry = deferred<BranchListResult>()
    vi.mocked(getBranches)
      .mockRejectedValueOnce(apiError(500))
      .mockReturnValueOnce(retry.promise)
    render()
    await open()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await wrapper.get('button').trigger('click')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    retry.resolve(page([branch(1)]))
    await flushPromises()
    expect(modal().exists()).toBe(true)
  })

  it.each([
    { event: 'session-expired', message: 'La sesión ha expirado. Inicia sesión nuevamente.' },
    { event: 'forbidden', message: 'No tienes permisos para crear promociones.' },
  ])('handles the modal $event event', async ({ event, message }) => {
    render()
    await open()
    modal().vm.$emit(event)
    await nextTick()
    expect(modal().exists()).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toBe(message)
  })
})


describe('PromotionsSection: list and detail integration', () => {
  const rows = [{
    promotionId: 42, promotionTitle: 'Oferta', promotionType: 'fixed' as const,
    technology: null, projectionFormat: null, beginDate: '2026-01-01', endDate: '2026-12-31',
  }]
  const list = () => wrapper.findComponent({ name: 'PromotionList' })

  it('loads the list on mount and passes the response to PromotionList', async () => {
    vi.mocked(getPromotions).mockResolvedValueOnce(rows)
    render()
    await flushPromises()
    expect(getPromotions).toHaveBeenCalledTimes(1)
    expect(getPromotions).toHaveBeenCalledWith(expect.any(AbortSignal))
    expect(list().props('promotions')).toEqual(rows)
    expect(list().props('loading')).toBe(false)
  })

  it('shows list loading state and enables retry after a failure', async () => {
    const pending = deferred<typeof rows>()
    vi.mocked(getPromotions).mockReturnValueOnce(pending.promise)
    render()
    await nextTick()
    expect(list().props('loading')).toBe(true)
    pending.reject(new Error('Offline'))
    await flushPromises()
    expect(list().props('loading')).toBe(false)
    expect(list().props('error')).toContain('No se pudieron cargar las promociones')
    list().vm.$emit('retry')
    await flushPromises()
    expect(getPromotions).toHaveBeenCalledTimes(2)
    expect(list().props('error')).toBe('')
  })

  it('opens the dedicated view with the clicked promotion ID', async () => {
    render()
    await flushPromises()
    list().vm.$emit('view', 42)
    await nextTick()
    expect(view().props('promotionId')).toBe(42)
    expect(view().props('cinemas')).toEqual([])
    expect(modal().exists()).toBe(false)
    expect(getBranches).not.toHaveBeenCalled()
    await open()
    expect(getBranches).not.toHaveBeenCalled()
    view().vm.$emit('close')
    await nextTick()
    expect(view().exists()).toBe(false)
  })

  it('refreshes the list when creation emits saved', async () => {
    render()
    await open()
    vi.mocked(getPromotions).mockResolvedValueOnce(rows)
    modal().vm.$emit('saved')
    modal().vm.$emit('close')
    await flushPromises()
    expect(getPromotions).toHaveBeenCalledTimes(2)
    expect(list().props('promotions')).toEqual(rows)
    expect(modal().exists()).toBe(false)
  })

  it.each([
    { status: 401, text: 'La sesión ha expirado.' },
    { status: 403, text: 'No tienes permisos' },
  ])('handles list HTTP $status', async ({ status, text }) => {
    vi.mocked(getPromotions).mockRejectedValueOnce(apiError(status))
    render()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain(text)
  })

  it.each([
    { event: 'sessionExpired', message: 'La sesión ha expirado.' },
    { event: 'forbidden', message: 'No tienes permisos' },
  ])('closes the dedicated view on $event', async ({ event, message }) => {
    render()
    await flushPromises()
    list().vm.$emit('view', 42)
    await nextTick()
    view().vm.$emit(event)
    await nextTick()
    expect(view().exists()).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toContain(message)
  })

  it('does not open a detail view while creation is open', async () => {
    render()
    await open()
    list().vm.$emit('view', 42)
    await nextTick()
    expect(modal().exists()).toBe(true)
    expect(view().exists()).toBe(false)
  })

  it('ignores a stale list response when a newer retry succeeds first', async () => {
    const old = deferred<typeof rows>()
    const latest = deferred<typeof rows>()
    vi.mocked(getPromotions).mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    render()
    list().vm.$emit('retry')
    await nextTick()
    latest.resolve(rows)
    await flushPromises()
    old.resolve([])
    await flushPromises()
    expect(list().props('promotions')).toEqual(rows)
  })

  it('aborts the list request when unmounted', () => {
    const pending = deferred<typeof rows>()
    vi.mocked(getPromotions).mockReturnValueOnce(pending.promise)
    render()
    const signal = vi.mocked(getPromotions).mock.calls[0]![0]!
    wrapper.unmount()
    expect(signal.aborted).toBe(true)
    pending.resolve([])
  })
})


describe('PromotionsSection: editing', () => {
  const list = () => wrapper.findComponent({ name: 'PromotionList' })
  async function edit() {
    list().vm.$emit('edit', 42)
    await flushPromises()
  }
  it('loads the cinema catalog before opening the form in edit mode', async () => {
    render(); await flushPromises(); await edit()
    expect(getBranches).toHaveBeenCalledWith({ page: 1, pageSize: 50 })
    expect(modal().props('mode')).toBe('edit')
    expect(modal().props('promotionId')).toBe(42)
    expect(modal().props('cinemas')).toHaveLength(1)
    expect(view().exists()).toBe(false)
  })
  it('reloads the list after a successful edit and closes the editor', async () => {
    render(); await flushPromises(); await edit()
    modal().vm.$emit('saved'); modal().vm.$emit('close'); await flushPromises()
    expect(getPromotions).toHaveBeenCalledTimes(2)
    expect(modal().exists()).toBe(false)
  })
  it('blocks other dialogs and duplicate catalog loads while editing', async () => {
    render(); await flushPromises(); await edit()
    list().vm.$emit('view', 43); list().vm.$emit('edit', 43); await open()
    expect(getBranches).toHaveBeenCalledTimes(1)
    expect(view().exists()).toBe(false)
    expect(modal().props('promotionId')).toBe(42)
  })
  it('does not open editing during creation', async () => {
    render(); await open(); await edit()
    expect(getBranches).toHaveBeenCalledTimes(1)
    expect(modal().props('mode')).not.toBe('edit')
  })
  it('allows editing with an empty catalog so stored cinema associations can load', async () => {
    vi.mocked(getBranches).mockResolvedValueOnce(page([]))
    render(); await flushPromises(); await edit()
    expect(modal().props('mode')).toBe('edit')
    expect(modal().props('cinemas')).toEqual([])
  })
  it('keeps the editor closed when catalog loading fails', async () => {
    vi.mocked(getBranches).mockRejectedValueOnce(new Error('Offline'))
    render(); await flushPromises(); await edit()
    expect(modal().exists()).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toContain('No se pudieron cargar las sucursales')
  })
  it.each(['session-expired', 'forbidden'])('closes the edit form on %s', async (event) => {
    render(); await flushPromises(); await edit()
    modal().vm.$emit(event); await nextTick()
    expect(modal().exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })
})


describe('PromotionsSection: delete modal', () => {
  const row = { promotionId: 42, promotionTitle: 'Oferta', promotionType: 'fixed' as const,
    technology: null, projectionFormat: null, beginDate: '2026-01-01', endDate: '2026-12-31' }
  const list = () => wrapper.getComponent({ name: 'PromotionList' })
  const deletion = () => wrapper.findComponent({ name: 'PromotionDelete' })
  async function selectDelete() { list().vm.$emit('delete', 42); await nextTick() }
  async function renderLoaded() {
    vi.mocked(getPromotions).mockResolvedValueOnce([row])
    render(); await flushPromises()
  }
  it('opens a delete modal with the chosen promotion ID and title', async () => {
    await renderLoaded(); await selectDelete()
    expect(deletion().props('promotion')).toEqual({ id: 42, title: 'Oferta' })
    expect(getBranches).not.toHaveBeenCalled()
    expect(modal().exists()).toBe(false)
    expect(view().exists()).toBe(false)
  })
  it('closes a cancelled confirmation without refreshing', async () => {
    await renderLoaded(); await selectDelete()
    deletion().vm.$emit('close'); await nextTick()
    expect(deletion().exists()).toBe(false)
    expect(getPromotions).toHaveBeenCalledTimes(1)
  })
  it('refreshes on deleted and closes when the modal emits close', async () => {
    await renderLoaded(); await selectDelete()
    deletion().vm.$emit('deleted'); deletion().vm.$emit('close'); await flushPromises()
    expect(getPromotions).toHaveBeenCalledTimes(2)
    expect(deletion().exists()).toBe(false)
  })
  it('refreshes a stale catalog on not-found without counting it as a successful deletion', async () => {
    await renderLoaded(); await selectDelete()
    deletion().vm.$emit('not-found'); await flushPromises()
    expect(getPromotions).toHaveBeenCalledTimes(2)
    expect(deletion().exists()).toBe(true)
  })
  it.each([
    ['session-expired', 'La sesión ha expirado.'], ['forbidden', 'No tienes permisos'],
  ])('closes confirmation on %s', async (event, message) => {
    await renderLoaded(); await selectDelete()
    deletion().vm.$emit(event); await nextTick()
    expect(deletion().exists()).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toContain(message)
  })
  it('blocks creation, editing, viewing and duplicate delete dialogs while confirming', async () => {
    await renderLoaded(); await selectDelete()
    list().vm.$emit('view', 42); list().vm.$emit('edit', 42); list().vm.$emit('delete', 42)
    await open()
    expect(getBranches).not.toHaveBeenCalled()
    expect(modal().exists()).toBe(false)
    expect(view().exists()).toBe(false)
    expect(wrapper.findAllComponents({ name: 'PromotionDelete' })).toHaveLength(1)
  })
  it('does not open delete while the creation form is open', async () => {
    await renderLoaded(); await open(); await selectDelete()
    expect(deletion().exists()).toBe(false)
  })
  it('does not open confirmation for an ID absent from the loaded list', async () => {
    await renderLoaded(); list().vm.$emit('delete', 999); await nextTick()
    expect(deletion().exists()).toBe(false)
  })
})
