<script setup lang="ts">
    import { ref, computed, onMounted, onUnmounted } from 'vue'
    interface DropdownOptions{
        value: number
        label: string

    }

    const props = withDefaults(defineProps<{
        options:DropdownOptions[]
        label: string
        placeholder?: string
        disabled?: boolean
    }>(), {
        placeholder: 'Seach...',
        disabled: false

    })

    const selected = defineModel<number[]>({
        default: ()=> []
    })

    const search = ref('')
    const isOpen = ref(false)
    const root = ref<HTMLElement | null>(null)

    const filteredsOptions = computed (()=>{
      const query = search.value.trim().toLowerCase()

      if (query.length < 2) return []

      return props.options.filter(option =>
        option.label.toLowerCase().includes(query)
      )
    })

    const selectedOptions = computed(()=>
        props.options.filter(option =>
        selected.value.includes(option.value)
        )
    )

    function toggleOption(value: number){
        if  (props.disabled) return

        if (selected.value.includes(value)){
            selected.value=selected.value.filter(id=>id !==value)
        } else{
            selected.value =[...selected.value, value]

        }
        search.value=''
    }

    function removeOption(value: number) {
      if (props.disabled) return

      selected.value = selected.value.filter(
        id => id !== value
      )
    }

    function handleClickOutside(event: MouseEvent){
        if(
            root.value &&
            !root.value.contains(event.target as Node)
        ){
            isOpen.value = false
        }

    }

    onMounted(()=>{
        document.addEventListener('mousedown', handleClickOutside)
    })

    onUnmounted(()=>{
        document.removeEventListener('mousedown', handleClickOutside)
    })

</script>

<template>
    <div ref="root" class="search-dropdown">
        <label >{{ label }}</label>

        <div class="selected-options" >
            <!--options already selected-->
            <input
                class="search-input"
                v-model="search"
                type="text"
                :placeholder="placeholder"
                :disabled="disabled"
                @focus="isOpen=true"
                @input="isOpen=true"
                @keydown.esc="isOpen=false"
            />
            <span v-for="option in selectedOptions"
              :key="option.value "
              class="selected-option"
            >
                {{ option.label }}
                <button
                    class="remove-option"
                    type = "button"
                    :disabled= "disabled"
                    :aria-label="`Remove ${option.label}`"
                    @click.stop="removeOption(option.value)"
                  >
                    x
                </button>
            </span>

        </div>
        <!--The options themselves-->
        <ul
          v-if="isOpen && !disabled && search.trim().length >= 2"
          class="dropdown-options"
        >
          <li
            v-for="option in filteredsOptions"
            :key="option.value"
            class="dropdown-option"
          >
            <label>
              <input
                type="checkbox"
                :checked="selected.includes(option.value)"
                @change="toggleOption(option.value)"
              />
              <span>{{ option.label }}</span>
            </label>
          </li>

          <li
            v-if="filteredsOptions.length === 0"
            class="dropdown-empty"
          >
            No se encontraron resultados
          </li>
        </ul>

    </div>

</template>

<style scoped>
.search-dropdown {
  position: relative;
  width: 100%;
  min-width: 0;
}

.search-dropdown label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
}

.search-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--text-primary);
  font: inherit;
}

.selected-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.selected-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--text-primary);
}

.remove-option {
  border: none;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.search-input:focus-visible,
.remove-option:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

.dropdown-options {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  box-sizing: border-box;
  z-index: 100;

  margin: 4px 0 0;
  padding: 4px 0;
  max-height: 220px;
  overflow-y: auto;

  list-style: none;
  background: var(--content-background);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  box-shadow: 0 4px 12px rgb(0 0 0 / 10%);
}

.dropdown-option label {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 10px 12px;

  font: inherit;
  color: var(--text-primary);
  cursor: pointer;
}

.dropdown-option:hover {
  background: var(--surface-hover);
}

.dropdown-option input[type="checkbox"] {
  width: 18px;
  height: 18px;
  margin: 0;
  flex-shrink: 0;
  accent-color: var(--primary-color);
  cursor: pointer;
}

.dropdown-option:focus-within {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}

.dropdown-empty {
  padding: 10px 12px;
  color: var(--text-secondary);
}


</style>

