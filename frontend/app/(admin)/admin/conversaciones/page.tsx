import { InboxView } from '@/components/admin/inbox-view';
import { Suspense } from 'react';

export default function AdminInboxPage() {
  return (
    <div className="h-full min-h-0 min-w-0 overflow-hidden">
      <Suspense fallback={<div className="h-full bg-background" />}>
        <InboxView />
      </Suspense>
    </div>
  );
}
