export interface DomainConfig {
  hue: number;       // oklch hue for the domain dot
  key: string;       // semantic color key
}

export const DOMAIN_CONFIG: Record<string, DomainConfig> = {
  'AI / ML':                  { hue: 280, key: 'violet'  },
  'Semiconductors':           { hue: 240, key: 'blue'    },
  'CPO / Optical Networking': { hue: 200, key: 'cyan'    },
  'Cloud Computing':          { hue: 215, key: 'sky'     },
  'Energy':                   { hue:  60, key: 'amber'   },
  'Electricity / Utilities':  { hue:  85, key: 'yellow'  },
  'Electric Vehicles':        { hue: 140, key: 'green'   },
  'Defense':                  { hue:  20, key: 'red'     },
  'Biotech / Healthcare':     { hue: 340, key: 'pink'    },
  'Financials':               { hue: 160, key: 'emerald' },
  'Crypto / DeFi':            { hue:  40, key: 'orange'  },
  'Macro / Fed':              { hue:  60, key: 'slate'   },
  'Options Flow':             { hue: 290, key: 'purple'  },
  'Real Estate':              { hue: 120, key: 'lime'    },
  'Consumer Tech':            { hue: 260, key: 'indigo'  },
  'Industrials':              { hue:  50, key: 'stone'   },
  'Commodities':              { hue:  85, key: 'ochre'   },
  'Retail / E-Commerce':      { hue:  10, key: 'rose'    },
  'Telecom':                  { hue: 180, key: 'teal'    },
  'Media / Entertainment':    { hue: 320, key: 'fuchsia' },
};

export const DEFAULT_DOMAIN: DomainConfig = { hue: 60, key: 'slate' };

export function getDomainConfig(domain: string): DomainConfig {
  return DOMAIN_CONFIG[domain] ?? DEFAULT_DOMAIN;
}

export function domainColor(name: string): string {
  const cfg = DOMAIN_CONFIG[name];
  if (!cfg) return 'var(--ink-3)';
  return `oklch(0.55 0.10 ${cfg.hue})`;
}

export function domainColorSoft(name: string): string {
  const cfg = DOMAIN_CONFIG[name];
  if (!cfg) return 'var(--neutral-soft)';
  return `oklch(0.94 0.04 ${cfg.hue})`;
}
