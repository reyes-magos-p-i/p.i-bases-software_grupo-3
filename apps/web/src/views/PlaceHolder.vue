<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import MovieCrud from '@/components/Movies/MovieCrud.vue';
</script>

<template>
  <AppHeader />
  <main>
    <div class="landing-container home-content">
        <h1>Oops, no hay nada aqui. Estamos trabajando en ello.</h1>
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
