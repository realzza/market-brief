// Tiny hand-rolled validator. We could pull in zod, but the API surface is
// small (three POST routes) and the validation rules are simple — a
// dependency for ~60 lines of code didn't feel worth it.
//
// Each validator returns either { ok: true, value } with a fully typed,
// normalized payload, or { ok: false, error } with a 400-friendly message
// describing the first thing that's wrong.

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function fail(msg: string): { ok: false; error: string } {
  return { ok: false, error: msg };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isNonEmptyString(v: unknown, max = 4000): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

// ─── POST /api/analyze ───────────────────────────────────────────────────────
// Two shapes: a batch run ({ limit }) and a single tweet ({ tweet_id, ... }).
export interface AnalyzePayload {
  limit: number;
  tweet_id?: string;
  user_question?: string;
}

export function validateAnalyzeBody(body: unknown): ValidationResult<AnalyzePayload> {
  if (body !== undefined && !isRecord(body)) return fail('body must be a JSON object');
  const obj = (body ?? {}) as Record<string, unknown>;

  // limit defaults to 10, clamped to [1, 50] so a stray "limit: 100000" can't
  // chew through the Claude budget unattended.
  let limit = 10;
  if (obj.limit !== undefined) {
    if (!isFiniteNumber(obj.limit)) return fail('limit must be a number');
    limit = Math.floor(obj.limit);
    if (limit < 1 || limit > 50) return fail('limit must be between 1 and 50');
  }

  let tweet_id: string | undefined;
  if (obj.tweet_id !== undefined) {
    if (typeof obj.tweet_id !== 'string') return fail('tweet_id must be a string');
    // Tweet IDs are numeric strings from the syndication API.
    if (!/^\d{1,32}$/.test(obj.tweet_id)) return fail('tweet_id must be a numeric id');
    tweet_id = obj.tweet_id;
  }

  let user_question: string | undefined;
  if (obj.user_question !== undefined && obj.user_question !== null && obj.user_question !== '') {
    if (typeof obj.user_question !== 'string') return fail('user_question must be a string');
    const trimmed = obj.user_question.trim();
    if (trimmed.length > 2000) return fail('user_question must be 2000 chars or fewer');
    if (trimmed.length > 0) user_question = trimmed;
  }

  return { ok: true, value: { limit, tweet_id, user_question } };
}

// ─── POST /api/performance ───────────────────────────────────────────────────
// Manually-logged trade outcomes for the performance dashboard. Previously
// the route spread the entire JSON body into upsertPerformance() with no
// schema check — anyone reachable could write arbitrary rows.
const DIRECTIONS = new Set(['long', 'short']);
const OUTCOMES   = new Set(['win', 'loss', 'breakeven', 'pending']);

export interface PerformancePayload {
  tweet_id: string;
  asset: string;
  direction: 'long' | 'short';
  entry_price?: number;
  target_price?: number;
  stop_loss_price?: number;
  signal_date: string;
  outcome?: 'win' | 'loss' | 'breakeven' | 'pending';
  actual_return_pct?: number;
  notes?: string;
}

export function validatePerformanceBody(body: unknown): ValidationResult<PerformancePayload> {
  if (!isRecord(body)) return fail('body must be a JSON object');
  // Captured const so the nested optNum() closure keeps the narrowed type;
  // TypeScript loses the narrowing on the parameter inside the inner fn.
  const obj: Record<string, unknown> = body;

  if (!isNonEmptyString(obj.tweet_id, 64)) return fail('tweet_id is required');
  if (!/^\d{1,32}$/.test(obj.tweet_id)) return fail('tweet_id must be a numeric id');

  if (!isNonEmptyString(obj.asset, 32)) return fail('asset is required');

  if (typeof obj.direction !== 'string' || !DIRECTIONS.has(obj.direction)) {
    return fail('direction must be "long" or "short"');
  }

  if (!isNonEmptyString(obj.signal_date, 64)) return fail('signal_date is required');
  if (Number.isNaN(Date.parse(obj.signal_date))) {
    return fail('signal_date must be a parseable date string');
  }

  // Optional numeric fields — accept null/undefined, reject NaN/strings.
  function optNum(field: string): ValidationResult<number | undefined> {
    const v = obj[field];
    if (v === undefined || v === null) return { ok: true, value: undefined };
    if (!isFiniteNumber(v)) return fail(`${field} must be a finite number`);
    return { ok: true, value: v };
  }
  const entry  = optNum('entry_price');       if (!entry.ok)  return entry;
  const target = optNum('target_price');      if (!target.ok) return target;
  const stop   = optNum('stop_loss_price');   if (!stop.ok)   return stop;
  const ret    = optNum('actual_return_pct'); if (!ret.ok)    return ret;

  let outcome: PerformancePayload['outcome'];
  if (obj.outcome !== undefined && obj.outcome !== null) {
    if (typeof obj.outcome !== 'string' || !OUTCOMES.has(obj.outcome)) {
      return fail('outcome must be one of win | loss | breakeven | pending');
    }
    outcome = obj.outcome as PerformancePayload['outcome'];
  }

  let notes: string | undefined;
  if (obj.notes !== undefined && obj.notes !== null && obj.notes !== '') {
    if (typeof obj.notes !== 'string' || obj.notes.length > 2000) {
      return fail('notes must be a string of 2000 chars or fewer');
    }
    notes = obj.notes;
  }

  return {
    ok: true,
    value: {
      tweet_id: obj.tweet_id,
      asset: obj.asset,
      direction: obj.direction as 'long' | 'short',
      entry_price: entry.value,
      target_price: target.value,
      stop_loss_price: stop.value,
      signal_date: obj.signal_date,
      outcome,
      actual_return_pct: ret.value,
      notes,
    },
  };
}
