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
    
    const filteredsOptions = computed (()=>
        props.options.filter(option=>
            option.label.toLowerCase().includes(
                search.value.trim().toLocaleLowerCase()
            )
        )
    )

    const selectedOptions = computed(()=>
        props.options.filter(option => selected.value.includes(option.value)
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

    function removeOption(value:number){
        selected.value.filter(id=>id!==value)
        
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
    <div ref="root">
        <label>{{ label }}</label>

        <div>
            <!--options already selected-->
            <span v-for="option in selectedOptions"  :key="option.value">
                {{ option.label }}
                <button
                    type = "button"
                    :disabled="disabled"
                    :aria-label=" 'Remove ${option.label}'"
                    @click="removeOption(option.value)"
                    >
                </button>
            </span>
            <input
                v-model="search"
                type="text"
                :placeholder="placeholder"
                :disabled="disabled"
                @focus="isOpen=true"
                @input="isOpen=true"
                @keydown.esc="isOpen=false"
            />
        </div>
        <!--The options themselves-->
        <ul
            v-if="isOpen && !disabled"
        >
            <li
                v-for="option in filteredsOptions"
                :key="option.value"
            >
                <button 
                    type="button"
                    @click="toggleOption(option.value)"
                >
                <input
                    type="checkbox"
                    :checked="selected.includes(option.value)"
                    tabindex="-1"
                    aria-hidden="true"
                    readonly
                />
                {{ option.label }}
                </button>
            </li>
            <li v-if="filteredsOptions.length===0">
                <span>
                    no results found
                </span>
            </li>
        </ul>

    </div>

</template>