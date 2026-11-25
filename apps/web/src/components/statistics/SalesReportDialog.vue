<script setup lang="ts">
import { onBeforeUnmount, ref, useId } from 'vue'
import BaseModal from '@/components/common/BaseModal.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import SalesPeriodFilter from './SalesPeriodFilter.vue'
import { downloadSalesReport, SALES_REPORT_ERROR } from '@/services/sales-report.service'
import { authErrorStatus } from '@/utils/auth-errors'

defineProps<{ initialPeriod: { dateFrom: string; dateTo: string } }>()
const emit = defineEmits<{ close: []; downloaded: []; 'session-expired': [] }>()
const id = useId()
const dataAppendix = ref(true)
const notesAppendix = ref(true)
const generating = ref(false)
const notice = ref('')
const noticeType = ref<'alert' | 'error'>('error')
let request: AbortController | undefined

function close() {
  request?.abort()
  emit('close')
}
async function generate(period: { dateFrom: string; dateTo: string }) {
  if (generating.value) return
  const current = new AbortController()
  request = current
  generating.value = true
  notice.value = ''
  try {
    const result = await downloadSalesReport(
      period,
      { dataAppendix: dataAppendix.value, notesAppendix: notesAppendix.value },
      current.signal,
    )
    if (current.signal.aborted) return
    if (result === 'empty') {
      noticeType.value = 'alert'
      notice.value = 'No se encontraron ventas para el periodo seleccionado.'
    } else {
      emit('downloaded')
      emit('close')
    }
  } catch (error_) {
    if (current.signal.aborted) return
    if (authErrorStatus(error_) === 401) {
      emit('session-expired')
      close()
      return
    }
    noticeType.value = 'error'
    notice.value = SALES_REPORT_ERROR
  } finally {
    if (request === current) generating.value = false
  }
}
onBeforeUnmount(() => request?.abort())
</script>

<template>
  <BaseModal open title="Generar reporte de ventas" @close="close">
    <div class="sales-report-dialog dialog-content" :aria-busy="generating">
      <p>
        El reporte incluirá ingresos, boletos y compras para todas las estadísticas del periodo.
      </p>
      <LoadingState v-if="generating" message="Generando reporte…" compact />
      <SalesPeriodFilter
        :initial-period="initialPeriod"
        :id-prefix="id"
        :auto-apply="false"
        always-show-submit
        :disabled="generating"
        surface="light"
        @apply="generate"
      >
        <template #options>
          <fieldset class="report-options" :disabled="generating">
            <legend>Anexos</legend>
            <label
              ><input v-model="dataAppendix" type="checkbox" /> Datos completos de los
              gráficos</label
            >
            <label
              ><input v-model="notesAppendix" type="checkbox" /> Criterios y aclaraciones</label
            >
          </fieldset>
        </template>
        <template #actions>
          <footer class="dialog-actions report-actions">
            <button type="button" class="secondary-button" @click="close">Cancelar</button>
            <button type="submit" class="primary-button" :disabled="generating">
              <i class="bi bi-download" aria-hidden="true" /> Descargar reporte
            </button>
          </footer>
        </template>
      </SalesPeriodFilter>
      <NotificationPopup
        v-if="notice"
        :type="noticeType"
        :message="notice"
        placement="bottom-right"
        :duration="0"
        @close="notice = ''"
      />
    </div>
  </BaseModal>
</template>

<style scoped>
.sales-report-dialog > p {
  color: var(--text-secondary);
  margin: 0 0 24px;
  line-height: 1.6;
}
.sales-report-dialog :deep(.period-field:first-child) {
  flex-basis: 100%;
}
.report-options {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 8px 0;
  border: 0;
  flex: 1 0 100%;
  min-width: 0;
}
.report-options legend {
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 12px;
}
.report-options label {
  display: flex;
  gap: 10px;
  align-items: start;
  font-size: 0.875rem;
}
.report-options input {
  margin-top: 4px;
  accent-color: var(--dialog-accent-color);
}
.report-actions {
  flex: 1 0 100%;
}
.report-actions button {
  min-height: 44px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-small);
  padding: 10px 14px;
}
.secondary-button {
  color: var(--text-primary);
  background: var(--input-background);
}
.primary-button {
  color: var(--dialog-heading-text);
  background: var(--dialog-accent-color);
}
.primary-button:hover {
  background: var(--dialog-action-hover-background);
}
.primary-button:disabled {
  opacity: 0.6;
  cursor: wait;
}
</style>
