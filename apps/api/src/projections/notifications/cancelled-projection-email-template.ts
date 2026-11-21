import type { CancelledProjectionEmailMessage } from './cancelled-projection-email-sender';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const showtime = (value: string) =>
  new Intl.DateTimeFormat('es-CR', {
    timeZone: 'America/Costa_Rica',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));

// Colors follow the cancellation email design (Figma P-381).
const COLORS = {
  page: '#0f172a',
  card: '#020617',
  row: '#1e293b',
  icon: '#334155',
  accent: '#ffd700',
  text: '#ffffff',
  muted: '#cbd5e1',
};

const OPTIONS = [
  {
    title: 'Cambiar de proyección',
    body: 'Elige otra proyección de la misma película en la misma sucursal.',
  },
  {
    title: 'Devolución de mi dinero',
    body: 'Te devolvemos el monto pagado por este boleto.',
  },
];

export function cancelledProjectionEmailTemplate(
  message: CancelledProjectionEmailMessage,
) {
  const name = escapeHtml(message.clientName);
  const movie = escapeHtml(message.movieTitle);
  const when = showtime(message.startsAt);
  const url = escapeHtml(message.changeUrl);

  const rows = OPTIONS.map(
    (option) => `
          <tr><td style="padding:0 0 12px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.row};border-radius:10px;">
              <tr>
                <td style="padding:20px;">
                  <p style="margin:0 0 6px 0;font-weight:600;color:${COLORS.text};">${option.title}</p>
                  <p style="margin:0;color:${COLORS.muted};font-size:14px;">${option.body}</p>
                </td>
              </tr>
            </table>
          </td></tr>`,
  ).join('');

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:${COLORS.page};font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${COLORS.card};border-radius:12px;">
          <tr><td align="center" style="padding:32px 24px 16px 24px;">
            <p style="margin:0;color:${COLORS.text};font-size:20px;letter-spacing:3px;">Cinetadel</p>
            <h1 style="margin:16px 0 0 0;color:${COLORS.text};font-size:24px;">Tu proyección fue cancelada</h1>
          </td></tr>
          <tr><td style="padding:16px 24px 24px 24px;color:${COLORS.text};">
            <p style="margin:0 0 8px 0;font-weight:600;">Hola ${name},</p>
            <p style="margin:0 0 20px 0;font-size:14px;line-height:1.5;">Lamentamos informarte que la proyección de ${movie} (${when}) fue cancelada. Elige cómo quieres continuar con tu boleto.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
              <tr><td align="center">
                <a href="${url}" style="display:block;background:${COLORS.accent};color:#000000;text-decoration:none;font-weight:600;padding:16px;border-radius:10px;">Cambiar mi boleto</a>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    `Hola ${message.clientName},`,
    '',
    `Lamentamos informarte que la proyección de ${message.movieTitle} (${when}) fue cancelada.`,
    '',
    'Puedes:',
    ...OPTIONS.map((option) => `- ${option.title}: ${option.body}`),
    '',
    `Cambiar mi boleto: ${message.changeUrl}`,
    '',
    'Equipo Cinetadel',
  ].join('\n');

  return { html, text };
}
