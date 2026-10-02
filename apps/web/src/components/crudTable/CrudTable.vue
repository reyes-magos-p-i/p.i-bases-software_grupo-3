<script setup lang="ts">

  //define la tipo de elemento recibido por el componente padre
  interface tableColumn{
    key: string
    label: string
  }

  //para uso con jsons rows es un array de strings
  interface tableRow{
    [key: string]: unknown
  }

  defineProps<{
    columns: tableColumn[]
    rows: tableRow[]
  }>()

  const emit = defineEmits<{
    edit:[row:tableRow]
    view: [row:tableRow]
    delete: [row:tableRow]

  }>()

</script>

<template>
  <div>
    <table class="table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column.key">
            {{ column.label }}
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
            <button @click="emit('edit', row)">
              Edit /
            </button>
            <button @click="emit('view', row)">
              view /
            </button>
             <button @click="emit('delete', row)">
              erase
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

  </div>
</template>

