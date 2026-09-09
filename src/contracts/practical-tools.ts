/** Explicit choices, never inferred from an arbitrary learning topic. */
export const PRACTICAL_TOOLS = [
  {
    id: 'desmos-graphing',
    label: 'Desmos Graphing Calculator',
    url: 'https://www.desmos.com/calculator',
  },
  {
    id: 'geogebra-graphing',
    label: 'GeoGebra Graphing Calculator',
    url: 'https://www.geogebra.org/graphing',
  },
] as const;

export type PracticalToolId = (typeof PRACTICAL_TOOLS)[number]['id'];
