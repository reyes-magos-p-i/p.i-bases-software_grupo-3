import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { create, get, post, patch } = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}))

// api.ts registers a response interceptor when it is first imported.
const interceptors = { response: { use: vi.fn() } }

vi.mock('axios', () => ({
  default: { create: (defaults: unknown) => ({ interceptors, ...create(defaults) }) },
}))

describe('branch service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    create.mockImplementation((defaults) => ({ defaults, get, post, patch }))
  })

  afterEach(() => vi.unstubAllEnvs())

  it.each([
    [1, 'SU-001'],
    [42, 'SU-042'],
    [1234, 'SU-1234'],
  ])('formats branch %i as %s', async (id, expected) => {
    const { formatBranchId } = await import('@/services/branch.service')
    expect(formatBranchId(id)).toBe(expected)
  })

  it('requests one page of branches with the search and company filter', async () => {
    const page = { items: [], total: 0, page: 2, pageSize: 20, totalPages: 0 }
    get.mockResolvedValue({ data: page })
    const controller = new AbortController()
    const { getBranches } = await import('@/services/branch.service')
    const query = { page: 2, pageSize: 20 as const, search: 'Heredia', companyId: 3 }

    await expect(getBranches(query, controller.signal)).resolves.toBe(page)
    expect(get).toHaveBeenCalledWith('/cinemas/list', {
      params: query,
      signal: controller.signal,
      timeout: 10000,
    })
  })

  it('loads the companies and the detail of one branch', async () => {
    const companies = [{ id: 1, name: 'Cinetadel S.A' }]
    const branch = { id: 7, name: null, companyId: 1, companyName: null, status: 'ACTIVE' }
    get.mockImplementation((url: string) =>
      Promise.resolve({ data: url === '/cinemas/companies' ? companies : branch }),
    )
    const { getBranch, getCompanies } = await import('@/services/branch.service')

    await expect(getCompanies()).resolves.toBe(companies)
    await expect(getBranch(7)).resolves.toBe(branch)
    expect(get).toHaveBeenCalledWith('/cinemas/companies', { signal: undefined, timeout: 10000 })
    expect(get).toHaveBeenCalledWith('/cinemas/7', { signal: undefined, timeout: 10000 })
  })

  it('creates a branch with POST /cinemas', async () => {
    const branch = { id: 30, name: 'Sucursal Heredia Centro', companyId: 21 }
    post.mockResolvedValue({ data: branch })
    const { createBranch } = await import('@/services/branch.service')
    const data = { name: 'Sucursal Heredia Centro', companyId: 21 }

    await expect(createBranch(data)).resolves.toBe(branch)
    expect(post).toHaveBeenCalledWith('/cinemas', data, { timeout: 10000 })
  })

  it('modifies a branch with PATCH /cinemas/:id', async () => {
    const branch = { id: 26, name: 'Sucursal Heredia Oeste', companyId: 23 }
    patch.mockResolvedValue({ data: branch })
    const { updateBranch } = await import('@/services/branch.service')
    const data = { name: 'Sucursal Heredia Oeste', companyId: 23 }

    await expect(updateBranch(26, data)).resolves.toBe(branch)
    expect(patch).toHaveBeenCalledWith('/cinemas/26', data, { timeout: 10000 })
  })

  it('deactivates a branch with PATCH /cinemas/:id/deactivate', async () => {
    patch.mockResolvedValue({ data: '' })
    const { deactivateBranch } = await import('@/services/branch.service')

    await expect(deactivateBranch(21)).resolves.toBeUndefined()
    expect(patch).toHaveBeenCalledWith('/cinemas/21/deactivate', undefined, { timeout: 10000 })
  })

  it('propagates request failures', async () => {
    const failure = new Error('Network Error')
    get.mockRejectedValue(failure)
    const { getBranches } = await import('@/services/branch.service')
    await expect(getBranches({ page: 1, pageSize: 10 })).rejects.toBe(failure)
  })
})
