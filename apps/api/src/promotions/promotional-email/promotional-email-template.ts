export interface PromotionalEmailPromotion {
  title: string;
  description: string;
}

export interface PromotionalEmailMessage {
  clientName: string;
  email: string;
  promotions: PromotionalEmailPromotion[];
  billboardUrl: string;
  preferencesUrl: string;
}

// Colors and copy follow the Figma "P-379 Anuncios y Promociones Mensuales" frame.
const colors = {
  page: '#0f172a',
  card: '#020617',
  row: '#1e293b',
  divider: '#334155',
  accent: '#ffd700',
  text: '#ffffff',
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export function promotionalEmailTemplate(message: PromotionalEmailMessage) {
  const name = escapeHtml(message.clientName);
  const billboardUrl = escapeHtml(message.billboardUrl);
  const preferencesUrl = escapeHtml(message.preferencesUrl);

  const rows = message.promotions
    .map(
      (promotion) => `
          <tr>
            <td style="background:${colors.row};border-radius:10px;padding:16px 18px;">
              <p style="margin:0 0 6px;font-size:16px;font-weight:600;color:${colors.text};">${escapeHtml(promotion.title)}</p>
              <p style="margin:0;font-size:14px;line-height:1.5;color:${colors.text};">${escapeHtml(promotion.description)}</p>
            </td>
          </tr>
          <tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px 12px;background:${colors.page};font-family:Roboto,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:${colors.card};border-radius:12px;">
      <tr>
        <td style="padding:32px 32px 24px;text-align:center;">
          <p style="margin:0 0 12px;font-size:20px;font-weight:500;letter-spacing:3px;color:${colors.text};">Cinetadel</p>
          <h1 style="margin:0;font-size:24px;font-weight:600;color:${colors.text};">Anuncios y promociones del mes</h1>
        </td>
      </tr>
      <tr><td style="padding:0 32px;"><div style="height:1px;background:${colors.divider};"></div></td></tr>
      <tr>
        <td style="padding:24px 32px 32px;">
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:${colors.text};">Hola ${name},</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:${colors.text};">Estas son las promociones y anuncios del mes seleccionados para ti. Descubre estrenos, descuentos y eventos de Cinetadel.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
            <tr>
              <td align="center" style="background:${colors.accent};border-radius:10px;">
                <a href="${billboardUrl}" style="display:block;padding:18px 17px;font-size:16px;font-weight:600;color:#000000;text-decoration:none;">Ver cartelera</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 28px;text-align:center;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:${colors.text};">Recibes este correo porque activaste los anuncios por correo en tu perfil. Puedes desactivarlos en cualquier momento desde <a href="${preferencesUrl}" style="color:${colors.accent};">Mi perfil</a>.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const list = message.promotions
    .map((promotion) => `- ${promotion.title}: ${promotion.description}`)
    .join('\n');
  const text = [
    `Hola ${message.clientName},`,
    '',
    'Estas son las promociones y anuncios del mes seleccionados para ti. Descubre estrenos, descuentos y eventos de Cinetadel.',
    '',
    list,
    '',
    `Ver cartelera: ${message.billboardUrl}`,
    '',
    `Para dejar de recibir estos correos, desactívalos en tu perfil: ${message.preferencesUrl}`,
  ].join('\n');

  return { text, html };
}
