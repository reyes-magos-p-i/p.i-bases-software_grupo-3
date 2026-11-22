import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  CardIntent,
  CardIntentRequest,
  CardPaymentGateway,
  CardSettlement,
} from './card-payment.gateway';

const CURRENCY = 'crc';
const UNAVAILABLE =
  'No se pudo procesar el pago con tarjeta. Intenta nuevamente.';

@Injectable()
export class StripeCardPaymentGateway extends CardPaymentGateway {
  private client?: Stripe;

  constructor(private readonly config: ConfigService) {
    super();
  }

  async createIntent(request: CardIntentRequest): Promise<CardIntent> {
    const stripe = this.stripe();
    try {
      const intent = await stripe.paymentIntents.create(
        {
          // Colones are priced in whole units; Stripe expects centavos.
          amount: request.amount * 100,
          currency: CURRENCY,
          payment_method_types: ['card'],
          metadata: {
            requestKey: request.requestKey,
            functionId: String(request.functionId),
          },
        },
        {
          idempotencyKey: `purchase:${request.requestKey}:${request.quoteVersion}`,
        },
      );
      if (!intent.client_secret) throw new Error('Missing client secret.');
      return {
        intentId: intent.id,
        clientSecret: intent.client_secret,
        publishableKey: this.config.getOrThrow<string>(
          'STRIPE_PUBLISHABLE_KEY',
        ),
      };
    } catch {
      throw new ServiceUnavailableException(UNAVAILABLE);
    }
  }

  async settled(intentId: string): Promise<CardSettlement | null> {
    const stripe = this.stripe();
    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.retrieve(intentId, {
        expand: ['latest_charge'],
      });
    } catch (error) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError) return null;
      throw new ServiceUnavailableException(UNAVAILABLE);
    }
    const charge =
      typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
    const card = charge?.payment_method_details?.card;
    if (intent.status !== 'succeeded' || !card?.brand || !card.last4)
      return null;
    return {
      intentId: intent.id,
      livemode: intent.livemode,
      amount: intent.amount_received,
      currency: intent.currency,
      requestKey: intent.metadata.requestKey ?? null,
      brand: card.brand,
      last4: card.last4,
    };
  }

  private stripe(): Stripe {
    this.client ??= new Stripe(
      this.config.getOrThrow<string>('STRIPE_SECRET_KEY'),
    );
    return this.client;
  }
}
