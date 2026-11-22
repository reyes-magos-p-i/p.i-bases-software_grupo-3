export interface CardIntentRequest {
  amount: number;
  requestKey: string;
  quoteVersion: string;
  functionId: number;
}

export interface CardIntent {
  intentId: string;
  clientSecret: string;
  publishableKey: string;
}

// Only tokenized data crosses this boundary: the intent id and the card's
// brand and last 4 digits. The card number and CVV never reach the API.
export interface CardSettlement {
  intentId: string;
  livemode: boolean;
  // Minor units (centavos), as the gateway reports them.
  amount: number;
  currency: string;
  requestKey: string | null;
  brand: string;
  last4: string;
}

export abstract class CardPaymentGateway {
  abstract createIntent(request: CardIntentRequest): Promise<CardIntent>;

  // Resolves to null when the intent has not succeeded or is unknown.
  abstract settled(intentId: string): Promise<CardSettlement | null>;
}
