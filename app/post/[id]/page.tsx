// Single-post page — the destination for every digest headline. Server-
// rendered straight from sqlite (no HTTP round-trip), mirroring app/page.tsx.
//
// Next 16 passes `params` as a Promise — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md

import { notFound } from 'next/navigation';
import { getTweetWithAnalysis, getTweets } from '@/lib/db';
import { serializeTweetRow } from '@/lib/serialize';
import { getAnalystByKey } from '@/lib/analysts';
import { IS_STATIC } from '@/lib/static';
import PostDetail from '@/components/PostDetail';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Server mode keeps the current behavior: this returns [], so nothing is
// prebuilt and every /post/<id> renders on demand (dynamicParams defaults
// true). The static export prebuilds one HTML page per known post — and
// `output: 'export'` forces dynamicParams false, so unknown ids 404. (Next
// requires dynamicParams to be a static literal, so we can't branch it; the
// default per build mode already gives the behavior we want.)
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  if (!IS_STATIC) return [];
  return getTweets(5000, 0).map((t) => ({ id: String(t.id) }));
}

export default async function PostPage({ params }: PageProps) {
  const { id } = await params;
  const row = getTweetWithAnalysis(id);
  if (!row) notFound();

  const tweet = serializeTweetRow(row);
  const source = getAnalystByKey(tweet.author);

  return <PostDetail tweet={tweet} source={source} />;
}
