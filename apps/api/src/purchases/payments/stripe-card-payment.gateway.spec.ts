import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeCardPaymentGateway } from './stripe-card-payment.gateway';

const mockCreate = jest.fn();
const mockRetrieve = jest.fn();

jest.mock('stripe', () => {
  class StripeInvalidRequestError extends Error {}
  const Stripe = jest.fn().mockImplementation(() => ({
    paymentIntents: { create: mockCreate, retrieve: mockRetrieve },
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
});
