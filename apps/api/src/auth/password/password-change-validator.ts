import { BadRequestException } from '@nestjs/common';
import {
  validatePasswordPolicy,
  type PasswordPolicyContext,
} from '../../clients/password-policy';

export async function validatePasswordChange(
  input: { newPassword: string; confirmNewPassword: string },
  identity: PasswordPolicyContext,
  matchesCurrentPassword: () => Promise<boolean>,
): Promise<void> {
  if (input.newPassword !== input.confirmNewPassword) {
    throw new BadRequestException({
      code: 'PASSWORDS_DO_NOT_MATCH',
      message: 'Las contraseñas no coinciden.',
    });
  }
  if ([...input.newPassword].length > 128) {
    throw new BadRequestException({
      code: 'PASSWORD_POLICY_VIOLATION',
      violations: ['max_length'],
    });
  }
  if (await matchesCurrentPassword()) {
    throw new BadRequestException({
      code: 'NEW_PASSWORD_SAME_AS_CURRENT',
      message: 'La nueva contraseña no puede ser igual a la actual.',
    });
  }
  const violations = validatePasswordPolicy(input.newPassword, identity);
  if (violations.length) {
    throw new BadRequestException({
      code: 'PASSWORD_POLICY_VIOLATION',
      violations,
    });
  }
}
