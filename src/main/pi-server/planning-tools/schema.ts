export const schema = {
  string: (description: string) => ({ type: 'string' as const, description }),
  number: (description: string, min: number, max: number) => ({
    type: 'number' as const,
    minimum: min,
    maximum: max,
    description,
  }),
  stringArray: (description: string) => ({
    type: 'array' as const,
    items: { type: 'string' as const },
    description,
  }),
  array: <T>(items: T, min: number, max: number) => ({
    type: 'array' as const,
    items,
    minItems: min,
    maxItems: max,
  }),
};

export const phaseSchema = {
  type: 'object' as const,
  properties: {
    name: schema.string('Phase name'),
    description: schema.string('Phase description'),
    actions: schema.stringArray('Tools and actions to be executed'),
    estimated_risk: schema.number('Estimated risk score (0-100)', 0, 100),
    is_safe: {
      type: 'boolean' as const,
      description: 'Whether this phase is safe (read-only)',
    },
  },
  required: ['name', 'description', 'actions', 'estimated_risk', 'is_safe'],
};
