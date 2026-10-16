<script setup lang="ts">
const search = defineModel<string>({ required: true })
</script>

<template>
  <form class="search-bar" novalidate @submit.prevent>
    <div class="search-field">
      <label for="theater-search">Buscar salas</label>
      <div class="search-input">
        <i class="bi bi-search" aria-hidden="true"></i>
        <input
          id="theater-search"
          v-model="search"
          type="search"
          name="search"
          placeholder="ID, sucursal, proyector, estado, asientos o dimensiones"
        />
      </div>
    </div>
    <button type="submit" class="primary-button">Buscar</button>
  </form>
</template>

<style scoped>
.search-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
  margin-bottom: 20px;
}
.search-field {
  flex: 1;
  min-width: min(100%, 280px);
}
label {
  display: grid;
  gap: 6px;
  font-size: 0.875rem;
  font-weight: 600;
}
.search-input {
  position: relative;
}
.search-input i {
  position: absolute;
  left: 14px;
  top: 14px;
  color: var(--text-secondary);
}
.search-input input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--text-primary);
  padding: 10px 12px 10px 40px;
  font: inherit;
}
.primary-button {
  min-height: 44px;
  padding: 10px 16px;
  border: 1px solid var(--button-background);
  border-radius: var(--radius-small);
  background: var(--button-background);
  color: var(--button-text);
  font: inherit;
  cursor: pointer;
}
.primary-button:focus-visible,
.search-input input:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
@media (max-width: 600px) {
  .primary-button {
    flex: 1;
  }
}
</style>
