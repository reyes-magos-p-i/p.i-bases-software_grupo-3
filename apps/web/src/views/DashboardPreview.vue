<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue'
import { isAxiosError } from 'axios'
import CreateEmployeeDialog from '@/components/users/CreateEmployeeDialog.vue'
import DashboardLayout from '@/components/layout/DashboardLayout.vue'
import type { UserRole, UserCreationOptions } from '@/types/user'
import { getUserCreationOptions } from '@/services/user.service'

const role = ref<Exclude<UserRole, 'CLIENT'>>('ADMINISTRATOR')
const activeSection = ref<'employees' | 'clients'>('employees')
const roleId = useId()
const employeeDialog = useTemplateRef<InstanceType<typeof CreateEmployeeDialog>>('employee-dialog')
const catalogs = ref<UserCreationOptions | null>(null)
const catalogsLoading = ref(false)
const catalogsError = ref('')
let catalogRequest: AbortController | undefined

function cancelCatalogRequest() {
  catalogRequest?.abort()
  catalogRequest = undefined
  catalogsLoading.value = false
}

async function loadCatalogs() {
  if (catalogsLoading.value || catalogs.value) return
  const request = new AbortController()
  catalogRequest = request
  catalogsLoading.value = true
  catalogsError.value = ''
  try {
    const options = await getUserCreationOptions(request.signal)
    if (!request.signal.aborted) catalogs.value = options
  } catch (error) {
    if (request.signal.aborted) return
    if (isAxiosError(error) && error.response?.status === 403) {
      catalogsError.value = 'No tienes permiso para cargar las opciones del formulario.'
    } else if (
      isAxiosError(error) &&
      (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')
    ) {
      catalogsError.value = 'La carga está tardando demasiado. Puedes volver a intentarlo.'
    } else {
      catalogsError.value =
        'No se pudieron cargar las opciones. Comprueba la conexión y vuelve a intentarlo.'
    }
  } finally {
    if (catalogRequest === request) {
      catalogsLoading.value = false
      catalogRequest = undefined
    }
  }
}

function openEmployeeDialog() {
  employeeDialog.value?.open()
  void loadCatalogs()
}

watch([role, activeSection], () => {
  cancelCatalogRequest()
  catalogs.value = null
  catalogsError.value = ''
})
onBeforeUnmount(cancelCatalogRequest)
const availableSections = computed(() =>
  role.value === 'ADMINISTRATOR' ? ['employees', 'clients'] : ['clients'],
)
const sectionTitle = computed(() =>
  activeSection.value === 'employees' ? 'Empleados' : 'Clientes',
)

watch(role, () => {
  if (role.value === 'EMPLOYEE' && activeSection.value === 'employees') {
    activeSection.value = 'clients'
  }
})

function navigate(section: string) {
  if (
    (section === 'employees' || section === 'clients') &&
    availableSections.value.includes(section)
  ) {
    activeSection.value = section
  }
}
</script>

<template>
  <DashboardLayout
    :role="role"
    user-name="Usuario de prueba"
    :active-section="activeSection"
    :available-sections="availableSections"
    @navigate="navigate"
  >
    <section class="preview-toolbar" aria-label="Controles de la vista de desarrollo">
      <div class="preview-description">
        <p class="preview-title">
          <i class="bi bi-tools" aria-hidden="true"></i>
          Vista de desarrollo
        </p>
        <p>
          El rol de esta vista es simulado. El formulario consulta catálogos reales, con los
          permisos del administrador configurado en el servidor. La creación todavía no está
          habilitada.
        </p>
      </div>
      <div class="preview-controls">
        <div class="role-field">
          <label :for="roleId" class="form-label">Rol de prueba</label>
          <select :id="roleId" v-model="role" class="form-select">
            <option value="ADMINISTRATOR">Administrador</option>
            <option value="EMPLOYEE">Empleado</option>
          </select>
        </div>
        <RouterLink to="/" class="portal-link">
          <i class="bi bi-arrow-left" aria-hidden="true"></i>
          Volver al portal
        </RouterLink>
      </div>
    </section>

    <section class="preview-content" aria-live="polite" aria-atomic="true">
      <div class="section-heading">
        <h1>{{ sectionTitle }}</h1>
        <button
          v-if="role === 'ADMINISTRATOR' && activeSection === 'employees'"
          type="button"
          class="add-employee-button"
          aria-haspopup="dialog"
          @click="openEmployeeDialog"
        >
          <i class="bi bi-plus-lg" aria-hidden="true"></i>
          Añadir empleado
        </button>
      </div>
      <div class="preview-placeholder">
        <h2>Sección en preparación</h2>
        <p>El contenido de esta sección se incorporará en próximos incrementos.</p>
        <p>Puedes probar el menú lateral, cambiar el rol y ajustar el tamaño de la ventana.</p>
      </div>
    </section>
    <CreateEmployeeDialog
      v-if="role === 'ADMINISTRATOR' && activeSection === 'employees'"
      ref="employee-dialog"
      :provinces="catalogs?.provinces"
      :cantons="catalogs?.cantons"
      :districts="catalogs?.districts"
      :branches="catalogs?.branches"
      :catalogs-loading="catalogsLoading"
      :catalogs-error="catalogsError"
      @retry-catalogs="loadCatalogs"
    />
  </DashboardLayout>
</template>

<style scoped>
.preview-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 20px 32px;
  margin-bottom: 32px;
  padding: 20px;
  border-left: 4px solid var(--color-primary);
  border-radius: var(--radius-small);
  background: var(--color-background);
}

.preview-description {
  flex: 1 1 20rem;
  min-width: 0;
}

.preview-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: var(--color-primary);
  font-weight: 700;
}

.preview-description > p:last-child,
.preview-placeholder > p:last-child {
  margin-bottom: 0;
}

.preview-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
  max-width: 100%;
}

.role-field {
  flex: 1 1 12rem;
  min-width: 0;
}

.form-label {
  font-weight: 600;
}

.form-select {
  min-height: 44px;
}

.portal-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px;
  border-radius: var(--radius-small);
  color: var(--color-primary);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.portal-link:hover {
  background: var(--color-light_gray);
}

.portal-link:focus-visible,
.form-select:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  box-shadow: none;
}

.section-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.preview-content h1 {
  margin: 0;
  font-size: clamp(1.5rem, 4vw, 2rem);
}

.add-employee-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 10px 20px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-small);
  color: var(--color-white);
  background: var(--color-primary);
}

.add-employee-button:hover {
  background: var(--color-dark);
}

.add-employee-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.preview-placeholder {
  padding: 24px;
  border-radius: var(--radius-medium);
  background: var(--color-white);
}

.preview-placeholder h2 {
  margin-bottom: 12px;
  font-size: 1.125rem;
}
</style>
