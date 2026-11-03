<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
</script>

<template>
  <AppHeader />
  <main>
    <div class="landing-container home-content">
      <h1>No encontramos esta página</h1>
      <p>Revisa la dirección o vuelve al portal para continuar.</p>
      <RouterLink to="/">Volver al portal</RouterLink>
    </div>
  </main>
  <AppFooter />
</template>

<style scoped>
main {
  padding-top: 32px;
}

.home-content {
  padding-bottom: 24px;
}
</style>
