import { AdminLayout } from '@/components/shared/admin-layout';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { RealtimeNotificationsLayer } from '@/components/shared/providers/realtime-notifications-layer';
import { RealtimeProvider } from '@/components/shared/providers/realtime-provider';
import { createPageMetadata } from '@/lib/shared/seo';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  ...createPageMetadata({
    title: 'Panel administrativo',
    description: 'Panel interno de Nexo Comercial.',
    path: '/admin',
    openGraphTitle: 'Nexo Comercial — Panel',
  }),
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function AdminLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <RealtimeProvider>
        <AdminLayout>{children}</AdminLayout>
        <RealtimeNotificationsLayer />
      </RealtimeProvider>
    </ProtectedRoute>
  );
}
