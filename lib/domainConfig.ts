export interface DomainConfig {
  color: string;   // Tailwind text color — dark variant for light-theme legibility
  bg: string;      // Tailwind bg + border for badge chips
  icon: string;    // emoji
  hex: string;     // solid hex for bar dot / border accent
  hexBg: string;   // light hex fill for bar track
}

export const DOMAIN_CONFIG: Record<string, DomainConfig> = {
  'Semiconductors':           { color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',     icon: '🔬', hex: '#3b82f6', hexBg: '#eff6ff' },
  'CPO / Optical Networking': { color: 'text-cyan-700',    bg: 'bg-cyan-50 border-cyan-200',      icon: '🔷', hex: '#06b6d4', hexBg: '#ecfeff' },
  'AI / ML':                  { color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200',  icon: '🧠', hex: '#7c3aed', hexBg: '#f5f3ff' },
  'Cloud Computing':          { color: 'text-sky-700',     bg: 'bg-sky-50 border-sky-200',        icon: '☁️', hex: '#0ea5e9', hexBg: '#f0f9ff' },
  'Energy':                   { color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',    icon: '⚡', hex: '#f59e0b', hexBg: '#fffbeb' },
  'Electricity / Utilities':  { color: 'text-yellow-700',  bg: 'bg-yellow-50 border-yellow-200',  icon: '🔌', hex: '#ca8a04', hexBg: '#fefce8' },
  'Electric Vehicles':        { color: 'text-green-700',   bg: 'bg-green-50 border-green-200',    icon: '🚗', hex: '#16a34a', hexBg: '#f0fdf4' },
  'Defense':                  { color: 'text-red-700',     bg: 'bg-red-50 border-red-200',        icon: '🛡️', hex: '#dc2626', hexBg: '#fef2f2' },
  'Biotech / Healthcare':     { color: 'text-pink-700',    bg: 'bg-pink-50 border-pink-200',      icon: '🧬', hex: '#db2777', hexBg: '#fdf2f8' },
  'Financials':               { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200',icon: '🏦', hex: '#059669', hexBg: '#ecfdf5' },
  'Crypto / DeFi':            { color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200',  icon: '₿',  hex: '#ea580c', hexBg: '#fff7ed' },
  'Macro / Fed':              { color: 'text-slate-600',   bg: 'bg-slate-100 border-slate-200',   icon: '🏛️', hex: '#475569', hexBg: '#f1f5f9' },
  'Options Flow':             { color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200',  icon: '📊', hex: '#9333ea', hexBg: '#faf5ff' },
  'Real Estate':              { color: 'text-lime-700',    bg: 'bg-lime-50 border-lime-200',      icon: '🏢', hex: '#65a30d', hexBg: '#f7fee7' },
  'Consumer Tech':            { color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200',  icon: '📱', hex: '#4f46e5', hexBg: '#eef2ff' },
  'Industrials':              { color: 'text-stone-600',   bg: 'bg-stone-100 border-stone-200',   icon: '🏭', hex: '#78716c', hexBg: '#fafaf9' },
  'Commodities':              { color: 'text-yellow-700',  bg: 'bg-yellow-50 border-yellow-200',  icon: '🛢️', hex: '#ca8a04', hexBg: '#fefce8' },
  'Retail / E-Commerce':      { color: 'text-rose-700',    bg: 'bg-rose-50 border-rose-200',      icon: '🛒', hex: '#e11d48', hexBg: '#fff1f2' },
  'Telecom':                  { color: 'text-teal-700',    bg: 'bg-teal-50 border-teal-200',      icon: '📡', hex: '#0d9488', hexBg: '#f0fdfa' },
  'Media / Entertainment':    { color: 'text-fuchsia-700', bg: 'bg-fuchsia-50 border-fuchsia-200',icon: '🎬', hex: '#c026d3', hexBg: '#fdf4ff' },
};

export const DEFAULT_DOMAIN: DomainConfig = {
  color: 'text-slate-600',
  bg: 'bg-slate-100 border-slate-200',
  icon: '📌',
  hex: '#94a3b8',
  hexBg: '#f8fafc',
};

export function getDomainConfig(domain: string): DomainConfig {
  return DOMAIN_CONFIG[domain] ?? DEFAULT_DOMAIN;
}
