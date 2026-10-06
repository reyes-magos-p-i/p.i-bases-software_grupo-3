export interface PasswordPolicyCheck {
  code: string
  label: string
  satisfied: boolean
}

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  '12345678',
  'qwerty123',
  'contrasena',
  'contrasena123',
  'contraseña',
  'contraseña123',
])

export function checkPasswordPolicy(
  password: string,
  identity: { email?: string; firstName?: string } = {},
): PasswordPolicyCheck[] {
  const normalized = password.toLowerCase()
  const identityValues = [identity.email, identity.firstName]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase())

  return [
    { code: 'min_length', label: 'Al menos 8 caracteres', satisfied: password.length >= 8 },
    { code: 'missing_uppercase', label: 'Una letra mayúscula', satisfied: /[A-Z]/.test(password) },
    { code: 'missing_lowercase', label: 'Una letra minúscula', satisfied: /[a-z]/.test(password) },
    { code: 'missing_number', label: 'Un número', satisfied: /[0-9]/.test(password) },
    {
      code: 'missing_special_character',
      label: 'Un carácter especial (!@#$...)',
      satisfied: /[^A-Za-z0-9]/.test(password),
    },
    {
      code: 'matches_identity',
      label: 'No puede ser igual a tu correo o nombre',
      satisfied: password.length === 0 || !identityValues.includes(normalized),
    },
    {
      code: 'common_password',
      label: 'No puede ser una contraseña común',
      satisfied: password.length === 0 || !COMMON_PASSWORDS.has(normalized),
    },
  ]
}

export function isPasswordPolicySatisfied(checks: PasswordPolicyCheck[]): boolean {
  return checks.every((check) => check.satisfied)
}