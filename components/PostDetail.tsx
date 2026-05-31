'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { StoredTweet, Analyst } from '@/lib/types';
import TweetCard from '@/components/TweetCard';

// Standalone view for a single post — the target of every digest headline
// ("leads to the original post on our website"). Thin wrapper that reuses the
// feed's TweetCard so the card stays pixel-identical to the dashboard.
export default function PostDetail({ tweet, source }: { tweet: StoredTweet; source?: Analyst }) {
  const router = useRouter();
  return (
    <div className="container" style={{ paddingTop: 28, paddingBottom: 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <Link href="/" className="eyebrow" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
          ← Back to the brief
        </Link>
        <span className="eyebrow text-ink-4">The Market Brief</span>
      </div>
      <div className="feed">
        <TweetCard tweet={tweet} serial={1} source={source} onAnalyzed={() => router.refresh()} />
      </div>
    </div>
  );
}
