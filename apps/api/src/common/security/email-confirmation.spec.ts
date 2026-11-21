import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { requireEmailConfirmation } from './email-confirmation';

describe('Sensitive action email confirmation', () => {
  it('accepts the email of the current actor with case and whitespace normalization', () => {
    expect(() =>
      requireEmailConfirmation(' ADMIN@example.com ', 'admin@EXAMPLE.com'),
    ).not.toThrow();
  });
  it.each([undefined, '', '   '])(
    'rejects an identity without a current email: %p',
    (actor) => {
      expect(() =>
        requireEmailConfirmation('admin@example.com', actor),
      ).toThrow(UnauthorizedException);
    },
  );
  it.each([undefined, null, 42, '', 'target@example.com'])(
    'rejects missing or different confirmation data: %p',
    (email) => {
      expect(() =>
        requireEmailConfirmation(email, 'admin@example.com'),
      ).toThrow(BadRequestException);
    },
  );
});
