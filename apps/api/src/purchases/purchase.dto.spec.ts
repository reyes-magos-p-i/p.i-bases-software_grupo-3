import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ConfirmPurchaseDto,
  PurchaseSelectionDto,
  ListPurchasesQueryDto,
} from './purchase.dto';
const selection = {
  functionId: 4,
  seats: { GENERAL: [1, 2], CHILD: [], SENIOR: [] },
};
describe('Purchase DTO validation', () => {
  const positions = (length: number) =>
    plainToInstance(ConfirmPurchaseDto, {
      ...selection,
      seats: {
        GENERAL: Array.from({ length }, (_, i) => 10000 - length + 1 + i),
        CHILD: [],
        SENIOR: [],
      },
      requestKey: 'b801323b-9057-460b-b6ab-a36aa4e9b7d2',
      quoteVersion: 'a'.repeat(64),
    });
  it('accepts the ticket limit up to the last physical position', async () => {
    const data = positions(10);
    expect(data.seats.GENERAL.at(-1)).toBe(10000);
    expect(await validate(data)).toEqual([]);
  });
  it('rejects more tickets than one purchase allows', async () => {
    const errors = await validate(positions(11));
    expect(JSON.stringify(errors)).toContain('hasta 10 boletos');
  });
  it.each([
    { functionId: 0 },
    { functionId: '1' },
    { seats: null },
    { seats: [] },
    { seats: { GENERAL: [0], CHILD: [], SENIOR: [] } },
    { seats: { GENERAL: [1, 1], CHILD: [], SENIOR: [] } },
    { seats: { GENERAL: [1.2], CHILD: [], SENIOR: [] } },
    { seats: { GENERAL: [10001], CHILD: [], SENIOR: [] } },
    { seats: { GENERAL: ['1'], CHILD: [], SENIOR: [] } },
    { seats: { GENERAL: [1] } },
  ])('rejects invalid selections %j', async (override) => {
    expect(
      await validate(
        plainToInstance(PurchaseSelectionDto, { ...selection, ...override }),
      ),
    ).not.toHaveLength(0);
  });
  it('rejects forged prices, actors and unsupported categories', async () => {
    const errors = await validate(
      plainToInstance(PurchaseSelectionDto, {
        ...selection,
        clientId: 99,
        total: 1,
        seats: { ...selection.seats, FREE: [3] },
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['clientId', 'total', 'seats']),
    );
  });
  it('requires a UUID request key and a quote hash', async () => {
    expect(
      (await validate(plainToInstance(ConfirmPurchaseDto, selection))).map(
        (error) => error.property,
      ),
    ).toEqual(expect.arrayContaining(['requestKey', 'quoteVersion']));
  });
  it('defaults page and rejects invalid page values', async () => {
    expect(new ListPurchasesQueryDto().page).toBe(1);
    for (const page of ['0', 'abc', '1.5'])
      expect(
        await validate(plainToInstance(ListPurchasesQueryDto, { page })),
      ).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(ListPurchasesQueryDto, { page: '2' })),
    ).toEqual([]);
  });
  it('accepts history filters and rejects invalid ones', async () => {
    const filters = plainToInstance(ListPurchasesQueryDto, {
      search: '  0122 ',
      dateFrom: '2026-10-05',
      dateTo: '2026-10-10',
    });
    expect(await validate(filters)).toEqual([]);
    expect(filters.search).toBe('0122');
    for (const invalid of [
      { search: 'x'.repeat(21) },
      { search: ['0122'] },
      { dateFrom: '05/10/2026' },
      { dateTo: '2026-02-31' },
    ])
      expect(
        await validate(plainToInstance(ListPurchasesQueryDto, invalid)),
      ).not.toHaveLength(0);
  });
});
