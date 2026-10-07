export const PROJECTION_MESSAGES = {
  unavailable: 'La sala/película seleccionada ya no está disponible.',
  scheduleConflict: 'La sala ya tiene una proyección asignada en ese horario',
  pastSchedule: 'La fecha y hora de la proyección no puede estar en el pasado.',
  invalidPrice: 'El precio debe ser un número positivo en colones.',
  invalidRange: 'La fecha final no puede ser anterior a la fecha inicial.',
} as const;
