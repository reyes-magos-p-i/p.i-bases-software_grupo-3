<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getPosterUrl } from '@/services/image-handler.service'
import placeholder from '@/assets/images/placeholder.svg'

const props = withDefaults(
  defineProps<{
    posterImage?: string | null
    title?: string
  }>(),
  { posterImage: null, title: '' },
)
const attempt = ref(0)
const source = computed(() => {
  if (attempt.value >= 2) return placeholder
  try {
    return getPosterUrl(props.posterImage, attempt.value === 1) || placeholder
  } catch {
    return placeholder
  }
})
function failed() {
  if (source.value !== placeholder) attempt.value++
}
watch(
  () => props.posterImage,
  () => {
    attempt.value = 0
  },
)
</script>

<template>
  <img
    class="poster-image"
    :src="source"
    :alt="title ? `Póster de ${title}` : 'Póster no disponible'"
    @error="failed"
  />
</template>

<style scoped>
.poster-image {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: var(--poster-aspect-ratio, 2 / 3);
  object-fit: cover;
  border-radius: inherit;
}
</style>
