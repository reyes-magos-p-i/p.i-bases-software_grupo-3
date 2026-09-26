<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, useId, useTemplateRef } from 'vue'
import type { CreateEmployeeRequest } from '@/types/user'

interface CatalogOption {
  id: number
  label: string
}

withDefaults(
  defineProps<{
    addresses?: readonly CatalogOption[]
    branches?: readonly CatalogOption[]
  }>(),
  { addresses: () => [], branches: () => [] },
)

const id = useId()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const firstNameInput = useTemplateRef<HTMLInputElement>('first-name')
const draft = reactive<
  Omit<CreateEmployeeRequest, 'addressId' | 'branchId'> & {
    addressId: number | ''
    branchId: number | ''
  }
>({
  firstName: '',
  secondName: '',
  firstSurname: '',
  secondSurname: '',
  birthday: '',
  email: '',
  phoneNumber: '',
  role: 'EMPLOYEE',
  addressId: '',
  branchId: '',
})
const title = computed(() =>
  draft.role === 'ADMINISTRATOR' ? 'Crear administrador' : 'Crear empleado',
)
let opener: HTMLElement | null = null

function open() {
  if (!dialog.value || dialog.value.open) return
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  dialog.value.showModal()
  firstNameInput.value?.focus()
  dialog.value.scrollTop = 0
}

function restoreFocus() {
  if (opener?.isConnected) opener.focus()
  opener = null
}

function close() {
  dialog.value?.close()
  restoreFocus()
}

