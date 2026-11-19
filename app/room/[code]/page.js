'use client';
import { use } from 'react';
import QueueEditor from '@/components/QueueEditor';

export default function RoomPage({ params }) {
  const { code } = use(params);
  return <QueueEditor code={decodeURIComponent(code).toUpperCase()} />;
}
