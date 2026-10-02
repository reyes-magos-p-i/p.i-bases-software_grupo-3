<script setup lang="ts">
import { ref } from 'vue'
import CrudTable from './crudTable/CrudTable.vue'

const currentPage = ref(1)
const totalPages = ref(3)

const columns = [
  {
    key: 'name',
    label: 'Name',
    sortable: true,
    filterable: false
  },
  {
    key: 'email',
    label: 'Email',
    sortable: true,
    filterable: false
  },
  {
    key: 'status',
    label: 'Status',
    sortable: true,
    filterable: true,
    filterOptions: ['Active', 'Inactive']
  }
]

const rows = ref([
  {
    id: 1,
    name: 'Silvio',
    email: 'silvio@example.com',
    status: 'Active'
  },
  {
    id: 2,
    name: 'Carlos',
    email: 'carlos@example.com',
    status: 'Inactive'
  },
  {
    id: 3,
    name: 'Ana',
    email: 'ana@example.com',
    status: 'Active'
  }
])

function handleSearch(value: string) {
  console.log('Search:', value)
}

function handleSort(
  column: string,
  direction: 'asc' | 'desc'
) {
  console.log('Sort:', column, direction)
}

function handleFilter(
  column: string,
  value: string
) {
  console.log('Filter:', column, value)
}

function handlePage(page: number) {
  currentPage.value = page

  console.log('Page:', page)
}

function handleEdit(row: any) {
  console.log('Edit:', row)
}

function handleView(row: any) {
  console.log('View:', row)
}

function handleDelete(row: any) {
  console.log('Delete:', row)
}
</script>

<template>
  <div>
    <h1>Test CRUD Table</h1>

    <CrudTable
      :columns="columns"
      :rows="rows"
      :current-page="currentPage"
      :total-pages="totalPages"
      @search="handleSearch"
      @sort="handleSort"
      @filter="handleFilter"
      @page="handlePage"
      @edit="handleEdit"
      @view="handleView"
      @delete="handleDelete"
    />
  </div>
</template>
