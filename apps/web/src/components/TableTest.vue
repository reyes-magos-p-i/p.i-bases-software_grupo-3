<script setup lang="ts">

import CrudTable from './crudTable/CrudTable.vue'


const columns = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  {key: 'sos', label:'sus' }
]

const users = [
  {
    id: '1',
    name: 'Silvio',
    email: 'silvio@example.com',
    sos: 'wut'
  },
  {
    id: '2',
    name: 'John',
    email: 'john@example.com',
    sos: 'wut'
  },
  {
    id: '3',
    name: 'Mary',
    email: 'mary@example.com',
    sos: 'wut'
  }
]

function editUser(user: Record<string, unknown>) {
  console.log('Editing:', user)
}

function deleteUser(user: Record<string, unknown>) {
  console.log('Deleting:', user)
}
</script>

<template>
  <div>
    <h1>Users</h1>

    <CrudTable
      :columns="columns"
      :rows="users"
      @edit="editUser"
      @delete="deleteUser"
    />
  </div>
</template>
