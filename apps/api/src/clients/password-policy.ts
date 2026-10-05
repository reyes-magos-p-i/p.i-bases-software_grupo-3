export interface PasswordPolicyContext {
  email?: string;
  firstName?: string;
}

export type PasswordPolicyViolation =
  | 'min_length'
  | 'missing_uppercase'
  | 'missing_lowercase'
  | 'missing_number'
  | 'missing_special_character'
  | 'matches_identity'
  | 'common_password';

const SPECIAL_CHARACTERS = /[!@#$%^&*_\-]/;



/**
 * TODO(Raul): See line 55 on RegisterModal.vue. We should check from a maintained
 *  list of common passwords instead of hardcoding them here. This list should be
 *  updated periodically.
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', '12345678', 'qwerty123', 'contrasena123', 'cinetadel1',
]);

export function validatePasswordPolicy(
  password: string,
  context: PasswordPolicyContext = {},
): PasswordPolicyViolation[] {
  const violations: PasswordPolicyViolation[] = [];
  if (password.length < 8) violations.push('min_length');
  if (!/[A-Z]/.test(password)) violations.push('missing_uppercase');
  if (!/[a-z]/.test(password)) violations.push('missing_lowercase');
  if (!/[0-9]/.test(password)) violations.push('missing_number');
  if (!SPECIAL_CHARACTERS.test(password)) violations.push('missing_special_character');

  const lowerPassword = password.toLowerCase();
  const identityFragments = [context.email, context.firstName]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
  if (identityFragments.some((f) => f.length >= 4 && lowerPassword.includes(f))) {
    violations.push('matches_identity');
  }
  if (COMMON_PASSWORDS.has(lowerPassword)) violations.push('common_password');

  return violations;
}