<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'

const props = withDefaults(defineProps<{
  label?: string
  disabled?: boolean
  existingImageUrl?: string | null
}>(), {
  label: 'Imagen',
  disabled: false,
  existingImageUrl: null,
})

const file = defineModel<File | null>({
  default: null,
})

const emit = defineEmits<{
  'filename-change': [filename: string | null]
}>()

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const id = useId()
const input = ref<HTMLInputElement | null>(null)
const error = ref('')
const previewUrl = ref('')
const dragging = ref(false)

const displayedImage = computed(() =>
  previewUrl.value || props.existingImageUrl,
)

// Release preview URLs when the selection changes or the component unmounts.
watch(
  file,
  (selected, _, onCleanup) => {
    error.value = ''
    emit('filename-change', selected?.name ?? null)

    const url = selected ? URL.createObjectURL(selected) : ''
    previewUrl.value = url

    onCleanup(() => {
      if (url) URL.revokeObjectURL(url)
    })
  },
  { immediate: true },
)

function openPicker() {
  if (!props.disabled) input.value?.click()
}

function selectFiles(files: FileList | null | undefined) {
  if (props.disabled || !files?.length) return

  error.value = ''

  if (files.length !== 1) {
    error.value = 'Seleccione solamente una imagen.'
    return
  }

  const selected = files[0]!

  if (!ALLOWED_TYPES.includes(selected.type)) {
    error.value = 'Solo se permiten imágenes JPEG, PNG o WebP.'
    return
  }

  if (selected.size === 0) {
    error.value = 'La imagen está vacía.'
    return
  }

  if (selected.size > MAX_SIZE) {
    error.value = 'La imagen debe pesar como máximo 5 MB.'
    return
  }

  file.value = selected
}

function handleChange(event: Event) {
  const element = event.target as HTMLInputElement
  selectFiles(element.files)

  // Allow selecting the same file again.
  element.value = ''
}

function handleDragOver(event: DragEvent) {
  if (props.disabled) return

  dragging.value = true

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function handleDrop(event: DragEvent) {
  dragging.value = false
  selectFiles(event.dataTransfer?.files)
}

function clearSelection() {
  if (props.disabled) return

  file.value = null
  error.value = ''
}
</script>

<template>
  <div class="image-upload">
    <span :id="`${id}-label`">{{ label }}</span>

    <input
      ref="input"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      hidden
      :disabled="disabled"
      @change="handleChange"
    />

    <button
      type="button"
      class="drop-zone"
      :class="{ 'drop-zone--dragging': dragging && !disabled }"
      :disabled="disabled"
      :aria-labelledby="`${id}-label`"
      :aria-describedby="`${id}-help`"
      @click="openPicker"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="dragging = false"
      @drop.prevent="handleDrop"
    >
      <img
        v-if="displayedImage"
        :src="displayedImage"
        alt="Vista previa de la imagen"
        class="image-preview"
      />

      <span>Arrastre una imagen aquí o haga clic para seleccionarla</span>
    </button>

    <small :id="`${id}-help`">
      JPEG, PNG o WebP. Máximo 5 MB.
    </small>

    <p v-if="file" class="filename">
      {{ file.name }}
    </p>

    <button
      v-if="file"
      type="button"
      :disabled="disabled"
      @click="clearSelection"
    >
      Quitar selección
    </button>

    <p v-if="error" class="input-error" role="alert">
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.image-upload {
  display: grid;
  gap: 10px;
}

.drop-zone {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;

  width: 100%;
  aspect-ratio: 2 / 3;
  min-height: 0;
  box-sizing: border-box;
  padding: 12px;
  overflow: hidden;

  border: 2px dashed #888;
  border-radius: 8px;
  background: #fafafa;
  color: #222;
  font: inherit;
  cursor: pointer;
}

.image-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  object-fit: contain;
}

.drop-zone > span {
  position: relative;
  padding: 8px;
  border-radius: 4px;
  background: rgb(255 255 255 / 90%);
}

.drop-zone--dragging {
  border-color: #2457c5;
  background: #edf3ff;
}

.drop-zone:focus-visible {
  outline: 3px solid #2457c5;
  outline-offset: 3px;
}

.drop-zone:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.image-preview {
  max-width: 100%;
  max-height: 280px;
  object-fit: contain;
}

.filename {
  margin: 0;
  overflow-wrap: anywhere;
}

.input-error {
  margin: 0;
  color: #b42318;
}
</style>
