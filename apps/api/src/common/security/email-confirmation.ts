import { BadRequestException, UnauthorizedException } from '@nestjs/common';

export function requireEmailConfirmation(
  email: unknown,
  actorEmail?: string,
): void {
  if (!actorEmail?.trim())
    throw new UnauthorizedException(
      'Tu sesión terminó. Inicia sesión nuevamente.',
    );
  if (
    typeof email !== 'string' ||
    email.trim().toLowerCase() !== actorEmail.trim().toLowerCase()
  )
    throw new BadRequestException(
      'El correo debe coincidir con el de tu sesión para confirmar esta acción.',
    );
}
