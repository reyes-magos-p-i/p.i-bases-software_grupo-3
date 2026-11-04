<script setup lang="ts">
import MoviePoster from '@/components/common/MoviePoster.vue'

defineProps<{ posterImage?: string; title?: string; emptyText?: string; contained?: boolean }>()
</script>

<template>
  <aside class="poster" :class="{ 'poster--contained': contained }" aria-label="Película">
    <MoviePoster :poster-image="posterImage" :title="title" />
    <p v-if="title" class="poster-title">{{ title }}</p>
    <p v-else-if="emptyText" class="poster-empty">{{ emptyText }}</p>
  </aside>
</template>

<style scoped>
.poster {
  position: sticky;
  top: 0;
  display: grid;
  gap: 8px;
  margin: 0;
}
.poster img {
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: var(--radius-small);
  background: var(--content-background);
  box-shadow: 0 4px 10px color-mix(in srgb, var(--page-background) 25%, transparent);
  color: var(--text-primary);
}
.poster-title {
  margin: 0;
  overflow-wrap: anywhere;
  font-weight: 700;
  text-align: center;
}
.poster-empty {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
  text-align: center;
}
.poster--contained {
  position: static;
  align-self: stretch;
  min-width: 0;
  min-height: 0;
  height: min(100%, 480px);
  max-height: 100%;
  grid-template-rows: minmax(0, 1fr) auto;
}
.poster--contained img {
  height: 100%;
  max-height: 100%;
  object-fit: contain;
}
@media (max-width: 900px) {
  .poster {
    position: static;
    order: -1;
    max-width: 200px;
    justify-self: center;
  }
  .poster--contained {
    max-width: 160px;
    height: auto;
    max-height: none;
    grid-template-rows: auto auto;
  }
  .poster--contained img {
    height: auto;
    max-height: 240px;
  }
}
</style>
