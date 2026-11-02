import {
  pricingSettings,
  ticketPrice,
  ticketProductCode,
} from './ticket-pricing';
describe('Ticket pricing policy', () => {
  it('uses the general base without changing accessible seat prices', () => {
    expect(pricingSettings()).toEqual({
      format: '2D',
      technology: 'STANDARD',
      isPremiere: false,
    });
    expect(ticketPrice({})).toEqual({
      base: 3000,
      modifiers: [],
      unitPrice: 3000,
    });
    expect(ticketProductCode('GENERAL', false)).toBe('TICKET_GENERAL_STANDARD');
  });
  it.each(['CHILD', 'SENIOR'] as const)(
    'applies the %s age base with cumulative surcharges',
    (category) => {
      const result = ticketPrice(
        { format: '3D', technology: 'IMAX', isPremiere: true },
        category,
        true,
      );
      expect(result.base).toBe(2500);
      expect(result.unitPrice).toBe(5500);
      expect(result.modifiers.map((item) => item.amount)).toEqual([
        1000, 500, 1000, 500,
      ]);
      expect(ticketProductCode(category, true)).toBe(`TICKET_${category}_VIP`);
    },
  );
  it('prices 70 mm independently from IMAX', () => {
    expect(ticketPrice({ technology: '70MM' }).unitPrice).toBe(3500);
  });
  it.each([
    { format: '4D' },
    { technology: 'OTHER' },
    { isPremiere: 'true' },
    { technology: '70MM', format: '3D' },
  ])('rejects incompatible or invalid settings %j', (settings) => {
    expect(() => pricingSettings(settings as never)).toThrow(RangeError);
  });
  it('rejects an unknown ticket category', () => {
    expect(() => ticketPrice({}, 'OTHER' as never)).toThrow(RangeError);
  });
});
