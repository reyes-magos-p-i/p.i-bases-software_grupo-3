import { computed, ref, type Ref } from 'vue'
import type { Theater } from '@/types/theater'

export type TheaterSortKey =
  'theaterId' | 'cinema' | 'numberOfSeats' | 'dimensions' | 'projectorName' | 'status'

export const displayStatus = (theater: Theater) => (theater.isActive ? theater.status : 'Inactiva')

const uniqueSorted = (values: string[]) =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b, 'es'))

const normalizeText = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/gu, ' ')

const searchText = (t: Theater) =>
  normalizeText(
    [
      t.theaterId,
      t.cinema,
      t.projectorName,
      displayStatus(t),
      t.numberOfSeats,
      `${t.dimensionX} x ${t.dimensionY}`,
    ].join(' '),
  )

function compareBy(key: TheaterSortKey, a: Theater, b: Theater) {
  switch (key) {
    case 'cinema':
      return a.cinema.localeCompare(b.cinema, 'es')
    case 'numberOfSeats':
      return a.numberOfSeats - b.numberOfSeats
    case 'dimensions':
      return a.dimensionX * a.dimensionY - b.dimensionX * b.dimensionY
    case 'projectorName':
      return a.projectorName.localeCompare(b.projectorName, 'es')
    case 'status':
      return displayStatus(a).localeCompare(displayStatus(b), 'es')
    default:
      return a.theaterId - b.theaterId
  }
}

export function useTheaterFilters(
  theaters: Ref<Theater[]>,
  knownStatuses: Ref<readonly string[]> = ref([]),
) {
  const search = ref('')
  const selectedCinemas = ref<string[]>([])
  const selectedProjectors = ref<string[]>([])
  const selectedStatuses = ref<string[]>([])
  const sortBy = ref<TheaterSortKey>('theaterId')
  const sortDirection = ref<'asc' | 'desc'>('asc')

  const cinemaOptions = computed(() => uniqueSorted(theaters.value.map((t) => t.cinema)))
  const projectorOptions = computed(() => uniqueSorted(theaters.value.map((t) => t.projectorName)))
  const statusOptions = computed(() =>
    uniqueSorted([...knownStatuses.value, 'Inactiva', ...theaters.value.map(displayStatus)]),
  )

  const hasFilters = computed(
    () =>
      !!search.value ||
      selectedCinemas.value.length > 0 ||
      selectedProjectors.value.length > 0 ||
      selectedStatuses.value.length > 0,
  )

  const visibleTheaters = computed(() => {
    const query = normalizeText(search.value)
    const filtered = theaters.value.filter(
      (t) =>
        (!query || searchText(t).includes(query)) &&
        (!selectedCinemas.value.length || selectedCinemas.value.includes(t.cinema)) &&
        (!selectedProjectors.value.length || selectedProjectors.value.includes(t.projectorName)) &&
        (!selectedStatuses.value.length || selectedStatuses.value.includes(displayStatus(t))),
    )
    const direction = sortDirection.value === 'asc' ? 1 : -1
    return [...filtered].sort(
      (a, b) => direction * compareBy(sortBy.value, a, b) || a.theaterId - b.theaterId,
    )
  })

  function clearFilters() {
    search.value = ''
    selectedCinemas.value = []
    selectedProjectors.value = []
    selectedStatuses.value = []
  }

  return {
    search,
    selectedCinemas,
    selectedProjectors,
    selectedStatuses,
    sortBy,
    sortDirection,
    cinemaOptions,
    projectorOptions,
    statusOptions,
    hasFilters,
    visibleTheaters,
    clearFilters,
  }
}
