<script setup lang="ts">
import { computed } from 'vue'
import QrCode from '@/components/common/QrCode.vue'
import { PROJECTION_STATUS_LABELS, type ProjectionStatus } from '@/types/projection'
import { formatDateTime, formatColones } from '@/utils/transaction-format'
import { TICKET_CATEGORY_LABELS, type PurchaseQuote, type PurchaseReceipt } from '@/types/purchase'
const props = defineProps<{ purchase: PurchaseQuote | PurchaseReceipt }>()
const purchaseCode = computed(() => {
  if (!('reference' in props.purchase)) return ''
  return JSON.stringify({
    type: 'CINETADEL_PURCHASE',
    version: 1,
    reference: props.purchase.reference,
  })
})
</script>
<template>
  <section class="purchase-summary" aria-label="Resumen de compra">
    <h2>{{ purchase.function.title }}</h2>
    <dl>
      <div>
        <dt>Sucursal</dt>
        <dd>{{ purchase.function.branchName }}</dd>
      </div>
      <div>
        <dt>Sala</dt>
        <dd>{{ purchase.function.theaterId }}</dd>
      </div>
      <div>
        <dt>Función</dt>
        <dd>{{ formatDateTime(purchase.function.startsAt) }}</dd>
      </div>
      <div>
        <dt>Formato</dt>
        <dd>
          {{ purchase.function.format }} ·
          {{
            purchase.function.technology === 'STANDARD' ? 'Estándar' : purchase.function.technology
          }}{{ purchase.function.isPremiere ? ' · Estreno' : '' }}
        </dd>
      </div>
    </dl>
    <p v-if="'seats' in purchase">
      Asientos:
      {{
        purchase.seats
          .map(
            (seat) =>
              `Fila ${seat.rowNumber}, asiento ${seat.columnNumber} (${TICKET_CATEGORY_LABELS[seat.category]})`,
          )
          .join('; ')
      }}
    </p>
    <div class="line-scroll">
      <table>
        <caption>
          Detalle de los boletos
        </caption>
        <thead>
          <tr>
            <th scope="col">Tipo</th>
            <th scope="col">Cantidad</th>
            <th scope="col">Precio unitario</th>
            <th scope="col">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in purchase.lines" :key="line.code">
            <td>
              {{ line.label }}
            </td>
            <td>{{ line.quantity }}</td>
            <td>{{ formatColones(line.unitPrice) }}</td>
            <td>{{ formatColones(line.subtotal) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="total">Total: {{ formatColones(purchase.total) }}</p>
    <template v-if="'reference' in purchase"
      ><p>
        <strong>{{ purchase.reference }}</strong> · {{ formatDateTime(purchase.purchasedAt) }} ·
        {{ purchase.status === 'PAID' ? 'Pagada' : 'Cancelada' }}
      </p>
      <QrCode
        :value="purchaseCode"
        :label="`Código QR de la compra ${purchase.reference}`"
        class="purchase-qr"
      >
        Código de tu compra.
      </QrCode>
      <h3>Tus boletos</h3>
      <ul v-if="purchase.tickets.length" class="tickets">
        <li v-for="ticket in purchase.tickets" :key="ticket.id">
          <strong>Boleto {{ ticket.id }}</strong> · Fila {{ ticket.rowNumber }}, asiento
          {{ ticket.columnNumber }} · {{ TICKET_CATEGORY_LABELS[ticket.category]
          }}<span v-if="ticket.functionId !== purchase.function.id"
            >Reprogramado: {{ ticket.title }} · Sala {{ ticket.theaterId }} ·
            {{ formatDateTime(ticket.startsAt) }} ({{
              PROJECTION_STATUS_LABELS[ticket.functionStatus as ProjectionStatus] ??
              ticket.functionStatus
            }})</span
          >
        </li>
      </ul>
      <p v-else>Esta compra histórica no tiene boletos vinculados para consultar.</p></template
    >
  </section>
</template>
<style scoped>
.purchase-summary {
  background: var(--content-background);
  color: var(--text-primary);
  padding: clamp(18px, 4vw, 32px);
  border-radius: var(--radius-medium);
  overflow-wrap: anywhere;
}
dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 24px 0;
}
dt {
  color: var(--text-secondary);
  font-weight: 500;
}
dd {
  margin: 4px 0 0;
}
table {
  width: 100%;
  border-collapse: collapse;
}
caption {
  caption-side: top;
  color: var(--text-primary);
}
th,
td {
  padding: 14px 10px;
  border-bottom: 1px solid var(--border-color);
  text-align: left;
  vertical-align: top;
}
.purchase-qr {
  margin: 24px 0;
}
.line-scroll {
  overflow-x: auto;
}
.total {
  font-size: 1.4rem;
  font-weight: 700;
  text-align: right;
  margin: 24px 0;
}
.tickets {
  max-height: 360px;
  overflow: auto;
  padding-left: 20px;
}
.tickets li {
  margin: 12px 0;
}
.tickets span {
  display: block;
  color: var(--warning-text);
}
@media (max-width: 480px) {
  dl {
    grid-template-columns: 1fr;
  }
}
</style>
