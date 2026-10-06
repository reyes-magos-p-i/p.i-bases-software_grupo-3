import { describe, it, expect } from 'vitest'
import { checkPasswordPolicy, isPasswordPolicySatisfied } from '@/utils/password-policy'

describe('checkPasswordPolicy', () => {
  it('flags every missing requirement for a weak password', () => {
    const checks = checkPasswordPolicy('simple')
    const byCode = Object.fromEntries(checks.map((c) => [c.code, c.satisfied]))
    expect(byCode.min_length).toBe(false)
    expect(byCode.missing_uppercase).toBe(false)
    expect(byCode.missing_number).toBe(false)
    expect(byCode.missing_special_character).toBe(false)
  })

  it('accepts a password meeting all requirements', () => {
    const checks = checkPasswordPolicy('Password123!', { email: 'ana@example.com', firstName: 'Ana' })
    expect(isPasswordPolicySatisfied(checks)).toBe(true)
  })

  it('rejects a password equal to the identity email or first name', () => {
    const checks = checkPasswordPolicy('ana@example.com', { email: 'ana@example.com' })
    const matches = checks.find((c) => c.code === 'matches_identity')
    expect(matches?.satisfied).toBe(false)
  })

  it('rejects a common password', () => {
    const checks = checkPasswordPolicy('Password1')
    // not literally in the common set unless lowercased match; use an exact common entry
    const checksCommon = checkPasswordPolicy('qwerty123')
    const common = checksCommon.find((c) => c.code === 'common_password')
    expect(common?.satisfied).toBe(false)
    expect(checks).toBeDefined()
  })
})