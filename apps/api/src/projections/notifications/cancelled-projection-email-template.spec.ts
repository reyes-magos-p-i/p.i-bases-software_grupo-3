import { cancelledProjectionEmailTemplate } from './cancelled-projection-email-template';

describe('cancelledProjectionEmailTemplate', () => {
  const message = {
    email: 'ana@example.com',
    clientName: 'Ana <Mora>',
    movieTitle: 'Dune & Co',
    startsAt: '2026-11-14T18:30:00-06:00',
    ticketId: 11,
    changeUrl: 'https://cinetadel.test/cancelled-tickets/11',
  };

  it('links to the change page from the call to action', () => {
    const { html } = cancelledProjectionEmailTemplate(message);
    expect(html).toContain('href="https://cinetadel.test/cancelled-tickets/11"');
    expect(html).toContain('Cambiar mi boleto');
  });

  it('escapes client and movie names in html', () => {
    const { html } = cancelledProjectionEmailTemplate(message);
    expect(html).toContain('Ana &lt;Mora&gt;');
    expect(html).toContain('Dune &amp; Co');
    expect(html).not.toContain('<Mora>');
  });

  it('offers the change and refund options in plain text too', () => {
    const { text } = cancelledProjectionEmailTemplate(message);
    expect(text).toContain('Cambiar de proyección');
    expect(text).toContain('Devolución de mi dinero');
    expect(text).toContain('https://cinetadel.test/cancelled-tickets/11');
  });
});
