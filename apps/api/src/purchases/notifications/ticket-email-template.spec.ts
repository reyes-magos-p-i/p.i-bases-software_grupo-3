import { ticketEmailTemplate } from './ticket-email-template';
import { readEmailTheme } from '../../common/email-theme';
import type { TicketEmailMessage } from './ticket-email-sender';

describe('Ticket email content', () => {
  const message = {
    email: 'client@example.com',
    receipt: {
      reference: 'ORD-000012',
      function: { id: 4 },
      tickets: [
        {
          id: 1,
          title: '<Película & cine>',
          branchName: 'Sucursal centro',
          theaterId: 3,
          functionId: 4,
          startsAt: '2099-01-01T20:00:00-06:00',
          rowNumber: 1,
          columnNumber: 2,
          category: 'GENERAL',
          functionStatus: 'ACTIVE',
        },
        {
          id: 2,
          title: 'Otra película',
          branchName: 'Sucursal nueva',
          theaterId: 8,
          functionId: 9,
          startsAt: '2099-01-02T17:00:00-06:00',
          rowNumber: 3,
          columnNumber: 4,
          category: 'CHILD',
          functionStatus: 'CANCELLED',
        },
      ],
    },
  } as TicketEmailMessage;
  it('contains each current ticket, identifies rescheduling and escapes untrusted HTML', () => {
    const body = ticketEmailTemplate(message, readEmailTheme());
    expect(body.html).toContain('&lt;Película &amp; cine&gt;');
    expect(body.html).not.toContain('<Película');
    expect(body.text).toContain('Boleto 1');
    expect(body.text).toContain('Boleto 2 · Reprogramado');
    expect(body.text).toContain('Sucursal nueva · Sala 8');
    expect(body.text).toContain('Fila 3, asiento 4 · Niño');
    expect(body.text).toContain('Esta función fue cancelada.');
    expect(body.text).toContain('20:00');
    expect(body.html).toContain('cid:purchase-qr');
    expect(body.html).not.toContain('cid:cinetadel-logo');
    expect(body.html).not.toContain('Código privado de consulta');
  });
  it('includes a private receipt link separately from the purchase QR and handles senior tickets', () => {
    const link = 'https://cinema.example/guest-purchases/receipt#12.PRIVATE';
    const body = ticketEmailTemplate(
      {
        ...message,
        accessCode: '12.PRIVATE',
        receipt: {
          ...message.receipt,
          tickets: [{ ...message.receipt.tickets[0]!, category: 'SENIOR' }],
        },
      },
      readEmailTheme(),
      link,
    );
    expect(body.text).toContain('Ver mi compra: ' + link);
    expect(body.html).toContain(`href="${link}"`);
    expect(body.html).toContain('>Ver mi compra</a>');
    expect(body.html).not.toContain('Código privado de consulta');
    expect(body.text).not.toContain('pie de página');
    expect(body.text).toContain('Adulto mayor');
    expect(body.text).toContain('no lo compartas');
    expect(body.html).toContain('cid:purchase-qr');
  });
  it('escapes the private link when formatting HTML attributes', () => {
    const body = ticketEmailTemplate(
      message,
      readEmailTheme(),
      'https://cinema.example/#"&<',
    );
    expect(body.html).toContain(
      'href="https://cinema.example/#&quot;&amp;&lt;"',
    );
    expect(body.text).toContain('https://cinema.example/#"&<');
  });
});
