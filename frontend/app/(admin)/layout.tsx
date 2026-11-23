import { AdminLayout } from '@/components/admin/admin-layout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { RealtimeNotificationsLayer } from '@/components/providers/realtime-notifications-layer';
import { RealtimeProvider } from '@/components/providers/realtime-provider';
import { createPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  ...createPageMetadata({
    title: 'Panel administrativo',
    description:
      'Panel interno de gestión social y atención ciudadana — Voz Ciudadana, Cintalapa de Figueroa.',
    path: '/admin',
    openGraphTitle: 'Voz Ciudadana — Panel de gestión social',
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
