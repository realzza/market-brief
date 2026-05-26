export interface DomainConfig {
  color: string;      // tailwind text color
  bg: string;         // tailwind bg + border
  icon: string;       // emoji
}

export const DOMAIN_CONFIG: Record<string, DomainConfig> = {
  'Semiconductors':          { color: 'text-blue-300',   bg: 'bg-blue-500/10 border-blue-500/25',    icon: '🔬' },
  'CPO / Optical Networking':{ color: 'text-cyan-300',   bg: 'bg-cyan-500/10 border-cyan-500/25',    icon: '🔷' },
  'AI / ML':                 { color: 'text-violet-300', bg: 'bg-violet-500/10 border-violet-500/25',icon: '🧠' },
  'Cloud Computing':         { color: 'text-sky-300',    bg: 'bg-sky-500/10 border-sky-500/25',      icon: '☁️' },
  'Energy':                  { color: 'text-amber-300',  bg: 'bg-amber-500/10 border-amber-500/25',  icon: '⚡' },
  'Electricity / Utilities': { color: 'text-yellow-300', bg: 'bg-yellow-500/10 border-yellow-500/25',icon: '🔌' },
  'Electric Vehicles':       { color: 'text-green-300',  bg: 'bg-green-500/10 border-green-500/25',  icon: '🚗' },
  'Defense':                 { color: 'text-red-300',    bg: 'bg-red-500/10 border-red-500/25',      icon: '🛡️' },
  'Biotech / Healthcare':    { color: 'text-pink-300',   bg: 'bg-pink-500/10 border-pink-500/25',    icon: '🧬' },
  'Financials':              { color: 'text-emerald-300',bg: 'bg-emerald-500/10 border-emerald-500/25',icon:'🏦' },
  'Crypto / DeFi':           { color: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-500/25',icon: '₿' },
  'Macro / Fed':             { color: 'text-slate-300',  bg: 'bg-slate-500/10 border-slate-500/25',  icon: '🏛️' },
  'Options Flow':            { color: 'text-purple-300', bg: 'bg-purple-500/10 border-purple-500/25',icon: '📊' },
  'Real Estate':             { color: 'text-lime-300',   bg: 'bg-lime-500/10 border-lime-500/25',    icon: '🏢' },
  'Consumer Tech':           { color: 'text-indigo-300', bg: 'bg-indigo-500/10 border-indigo-500/25',icon: '📱' },
  'Industrials':             { color: 'text-stone-300',  bg: 'bg-stone-500/10 border-stone-500/25',  icon: '🏭' },
  'Commodities':             { color: 'text-yellow-300', bg: 'bg-yellow-500/10 border-yellow-500/25',icon: '🛢️' },
  'Retail / E-Commerce':     { color: 'text-rose-300',   bg: 'bg-rose-500/10 border-rose-500/25',    icon: '🛒' },
  'Telecom':                 { color: 'text-teal-300',   bg: 'bg-teal-500/10 border-teal-500/25',    icon: '📡' },
  'Media / Entertainment':   { color: 'text-fuchsia-300',bg: 'bg-fuchsia-500/10 border-fuchsia-500/25',icon:'🎬'},
};

export const DEFAULT_DOMAIN: DomainConfig = {
  color: 'text-slate-300',
  bg: 'bg-slate-500/10 border-slate-500/25',
  icon: '📌',
};

export function getDomainConfig(domain: string): DomainConfig {
  return DOMAIN_CONFIG[domain] ?? DEFAULT_DOMAIN;
}
