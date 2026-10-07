import { validatePasswordChange } from './password-change-validator';

describe('validatePasswordChange', () => {
  const valid = {
    newPassword: 'StrongPassword1!',
    confirmNewPassword: 'StrongPassword1!',
  };

  it('accepts a strong, different password', async () => {
    await expect(
      validatePasswordChange(valid, {}, () => Promise.resolve(false)),
    ).resolves.toBeUndefined();
  });

  it.each([
    [
      { ...valid, confirmNewPassword: 'different' },
      false,
      'PASSWORDS_DO_NOT_MATCH',
    ],
    [valid, true, 'NEW_PASSWORD_SAME_AS_CURRENT'],
    [
      { newPassword: 'weak', confirmNewPassword: 'weak' },
      false,
      'PASSWORD_POLICY_VIOLATION',
    ],
    [
      {
        newPassword: 'A1!' + 'a'.repeat(126),
        confirmNewPassword: 'A1!' + 'a'.repeat(126),
      },
      false,
      'PASSWORD_POLICY_VIOLATION',
    ],
  ] as const)('rejects an invalid change: %s', async (input, same, code) => {
    await expect(
      validatePasswordChange(input, {}, () => Promise.resolve(same)),
    ).rejects.toMatchObject({ response: { code } });
  });
});
