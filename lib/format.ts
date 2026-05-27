import { StoredTweet } from './types';

export function fmtCompact(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

export function fmtPrice(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtSigned(n: number | null | undefined, digits = 3): string {
  if (n == null) return '—';
  const s = n >= 0 ? '+' : '−';
  return s + Math.abs(n).toFixed(digits);
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null) return '—';
  const s = n >= 0 ? '+' : '−';
  return s + Math.abs(n).toFixed(digits) + '%';
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function sentimentLabel(score: number): string {
  if (score > 0.55) return 'Very Bullish';
  if (score > 0.15) return 'Bullish';
  if (score < -0.55) return 'Very Bearish';
  if (score < -0.15) return 'Bearish';
  return 'Neutral';
}

function capitalize(s: string | undefined): string {
  if (!s) return '';
  return s[0].toUpperCase() + s.slice(1);
}

export function headlineFromTweet(t: StoredTweet): string {
  const a = t.analysis;
  if (!a) return 'Untitled note';
  const theme = a.key_themes?.[0];
  const ticker = a.tickers?.[0]?.ticker;
  if (a.sentiment === 'bullish' && ticker)
    return `${capitalize(theme || 'Bullish setup')} — $${ticker} lifts the thesis`;
  if (a.sentiment === 'bearish' && ticker)
    return `${capitalize(theme || 'Risk')} — exiting $${ticker} as case breaks`;
  if (theme) return capitalize(theme);
  return a.summary.split('.')[0];
}
