'use client';

import { useLayoutEffect, useRef } from 'react';
import type { Analyst } from '@/lib/types';

interface Props {
  analysts: Analyst[];
  dateStr: string;
  edition: number;
  fetching: boolean;
  digesting: boolean;
  loading: boolean;
  onFetch: () => void;
  onDigest: () => void;
  onRefresh: () => void;
  statusMsg: string;
  statusType: 'info' | 'error' | 'success';
  // Which action raised the status, so the pill anchors under its button.
  statusSource: 'fetch' | 'digest' | null;
  theme: string;
  onToggleTheme: () => void;
}

function Icon({ name, size = 14 }: { name: string; size?: number }) {
  const props = {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.4,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'refresh':  return <svg {...props}><path d="M14 4v4h-4M2 12V8h4M3.5 6.5A5 5 0 0 1 13 7M12.5 9.5A5 5 0 0 1 3 9"/></svg>;
    case 'download': return <svg {...props}><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M3 13h10"/></svg>;
    case 'zap':      return <svg {...props}><path d="M9 1L2 9h5l-1 6 7-8h-5l1-6z"/></svg>;
    case 'close':    return <svg {...props}><path d="M3 3l10 10M13 3L3 13"/></svg>;
    case 'brief':    return <svg {...props}><path d="M2 3h8v10H3a1 1 0 0 1-1-1zM10 6h4v6a1 1 0 0 1-1 1h-3zM4 6h4M4 8.5h4M4 11h2"/></svg>;
    case 'sun':      return <svg {...props}><circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.8 2.8l1 1M12.2 12.2l1 1M2.8 13.2l1-1M12.2 3.8l1-1"/></svg>;
    case 'moon':     return <svg {...props}><path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5 5.5 5.5 0 1 0 13.5 9.5z"/></svg>;
    default: return null;
  }
}

export default function Masthead({
  analysts,
  dateStr, edition,
  fetching, digesting,
  loading, onFetch, onDigest, onRefresh,
  statusMsg, statusType, statusSource,
  theme, onToggleTheme,
}: Props) {
  const pillCls = statusType === 'error' ? 'is-error' : statusType === 'success' ? 'is-success' : '';

  // Anchor the status pill under the button that raised it. The pill is
  // absolutely positioned inside .masthead-buttons (its offset parent), so we
  // set its left to the source button's offsetLeft after layout.
  const pillRef = useRef<HTMLSpanElement>(null);
  const fetchRef = useRef<HTMLButtonElement>(null);
  const briefRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const pill = pillRef.current;
    if (!pill || !statusMsg) return;
    const target = statusSource === 'digest' ? briefRef.current : statusSource === 'fetch' ? fetchRef.current : null;
    pill.style.left = target ? `${target.offsetLeft}px` : '0px';
  }, [statusMsg, statusSource]);

  // Byline lists every tracked handle, capped so a long roster doesn't blow
  // out the centered wordmark. Beyond the cap we collapse to a "+N more".
  const MAX_HANDLES = 3;
  const handles = analysts.map(
    (a) => `@${a.platforms.x ?? a.platforms.truthsocial ?? a.id}`,
  );
  const shownHandles = handles.slice(0, MAX_HANDLES);
  const overflow = handles.length - shownHandles.length;
  const byline =
    handles.length === 0
      ? 'Daily intelligence'
      : `${shownHandles.join(' · ')}${overflow > 0 ? ` · +${overflow} more` : ''} · Daily intelligence`;

  return (
    <header className="masthead">
      <div className="container">
        <div className="masthead-inner">

          {/* Left — edition meta */}
          <div className="masthead-meta">
            <span className="eyebrow">Edition №{edition}</span>
            <span><strong>{dateStr}</strong></span>
          </div>

          {/* Center — wordmark */}
          <div>
            <h1 className="masthead-title">
              The Market <em>Brief</em>
            </h1>
            <div className="masthead-rule" />
            <div className="masthead-rule-thin" />
            <div className="masthead-byline">
              <span>{byline}</span>
              <span>Analyzed by Claude · {dateStr.split(',')[0]}</span>
            </div>
          </div>

          {/* Right — actions */}
          <div className="masthead-actions">
            <div className="masthead-buttons">
              {statusMsg && (
                <span ref={pillRef} className={`status-pill ${pillCls}`}>{statusMsg}</span>
              )}

              <button
                ref={fetchRef}
                className="btn"
                onClick={onFetch}
                disabled={fetching}
              >
                <Icon name="download" size={13} />
                {fetching ? 'Fetching…' : 'Fetch'}
              </button>

              <button
                ref={briefRef}
                className="btn btn-primary"
                onClick={onDigest}
                disabled={digesting}
                title="Compile the Morning Wire digest from posts tracked since the last brief"
              >
                <Icon name="brief" size={13} />
                {digesting ? 'Compiling…' : 'Brief'}
              </button>

              <button className="btn btn-icon" onClick={onRefresh} title="Refresh" disabled={loading}>
                <Icon name="refresh" size={13} />
              </button>

              <button className="btn btn-icon" onClick={onToggleTheme} title="Toggle theme">
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
