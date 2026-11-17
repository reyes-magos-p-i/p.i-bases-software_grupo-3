import type { EmailTheme } from '../../common/email-theme';
import type { TicketEmailMessage } from './ticket-email-sender';

const escapeHtml = (value: string | number) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const date = (value: string) =>
  new Intl.DateTimeFormat('es-CR', {
    timeZone: 'America/Costa_Rica',
    dateStyle: 'long',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(new Date(value));
const categories = {
  GENERAL: 'General',
  CHILD: 'Niño',
  SENIOR: 'Adulto mayor',
};

function functionNotice(status: string) {
  if (status === 'CANCELLED') return ['Esta función fue cancelada.'];
  return status === 'ACTIVE'
    ? []
    : ['Esta función no está activa. Consulta su estado en tu compra.'];
}

export function ticketEmailTemplate(
  message: TicketEmailMessage,
  theme: EmailTheme,
  guestAccessUrl?: string,
) {
  const { receipt } = message;
  const tickets = receipt.tickets.map((ticket) => [
    `Boleto ${ticket.id}${ticket.functionId !== receipt.function.id ? ' · Reprogramado' : ''}`,
    ticket.title,
    date(ticket.startsAt),
    `${ticket.branchName} · Sala ${ticket.theaterId}`,
    `Fila ${ticket.rowNumber}, asiento ${ticket.columnNumber} · ${categories[ticket.category]}`,
    ...functionNotice(ticket.functionStatus),
  ]);
  const text = [
    'Tus boletos de Cinetadel',
    receipt.reference,
    '',
    ...tickets.flatMap((lines) => [...lines, '']),
    'El código QR adjunto identifica esta compra.',
    ...(guestAccessUrl
      ? [
          '',
          'Ver mi compra: ' + guestAccessUrl,
          'Guarda este enlace y no lo compartas. Quien lo tenga podrá consultar esta compra.',
        ]
      : []),
    '',
    'Conserva este correo para tu visita. Equipo Cinetadel',
  ].join('\n');
  const cards = tickets
    .map((lines) => {
      const details = lines
        .slice(1)
        .map(
          (line) =>
            `<p style="margin:6px 0;line-height:1.5">${escapeHtml(line)}</p>`,
        )
        .join('');
      return `<tr><td style="padding:20px;background:${theme['content-background']};color:${theme['page-background']};border-bottom:3px solid ${theme['primary-color']}">
        <h2 style="margin:0 0 12px;font-size:18px">${escapeHtml(lines[0]!)}</h2>
        ${details}
      </td></tr><tr><td style="height:16px"></td></tr>`;
    })
    .join('');
  const guestAccess = guestAccessUrl
    ? `<h2 style="font-size:18px">El enlace de tu compra</h2>
    <p style="margin:24px 0"><a href="${escapeHtml(guestAccessUrl)}" referrerpolicy="no-referrer" style="display:inline-block;padding:12px 20px;border-radius:8px;background:${theme['accent-color']};color:${theme['page-background']};font-weight:bold;text-decoration:none">Ver mi compra</a></p>
    <p>Guarda este enlace y no lo compartas. Quien lo tenga podrá consultar esta compra.</p>`
    : '';
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Tus boletos de Cinetadel</title>
</head>
<body style="margin:0;background:${theme['page-background']};font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr><td align="center" style="padding:24px 16px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:${theme['surface-background']};color:${theme['content-background']}">
        <tr><td align="center" style="padding:24px">
          <h1 style="font-size:26px">¡Nos vemos en el cine!</h1>
          <p>Tus boletos · <strong style="color:${theme['accent-color']}">${escapeHtml(receipt.reference)}</strong></p>
        </td></tr>
        ${cards}
        <tr><td align="center" style="padding:24px">
          <img src="cid:purchase-qr" alt="Código QR de la compra ${escapeHtml(receipt.reference)}" width="256" height="256" style="display:block;max-width:100%;height:auto">
          <p>Un QR para todos los boletos de esta compra.</p>
          ${guestAccess}
          <p style="line-height:1.5">Conserva este correo para tu visita.<br>Equipo Cinetadel</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { text, html };
}
