<script setup lang="ts">
  import { ref } from 'vue'
  import FilterDropdown from './FIlterDropdown.vue'
  import SearchBar from './SearchBar.vue'
  import SortButton from './SortButton.vue'

  const sortColumn = ref<string | null>(null)
  const sortDirection = ref<'asc' | 'desc' | null>(null)


  //define la tipo de elemento recibido por el componente padre
  interface TableColumn{
    key: string
    label: string
    sortable?: boolean
    filterable?: boolean
    filterOptions?: string[]
  }

  //para uso con jsons rows es un array de strings
  interface TableRow{
    [key: string]: unknown
  }

  defineProps<{
    columns: TableColumn[]
    rows: TableRow[]
    currentPage: number
    totalPages: number
  }>()

  const emit = defineEmits<{
    edit:[row:TableRow]
    view: [row:TableRow]
    delete: [row:TableRow]
    sort: [column: string, direction: 'asc' | 'desc']
    filter: [column: string, value: string]
    search: [value: string]
    page: [page: number]
  }>()

  function handleSort(column: string, direction: 'asc' | 'desc') {
    sortColumn.value = column
    sortDirection.value = direction

    emit('sort', column, direction)
  }

  function handleFilter(column: string, value: string) {
    emit('filter', column, value)
  }

  function handleSearch(value: string) {
    emit('search', value)
  }



</script>

<template>
  <div>
    <SearchBar @search="handleSearch" />

    <table class="table">
      <thead>
        <tr>

          <th v-for="column in columns" :key="column.key">
            <div>
             <SortButton v-if="column.sortable" :column="column.key"
             :direction="sortDirection = 'desc'"
             :label="column.label" @sort="handleSort"
             />
              <span v-else>
              {{ column.label }}
              </span>
              <FilterDropdown v-if="column.filterable" :column="column.key"
              :options="column.filterOptions ?? []" @filter="handleFilter"
              />
            </div>

          </th>
          <th>Actions</th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="(row, index) in rows" :key="String(row.id ?? index)">
          <td v-for="column in columns" :key="column.key">
            {{ row[column.key] }}
          </td>

          <td class="actions">
            <button class="btn btn-sm btn-warning" @click="emit('edit', row)">
                <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-sm btn-info" @click="emit('view', row)">
               <i class="fa-solid fa-eye"></i>
            </button>
             <button class="btn btn-sm btn-error" @click="emit('delete', row)">
                <i class="fa-solid fa-trash"></i>
            </button>

          </td>
        </tr>

        <tr v-if="rows.length === 0">
          <td :colspan="columns.length+1" class="empty">
            No hay Datos
          </td>
        </tr>
      </tbody>
    </table>
    <CrudPagination/>
  </div>
</template>

