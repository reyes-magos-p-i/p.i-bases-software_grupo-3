export const TICKET_CATEGORIES = ['GENERAL', 'CHILD', 'SENIOR'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export const PROJECTION_FORMATS = ['2D', '3D'] as const;
export const PROJECTION_TECHNOLOGIES = ['STANDARD', 'IMAX', '70MM'] as const;
export interface PricingSettings {
  format: (typeof PROJECTION_FORMATS)[number];
  technology: (typeof PROJECTION_TECHNOLOGIES)[number];
  isPremiere: boolean;
}
export const TICKET_POLICY = {
  categories: [
    {
      code: 'GENERAL',
      label: 'General',
      description: 'Tarifa general',
      base: 3000,
    },
    { code: 'CHILD', label: 'Niño', description: 'De 2 a 12 años', base: 2500 },
    {
      code: 'SENIOR',
      label: 'Adulto mayor',
      description: 'Desde 65 años',
      base: 2500,
    },
  ],
  surcharges: {
    vip: 1000,
    threeD: 500,
    IMAX: 1000,
    '70MM': 500,
    premiere: 500,
  },
} as const;
export function pricingSettings(
  input?: Partial<PricingSettings>,
): PricingSettings {
  const settings = {
    format: input?.format ?? '2D',
    technology: input?.technology ?? 'STANDARD',
    isPremiere: input?.isPremiere ?? false,
  };
  if (
    !PROJECTION_FORMATS.includes(settings.format) ||
    !PROJECTION_TECHNOLOGIES.includes(settings.technology) ||
    typeof settings.isPremiere !== 'boolean'
  )
    throw new RangeError('Selecciona un formato y una tecnología válidos.');
  if (settings.technology === '70MM' && settings.format === '3D')
    throw new RangeError('Las funciones de 70 mm deben ser 2D.');
  return settings;
}
export function ticketPrice(
  input: Partial<PricingSettings>,
  category: TicketCategory = 'GENERAL',
  vip = false,
) {
  const settings = pricingSettings(input);
  const definition = TICKET_POLICY.categories.find(
    (item) => item.code === category,
  );
  if (!definition)
    throw new RangeError('Selecciona una categoría de boleto válida.');
  const modifiers: { label: string; amount: number }[] = [];
  if (vip)
    modifiers.push({
      label: 'Asiento VIP',
      amount: TICKET_POLICY.surcharges.vip,
    });
  if (settings.format === '3D')
    modifiers.push({
      label: 'Formato 3D',
      amount: TICKET_POLICY.surcharges.threeD,
    });
  if (settings.technology !== 'STANDARD')
    modifiers.push({
      label:
        settings.technology === '70MM' ? 'Tecnología 70 mm' : 'Tecnología IMAX',
      amount: TICKET_POLICY.surcharges[settings.technology],
    });
  if (settings.isPremiere)
    modifiers.push({
      label: 'Estreno',
      amount: TICKET_POLICY.surcharges.premiere,
    });
  return {
    base: definition.base,
    modifiers,
    unitPrice:
      definition.base +
      modifiers.reduce((total, item) => total + item.amount, 0),
  };
}
export function ticketProductCode(category: TicketCategory, vip: boolean) {
  return `TICKET_${category}_${vip ? 'VIP' : 'STANDARD'}`;
}
