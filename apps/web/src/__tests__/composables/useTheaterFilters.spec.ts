import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { displayStatus, useTheaterFilters } from '@/composables/useTheaterFilters'
import type { Theater } from '@/types/theater'

const theater: Theater = {
  theaterId: 1,
  cinema: 'Sucursal Cartago',
  numberOfSeats: 80,
  dimensionX: 8,
  dimensionY: 10,
  projectorName: 'Proyector láser',
  isActive: true,
  status: 'Disponible',
}

const incomplete = [
  { ...theater, theaterId: 2, cinema: null },
  { ...theater, theaterId: 3, projectorName: null },
  { ...theater, theaterId: 4, status: null },
  { ...theater, theaterId: 5, cinema: undefined, projectorName: undefined, status: undefined },
] as unknown as Theater[]

describe('useTheaterFilters with incomplete records', () => {
  it('builds the option lists without throwing and drops the empty entries', () => {
    const { cinemaOptions, projectorOptions, statusOptions } = useTheaterFilters(
      ref([theater, ...incomplete]),
    )

    expect(cinemaOptions.value).toEqual(['Sucursal Cartago'])
    expect(projectorOptions.value).toEqual(['Proyector láser'])
    expect(statusOptions.value).toContain('Disponible')
    expect(statusOptions.value).toContain('Inactiva')
    expect(statusOptions.value.every((option) => typeof option === 'string')).toBe(true)
  })

  it.each(['cinema', 'projectorName', 'status', 'theaterId', 'numberOfSeats', 'dimensions'] as const)(
    'sorts by %s in both directions without throwing',
    (key) => {
      const { sortBy, sortDirection, visibleTheaters } = useTheaterFilters(
        ref([theater, ...incomplete]),
      )
      sortBy.value = key

      for (const direction of ['asc', 'desc'] as const) {
        sortDirection.value = direction
        expect(visibleTheaters.value).toHaveLength(5)
      }
    },
  )

  it('searches across records with missing fields', () => {
    const { search, visibleTheaters } = useTheaterFilters(ref([theater, ...incomplete]))
    search.value = 'CARTAGO'

    expect(visibleTheaters.value.map((item) => item.theaterId)).toEqual([1, 3, 4])
  })

  it('ignores non-string known statuses coming from the options endpoint', () => {
    const knownStatuses = ref([
      'Disponible',
      null,
      undefined,
      42,
    ] as unknown as readonly string[])
    const { statusOptions } = useTheaterFilters(ref([theater]), knownStatuses)

    expect(statusOptions.value).toEqual(['Disponible', 'Inactiva'])
  })
})

describe('displayStatus', () => {
  it('reports inactive theaters as such regardless of their status', () => {
    expect(displayStatus({ ...theater, isActive: false })).toBe('Inactiva')
  })

  it('falls back to a readable label when an active theater carries no status', () => {
    expect(displayStatus({ ...theater, status: null } as unknown as Theater)).toBe('Sin estado')
  })
})
