// Single-post page — the destination for every digest headline. Server-
// rendered straight from sqlite (no HTTP round-trip), mirroring app/page.tsx.
//
// Next 16 passes `params` as a Promise — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md

import { notFound } from 'next/navigation';
import { getTweetWithAnalysis } from '@/lib/db';
import { serializeTweetRow } from '@/lib/serialize';
import { getAnalystByKey } from '@/lib/analysts';
import PostDetail from '@/components/PostDetail';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PostPage({ params }: PageProps) {
  const { id } = await params;
  const row = getTweetWithAnalysis(id);
  if (!row) notFound();

  const tweet = serializeTweetRow(row);
  const source = getAnalystByKey(tweet.author);

  return <PostDetail tweet={tweet} source={source} />;
}
