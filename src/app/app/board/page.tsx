import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BoardView } from '@/components/board/BoardView';
import { workspaceToday } from '@/lib/server/today';

export const metadata: Metadata = { title: 'Board' };

export default async function BoardPage() {
  const { today } = await workspaceToday();
  return (
    <Suspense>
      <BoardView today={today} />
    </Suspense>
  );
}
