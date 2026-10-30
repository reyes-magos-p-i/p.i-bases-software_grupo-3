import { describe, expect, it } from 'vitest'
import {
  BRANCH_MESSAGES,
  branchErrorsFromApi,
  normalizeBranchName,
  validateBranchForm,
} from '@/utils/branch-validation'

describe('branch form validation', () => {
  it.each([
    ['A'],
    ['Sucursal Gran Centro Comercial Heredia Norte Oeste'],
    ['Sucursal Peñas Blancas San Ramón'],
    ['Sucursal Ñandayure Pérez Zeledón'],
  ])('accepts the name %p', (name) => {
    expect(validateBranchForm(name, 21)).toEqual({})
  })

  it.each([[''], ['   ']])('treats %p as an empty name (UT-002, UT-003)', (name) => {
    expect(validateBranchForm(name, 21)).toEqual({ name: BRANCH_MESSAGES.nameRequired })
  })

  it.each([['Sucursal 01'], ['Heredia@Centro#'], ['Sucursal-Norte.'], ['Heredia_Centro*']])(
    'only accepts letters and spaces in %p (UT-004 to UT-006)',
    (name) => {
      expect(validateBranchForm(name, 21)).toEqual({ name: BRANCH_MESSAGES.nameLetters })
    },
  )

  it('rejects 51 characters (UT-009)', () => {
    expect(
      validateBranchForm('Sucursal Gran Centro Comercial Heredia Norte Oestes', 21),
    ).toEqual({ name: BRANCH_MESSAGES.nameLength })
  })

  it('reports both fields at once (UT-012, UT-013)', () => {
    expect(validateBranchForm('Sucursal Cartago', '')).toEqual({
      companyId: 'Debe seleccionar una compañía',
    })
    expect(validateBranchForm('', '')).toEqual({
      name: 'El nombre es obligatorio',
      companyId: 'Debe seleccionar una compañía',
    })
  })

  it('trims the name and joins accents written as separate marks', () => {
    expect(normalizeBranchName('  San Rámon ')).toBe('San Rámon')
    expect(validateBranchForm('Pérez', 21)).toEqual({})
  })

  it('places API messages under their fields and ignores unknown ones', () => {
    expect(
      branchErrorsFromApi([BRANCH_MESSAGES.nameLetters, BRANCH_MESSAGES.companyRequired]),
    ).toEqual({ name: BRANCH_MESSAGES.nameLetters, companyId: BRANCH_MESSAGES.companyRequired })
    expect(branchErrorsFromApi(BRANCH_MESSAGES.companyRequired)).toEqual({
      companyId: BRANCH_MESSAGES.companyRequired,
    })
    expect(branchErrorsFromApi(BRANCH_MESSAGES.nameTaken)).toEqual({
      name: BRANCH_MESSAGES.nameTaken,
    })
    expect(branchErrorsFromApi(['property id should not exist'])).toEqual({})
    expect(branchErrorsFromApi(undefined)).toEqual({})
  })
})
