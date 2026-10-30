// Rules and messages of the branch form (SCRUM-32/33). The API applies the same ones.
export const BRANCH_NAME_MAX_LENGTH = 50

export const BRANCH_MESSAGES = {
  nameRequired: 'El nombre es obligatorio',
  nameLetters: 'El nombre solo puede contener letras y espacios',
  nameLength: 'El nombre debe tener entre 1 y 50 caracteres',
  companyRequired: 'Debe seleccionar una compañía',
  // Only the API knows the other branches, so this one comes in a 409 answer.
  nameTaken: 'Ya existe una sucursal activa con ese nombre',
} as const

export interface BranchFormErrors {
  name?: string
  companyId?: string
}

/** Trimmed name with accents joined, as the API stores it. */
export function normalizeBranchName(name: string): string {
  return name.normalize('NFC').trim()
}

export function validateBranchForm(name: string, companyId: number | ''): BranchFormErrors {
  const errors: BranchFormErrors = {}
  const value = normalizeBranchName(name)
  if (!value) errors.name = BRANCH_MESSAGES.nameRequired
  else if (!/^[\p{L}\p{M} ]+$/u.test(value)) errors.name = BRANCH_MESSAGES.nameLetters
  else if (value.length > BRANCH_NAME_MAX_LENGTH) errors.name = BRANCH_MESSAGES.nameLength
  if (companyId === '') errors.companyId = BRANCH_MESSAGES.companyRequired
  return errors
}

/** Places the validation messages of a 400 or 409 answer under their fields. */
export function branchErrorsFromApi(message: unknown): BranchFormErrors {
  const messages = Array.isArray(message) ? message : [message]
  const errors: BranchFormErrors = {}
  for (const text of messages) {
    if (text === BRANCH_MESSAGES.companyRequired) errors.companyId = text
    else if (
      text === BRANCH_MESSAGES.nameRequired ||
      text === BRANCH_MESSAGES.nameLetters ||
      text === BRANCH_MESSAGES.nameLength ||
      text === BRANCH_MESSAGES.nameTaken
    )
      errors.name ??= text
  }
  return errors
}
