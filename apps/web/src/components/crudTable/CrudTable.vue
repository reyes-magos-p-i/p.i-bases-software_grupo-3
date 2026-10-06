<script setup lang="ts">
interface tableColumn {
  key: string
  label: string
}

interface tableRow {
  [key: string]: unknown
}

withDefaults(
  defineProps<{
    columns: tableColumn[]
    rows: tableRow[]
    showActions?: boolean
    caption?: string
  }>(),
  { showActions: true, caption: undefined },
)

const emit = defineEmits<{
  edit: [row: tableRow]
  view: [row: tableRow]
  delete: [row: tableRow]
}>()
</script>

<template>
  <div
    class="table-scroll"
    tabindex="0"
    :aria-label="caption ? 'Tabla de ' + caption : 'Tabla de datos'"
  >
    <table class="table crud-table">
      <caption v-if="caption">
        {{
          caption
        }}
      </caption>
      <thead>
        <tr>
          <th v-for="column in columns" :key="column.key" scope="col">
            {{ column.label }}
          </th>
          <th v-if="showActions" scope="col">Acciones</th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="(row, index) in rows" :key="String(row.id ?? index)">
          <td v-for="column in columns" :key="column.key">
            {{ row[column.key] }}
          </td>

          <td v-if="showActions" class="actions">
            <slot name="actions" :row="row">
              <button type="button" @click="emit('edit', row)">Editar</button>
              <button type="button" @click="emit('view', row)">Ver</button>
              <button type="button" @click="emit('delete', row)">Eliminar</button>
            </slot>
          </td>
        </tr>

        <tr v-if="rows.length === 0">
          <td :colspan="columns.length + (showActions ? 1 : 0)" class="empty">No hay datos</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-scroll {
  overflow-x: auto;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-medium);
  background: var(--table-background);
}
.table-scroll:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.crud-table {
  width: 100%;
  min-width: 680px;
  margin: 0;
  border-collapse: collapse;
  color: var(--text-primary);
}
caption {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
th {
  padding: 16px;
  background: var(--table-heading-background);
  font-size: 0.8125rem;
  white-space: nowrap;
  color: var(--table-heading-text);
}
td {
  padding: 16px;
  vertical-align: middle;
  font-size: 0.875rem;
  overflow-wrap: anywhere;
  max-width: 280px;
}
tbody tr:nth-child(even) td {
  background: var(--table-stripe-background);
}
tbody tr:hover td {
  background: var(--table-hover-background);
}
.actions {
  white-space: nowrap;
}
.actions button {
  border: 0;
  background: transparent;
  color: var(--text-primary);
  padding: 6px;
  text-decoration: underline;
}
.empty {
  padding: 32px;
  text-align: center;
}
</style>