function keepFocus(event: KeyboardEvent) {
  const controls = dialog.value?.querySelectorAll<HTMLElement>(
    ':is(button, input, select):not(:disabled)',
  )
  const first = controls?.[0]
  const last = controls?.[controls.length - 1]
  if (!first || !last) return

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onBeforeUnmount(() => dialog.value?.close())
defineExpose({ open })
</script>

<template>
  <dialog
    ref="dialog"
    class="employee-dialog"
    :aria-labelledby="id + '-title'"
    @cancel.prevent="close"
    @close="restoreFocus"
    @keydown.tab="keepFocus"
  >
    <header class="dialog-heading">
      <h2 :id="id + '-title'">{{ title }}</h2>
      <button type="button" class="close-button" aria-label="Cerrar formulario" @click="close">
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>
    </header>

    <form autocomplete="off" @submit.prevent.stop>
      <p class="required-note">Los campos con * son obligatorios.</p>

      <fieldset>
        <legend>Datos personales</legend>
        <div class="field-grid">
          <div class="field">
            <label :for="id + '-first-name'">Primer nombre <span aria-hidden="true">*</span></label>
            <input
              :id="id + '-first-name'"
              ref="first-name"
              v-model="draft.firstName"
              name="firstName"
              class="form-control"
              required
            />
          </div>
          <div class="field">
            <label :for="id + '-second-name'">Segundo nombre (opcional)</label>
            <input
              :id="id + '-second-name'"
              v-model="draft.secondName"
              name="secondName"
              class="form-control"
            />
          </div>
          <div class="field">
            <label :for="id + '-first-surname'"
              >Primer apellido <span aria-hidden="true">*</span></label
            >
            <input
              :id="id + '-first-surname'"
              v-model="draft.firstSurname"
              name="firstSurname"
              class="form-control"
              required
            />
          </div>
          <div class="field">
            <label :for="id + '-second-surname'"
              >Segundo apellido <span aria-hidden="true">*</span></label
            >
            <input
              :id="id + '-second-surname'"
              v-model="draft.secondSurname"
              name="secondSurname"
              class="form-control"
              required
            />
          </div>
          <div class="field">
            <label :for="id + '-birthday'"
              >Fecha de nacimiento <span aria-hidden="true">*</span></label
            >
            <input
              :id="id + '-birthday'"
              v-model="draft.birthday"
              name="birthday"
              type="date"
              class="form-control"
              required
            />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Contacto</legend>
        <div class="field-grid">
          <div class="field">
            <label :for="id + '-email'">Correo electrónico <span aria-hidden="true">*</span></label>
            <input
              :id="id + '-email'"
              v-model="draft.email"
              name="email"
              type="email"
              class="form-control"
              required
            />
          </div>
          <div class="field">
            <label :for="id + '-phone'">Teléfono <span aria-hidden="true">*</span></label>
            <input
              :id="id + '-phone'"
              v-model="draft.phoneNumber"
              name="phoneNumber"
              type="tel"
              class="form-control"
              required
            />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Rol y ubicación</legend>
        <div class="field-grid">
          <div class="field">
            <label :for="id + '-role'">Rol <span aria-hidden="true">*</span></label>
            <select
              :id="id + '-role'"
              v-model="draft.role"
              name="role"
              class="form-select"
              required
            >
              <option value="EMPLOYEE">Empleado</option>
              <option value="ADMINISTRATOR">Administrador</option>
            </select>
          </div>
          <div class="field">
            <label :for="id + '-branch'">Sucursal <span aria-hidden="true">*</span></label>
            <select
              :id="id + '-branch'"
              v-model="draft.branchId"
              name="branchId"
              class="form-select"
              required
              :disabled="!branches.length"
              :aria-describedby="!branches.length ? id + '-branch-help' : undefined"
            >
              <option value="" disabled>
                {{ branches.length ? 'Seleccione una sucursal' : 'Sin sucursales disponibles' }}
              </option>
              <option v-for="branch in branches" :key="branch.id" :value="branch.id">
                {{ branch.label }}
              </option>
            </select>
            <p v-if="!branches.length" :id="id + '-branch-help'" class="field-help">
              Todavía no hay sucursales disponibles para seleccionar en esta vista.
            </p>
          </div>
          <div class="field full-width">
            <label :for="id + '-address'">Dirección <span aria-hidden="true">*</span></label>
            <select
              :id="id + '-address'"
              v-model="draft.addressId"
              name="addressId"
              class="form-select"
              required
              :disabled="!addresses.length"
              :aria-describedby="!addresses.length ? id + '-address-help' : undefined"
            >
              <option value="" disabled>
                {{ addresses.length ? 'Seleccione una dirección' : 'Sin direcciones disponibles' }}
              </option>
              <option v-for="address in addresses" :key="address.id" :value="address.id">
                {{ address.label }}
              </option>
            </select>
            <p v-if="!addresses.length" :id="id + '-address-help'" class="field-help">
              Todavía no hay direcciones disponibles para seleccionar en esta vista.
            </p>
          </div>
        </div>
      </fieldset>

      <p class="password-note">
        El sistema generará la contraseña inicial y la enviará por correo al crear la cuenta.
      </p>
      <p :id="id + '-preview-help'" class="preview-note">
        Vista previa del formulario. La creación de usuarios todavía no está habilitada.
      </p>
      <footer class="form-actions">
        <button type="button" class="cancel-button" @click="close">Cancelar</button>
        <button
          type="submit"
          class="create-button"
          disabled
          :aria-describedby="id + '-preview-help'"
        >
          Crear usuario
        </button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.employee-dialog {
  width: min(880px, calc(100% - 32px));
  max-width: none;
  max-height: calc(100dvh - 32px);
  padding: 0;
  border: 0;
  border-radius: var(--radius-medium);
  color: var(--color-dark);
  background: var(--color-background);
  overflow: hidden;
}

.employee-dialog[open] {
  display: flex;
  flex-direction: column;
}

.employee-dialog::backdrop {
  background: color-mix(in srgb, var(--color-black) 55%, transparent);
}

.dialog-heading {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  color: var(--color-white);
  background: var(--color-primary);
}

.dialog-heading h2 {
  margin: 0;
  font-size: 1.25rem;
}

.close-button {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: var(--radius-small);
  color: inherit;
  background: transparent;
}

.close-button:hover {
  background: color-mix(in srgb, var(--color-white) 15%, transparent);
}

.close-button:focus-visible {
  outline: 2px solid var(--color-cream);
  outline-offset: 2px;
}

form {
  min-height: 0;
  padding: 24px;
  overflow-y: auto;
}

.required-note,
.field-help,
.password-note,
.preview-note {
  font-size: 0.875rem;
}

fieldset {
  min-width: 0;
  margin-bottom: 24px;
}

legend {
  margin-bottom: 16px;
  font-size: 1rem;
  font-weight: 700;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 20px;
}

.field {
  min-width: 0;
}

.full-width {
  grid-column: 1 / -1;
}

label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
}

.form-control,
.form-select {
  min-width: 0;
  min-height: 44px;
}

.field-help {
  margin: 8px 0 0;
}

.form-control:focus,
.form-select:focus {
  border-color: var(--color-primary);
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  box-shadow: none;
}

.preview-note {
  padding: 12px;
  border-left: 3px solid var(--color-primary);
  background: var(--color-white);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.cancel-button,
.create-button {
  min-height: 44px;
  padding: 10px 20px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-small);
}

.cancel-button {
  color: var(--color-primary);
  background: var(--color-white);
}

.cancel-button:hover {
  background: var(--color-light_gray);
}

.cancel-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.create-button:disabled {
  border-color: var(--color-light_gray);
  color: var(--color-dark);
  background: var(--color-light_gray);
  cursor: not-allowed;
}

@media (max-width: 575px) {
  .dialog-heading {
    padding: 12px 16px;
  }

  form {
    padding: 20px 16px;
  }

  .field-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .form-actions {
    flex-direction: column-reverse;
  }
}
</style>
