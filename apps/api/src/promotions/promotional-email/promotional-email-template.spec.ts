import { promotionalEmailTemplate } from './promotional-email-template';

const message = {
  clientName: 'Ana <b>',
  email: 'ana@example.com',
  promotions: [
    { title: 'Estreno de la semana', description: 'Reserva & paga "hoy"' },
  ],
  billboardUrl: 'https://cinema.example/buy-tickets',
  preferencesUrl: 'https://cinema.example/account/profile?section=preferences',
};

describe('promotionalEmailTemplate', () => {
  it('renders the Figma copy, promotions and billboard button', () => {
    const { html, text } = promotionalEmailTemplate(message);

    expect(html).toContain('Anuncios y promociones del mes');
    expect(html).toContain('Estreno de la semana');
    expect(html).toContain('Ver cartelera');
    expect(html).toContain('href="https://cinema.example/buy-tickets"');
    expect(text).toContain('- Estreno de la semana: Reserva & paga "hoy"');
  });

  it('escapes client and promotion text in the HTML body', () => {
    const { html } = promotionalEmailTemplate(message);

    expect(html).toContain('Hola Ana &lt;b&gt;,');
    expect(html).toContain('Reserva &amp; paga &quot;hoy&quot;');
    expect(html).not.toContain('<b>');
  });
});
