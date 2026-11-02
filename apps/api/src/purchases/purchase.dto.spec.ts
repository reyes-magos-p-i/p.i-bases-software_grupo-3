import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ConfirmPurchaseDto,
  PurchaseSelectionDto,
  PurchasePageDto,
} from './purchase.dto';
const selection = {
  functionId: 4,
  seats: { GENERAL: [1, 2], CHILD: [], SENIOR: [] },
};
describe('Purchase DTO validation', () => {
  it('accepts a compact selection of all 10000 physical positions', async () => {
    const data = plainToInstance(ConfirmPurchaseDto, {
      ...selection,
      seats: {
        GENERAL: Array.from({ length: 10000 }, (_, i) => i + 1),
        CHILD: [],
        SENIOR: [],
      },
      requestKey: 'b801323b-9057-460b-b6ab-a36aa4e9b7d2',
      quoteVersion: 'a'.repeat(64),
    });
    expect(await validate(data)).toEqual([]);
    expect(Buffer.byteLength(JSON.stringify(data))).toBeLessThan(100000);
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
    expect(new PurchasePageDto().page).toBe(1);
    for (const page of ['0', 'abc', '1.5'])
      expect(
        await validate(plainToInstance(PurchasePageDto, { page })),
      ).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(PurchasePageDto, { page: '2' })),
    ).toEqual([]);
  });
});
