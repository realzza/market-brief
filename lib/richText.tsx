// Shared inline-text renderers. Used by both TweetCard and TodaysBrief so
// the Analyst Note in the hero matches the in-article summary (markdown
// emphasis honored, $TICKERs clickable).

import type { ReactNode } from 'react';

const TICKER_SPLIT = /(\$[A-Z]{1,6}(?:[-.][A-Z]{1,4})?)/g;
const TICKER_TEST  = /^\$[A-Z]{1,6}(?:[-.][A-Z]{1,4})?$/;

/** Tokenize a string into spans of plain text and <button class="ticker"> nodes. */
export function renderWithTickers(text: string, onTicker: (t: string) => void): ReactNode[] {
  return text.split(TICKER_SPLIT).map((part, i) =>
    TICKER_TEST.test(part) ? (
      <button key={i} className="ticker" onClick={() => onTicker(part.slice(1))}>
        {part}
      </button>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/**
 * Render a Claude-generated summary that may contain **bold** markdown and
 * $TICKER mentions. Bold spans wrap in <strong>; tickers become clickable
 * `.ticker` buttons (same affordance as in tweet body text).
 *
 * Split with a capture group → array alternates [plain, bold, plain, bold, ...].
 */
export function renderRichSummary(text: string, onTicker: (t: string) => void): ReactNode[] {
  return text.split(/\*\*([\s\S]+?)\*\*/g).map((seg, segIdx) => {
    const isBold = segIdx % 2 === 1;
    const inner = seg.split(TICKER_SPLIT).map((tok, tokIdx) =>
      TICKER_TEST.test(tok) ? (
        <button key={tokIdx} className="ticker" onClick={() => onTicker(tok.slice(1))}>
          {tok}
        </button>
      ) : (
        <span key={tokIdx}>{tok}</span>
      )
    );
    return isBold ? <strong key={segIdx}>{inner}</strong> : <span key={segIdx}>{inner}</span>;
  });
}
