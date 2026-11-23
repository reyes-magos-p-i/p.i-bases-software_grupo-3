<script setup lang="ts">
import ImageUpload from './ImageUpload.vue'

withDefaults(
  defineProps<{
    label?: string
    disabled?: boolean
    existingImageUrl?: string | null
  }>(),
  {
    label: 'Póster de la promoción',
    disabled: false,
    existingImageUrl: null,
  },
)

const file = defineModel<File | null>({
  default: null,
})

const emit = defineEmits<{
  'filename-change': [filename: string | null]
}>()
</script>

<template>
  <ImageUpload
    v-model="file"
    class="promotion-image-upload"
    :label="label"
    :disabled="disabled"
    :existing-image-url="existingImageUrl"
    @filename-change="emit('filename-change', $event)"
  />
</template>

<style scoped>
.promotion-image-upload {
  width: 100%;
  min-width: 0;
}

.promotion-image-upload :deep(.drop-zone) {
  aspect-ratio: 16 / 9;
  min-height: 0;
}

@media (max-width: 575px) {
  .promotion-image-upload :deep(.drop-zone) {
    min-height: 0;
  }
}
</style>
