'use client';

import { ThemeProvider } from '@/components/shared/theme-provider';
import { CustomToaster } from '@/components/ui/toaster-custom';
import { AuthProvider } from '@/hooks/shared/useAuth';

interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <AuthProvider>
        {children}
        <CustomToaster />
      </AuthProvider>
    </ThemeProvider>
  );
}
