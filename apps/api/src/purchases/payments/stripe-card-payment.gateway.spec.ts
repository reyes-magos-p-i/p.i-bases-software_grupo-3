import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeCardPaymentGateway } from './stripe-card-payment.gateway';

const mockCreate = jest.fn();
const mockRetrieve = jest.fn();
const mockRefund = jest.fn();

jest.mock('stripe', () => {
  class StripeInvalidRequestError extends Error {}
  const Stripe = jest.fn().mockImplementation(() => ({
    paymentIntents: { create: mockCreate, retrieve: mockRetrieve },
    refunds: { create: mockRefund },
  }));
  Object.assign(Stripe, { errors: { StripeInvalidRequestError } });
  return { __esModule: true, default: Stripe };
});

describe('StripeCardPaymentGateway', () => {
  const config = {
    getOrThrow: (key: string) => `${key}-value`,
  } as unknown as ConfigService;
  const gateway = new StripeCardPaymentGateway(config);

  beforeEach(() => {
    mockCreate.mockReset();
    mockRetrieve.mockReset();
    mockRefund.mockReset();
  });

  it('creates a CRC intent in centavos with the request metadata', async () => {
    mockCreate.mockResolvedValue({ id: 'pi_1', client_secret: 'secret' });

    await expect(
      gateway.createIntent({
        amount: 5000,
        requestKey: 'key',
        quoteVersion: 'v',
        functionId: 7,
      }),
    ).resolves.toEqual({
      intentId: 'pi_1',
      clientSecret: 'secret',
      publishableKey: 'STRIPE_PUBLISHABLE_KEY-value',
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 500000,
        currency: 'crc',
        payment_method_types: ['card'],
        metadata: { requestKey: 'key', functionId: '7' },
      }),
      { idempotencyKey: 'purchase:key:v' },
    );
  });

  it('hides gateway failures behind a generic unavailable error', async () => {
    mockCreate.mockRejectedValue(new Error('network down'));

    await expect(
      gateway.createIntent({
        amount: 1,
        requestKey: 'key',
        quoteVersion: 'v',
        functionId: 1,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns only tokenized card data for a succeeded intent', async () => {
    mockRetrieve.mockResolvedValue({
      id: 'pi_1',
      status: 'succeeded',
      livemode: false,
      amount_received: 500000,
      currency: 'crc',
      metadata: { requestKey: 'key' },
      latest_charge: {
        payment_method_details: { card: { brand: 'visa', last4: '4242' } },
      },
    });

    await expect(gateway.settled('pi_1')).resolves.toEqual({
      intentId: 'pi_1',
      livemode: false,
      amount: 500000,
      currency: 'crc',
      requestKey: 'key',
      brand: 'visa',
      last4: '4242',
    });
  });

  it('returns null for an intent whose charge was refunded', async () => {
    mockRetrieve.mockResolvedValue({
      id: 'pi_1',
      status: 'succeeded',
      livemode: false,
      amount_received: 500000,
      currency: 'crc',
      metadata: { requestKey: 'key' },
      latest_charge: {
        refunded: true,
        payment_method_details: { card: { brand: 'visa', last4: '4242' } },
      },
    });

    await expect(gateway.settled('pi_1')).resolves.toBeNull();
  });

  it('refunds the intent with a stable idempotency key', async () => {
    mockRefund.mockResolvedValue({ id: 're_1' });

    await expect(gateway.refund('pi_1')).resolves.toBeUndefined();
    expect(mockRefund).toHaveBeenCalledWith(
      { payment_intent: 'pi_1' },
      { idempotencyKey: 'refund:pi_1' },
    );
  });

  it('treats an already refunded charge as refunded', async () => {
    const Stripe = jest.requireMock('stripe').default;
    const failure = new Stripe.errors.StripeInvalidRequestError('refunded');
    Object.assign(failure, { code: 'charge_already_refunded' });
    mockRefund.mockRejectedValue(failure);

    await expect(gateway.refund('pi_1')).resolves.toBeUndefined();
  });

  it('hides other refund failures behind a generic unavailable error', async () => {
    mockRefund.mockRejectedValue(new Error('network down'));

    await expect(gateway.refund('pi_1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns null when the intent did not succeed', async () => {
    mockRetrieve.mockResolvedValue({
      id: 'pi_1',
      status: 'requires_payment_method',
      latest_charge: null,
      metadata: {},
    });

    await expect(gateway.settled('pi_1')).resolves.toBeNull();
  });

  it('returns null for an unknown intent id', async () => {
    const Stripe = jest.requireMock('stripe').default;
    const { StripeInvalidRequestError } = Stripe.errors;
    mockRetrieve.mockRejectedValue(new StripeInvalidRequestError('missing'));

    await expect(gateway.settled('pi_nope')).resolves.toBeNull();
  });

  it('hides unexpected retrieve failures behind a generic unavailable error', async () => {
    mockRetrieve.mockRejectedValue(new Error('network down'));

    await expect(gateway.settled('pi_1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('expands the latest charge when retrieving the intent', async () => {
    mockRetrieve.mockResolvedValue({
      id: 'pi_1',
      status: 'requires_payment_method',
      latest_charge: null,
      metadata: {},
    });

    await gateway.settled('pi_1');

    expect(mockRetrieve).toHaveBeenCalledWith('pi_1', {
      expand: ['latest_charge'],
    });
  });

  it('returns null when the charge was not expanded to an object', async () => {
    mockRetrieve.mockResolvedValue({
      id: 'pi_1',
      status: 'succeeded',
      latest_charge: 'ch_1',
      metadata: {},
    });

    await expect(gateway.settled('pi_1')).resolves.toBeNull();
  });

  it('returns null when a succeeded intent has no charge', async () => {
    mockRetrieve.mockResolvedValue({
      id: 'pi_1',
      status: 'succeeded',
      latest_charge: null,
      metadata: {},
    });

    await expect(gateway.settled('pi_1')).resolves.toBeNull();
  });

  it('returns null when the charge has no card details', async () => {
    mockRetrieve.mockResolvedValue({
      id: 'pi_1',
      status: 'succeeded',
      latest_charge: { payment_method_details: { type: 'sepa_debit' } },
      metadata: {},
    });

    await expect(gateway.settled('pi_1')).resolves.toBeNull();
  });

  it('returns null when the card brand or last4 is missing', async () => {
    mockRetrieve.mockResolvedValue({
      id: 'pi_1',
      status: 'succeeded',
      latest_charge: {
        payment_method_details: { card: { brand: 'visa', last4: null } },
      },
      metadata: {},
    });

    await expect(gateway.settled('pi_1')).resolves.toBeNull();

    mockRetrieve.mockResolvedValue({
      id: 'pi_1',
      status: 'succeeded',
      latest_charge: {
        payment_method_details: { card: { brand: null, last4: '4242' } },
      },
      metadata: {},
    });

    await expect(gateway.settled('pi_1')).resolves.toBeNull();
  });

  it('returns a null requestKey when the intent has no metadata key', async () => {
    mockRetrieve.mockResolvedValue({
      id: 'pi_1',
      status: 'succeeded',
      livemode: true,
      amount_received: 1000,
      currency: 'crc',
      metadata: {},
      latest_charge: {
        payment_method_details: {
          card: { brand: 'mastercard', last4: '1111' },
        },
      },
    });

    await expect(gateway.settled('pi_1')).resolves.toEqual({
      intentId: 'pi_1',
      livemode: true,
      amount: 1000,
      currency: 'crc',
      requestKey: null,
      brand: 'mastercard',
      last4: '1111',
    });
  });

  it('rejects createIntent when Stripe returns no client secret', async () => {
    mockCreate.mockResolvedValue({ id: 'pi_1', client_secret: null });

    await expect(
      gateway.createIntent({
        amount: 1,
        requestKey: 'key',
        quoteVersion: 'v',
        functionId: 1,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('builds the Stripe client once from the secret key and reuses it', async () => {
    const Stripe = jest.requireMock('stripe').default;
    Stripe.mockClear();
    mockCreate.mockResolvedValue({ id: 'pi_1', client_secret: 'secret' });
    mockRetrieve.mockResolvedValue({
      id: 'pi_1',
      status: 'requires_payment_method',
      latest_charge: null,
      metadata: {},
    });
    const fresh = new StripeCardPaymentGateway(config);
    const request = {
      amount: 1,
      requestKey: 'key',
      quoteVersion: 'v',
      functionId: 1,
    };

    await fresh.createIntent(request);
    await fresh.createIntent(request);
    await fresh.settled('pi_1');

    expect(Stripe).toHaveBeenCalledTimes(1);
    expect(Stripe).toHaveBeenCalledWith('STRIPE_SECRET_KEY-value');
  });

  it('lets missing Stripe configuration surface instead of hiding it', async () => {
    const missing = {
      getOrThrow: (key: string) => {
        throw new Error(`Missing ${key}`);
      },
    } as unknown as ConfigService;
    const fresh = new StripeCardPaymentGateway(missing);

    await expect(
      fresh.createIntent({
        amount: 1,
        requestKey: 'key',
        quoteVersion: 'v',
        functionId: 1,
      }),
    ).rejects.toThrow('Missing STRIPE_SECRET_KEY');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
