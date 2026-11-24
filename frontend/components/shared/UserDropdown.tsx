'use client';

/**
 * UserDropdown — Dropdown del usuario autenticado
 *
 * Muestra avatar con iniciales, nombre/email del usuario y botón de logout.
 * Usa Radix DropdownMenu (ya en el proyecto).
 */

import { useAuth } from '@/hooks/shared/useAuth';
import { cn } from '@/lib/shared/utils';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, LogOut, User } from 'lucide-react';
import { useRouter } from 'next/navigation';

function getInitials(fullName: string): string {
  return fullName
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  COORDINADOR: 'Coordinador',
  CAPTURISTA: 'Capturista',
  OPERADOR_CHAT: 'Operador Chat',
  LIDER: 'Líder',
};

export function UserDropdown() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (!user) {
    return (
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
        <User className="w-4 h-4 text-muted-foreground" />
      </div>
    );
  }

  const initials = getInitials(user.fullName);
  const primaryRole = user.roles[0];
  const roleLabel = primaryRole ? (ROLE_LABELS[primaryRole] ?? primaryRole) : undefined;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 rounded-xl px-2 py-1',
            'hover:bg-accent transition-colors outline-none',
            'focus-visible:ring-2 focus-visible:ring-primary/40',
          )}
          aria-label="Menú de usuario"
        >
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-black select-none">
            {initials}
          </div>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={cn(
            'z-50 min-w-48 rounded-xl border border-border bg-card p-1 shadow-md',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          {/* Info usuario */}
          <div className="px-3 py-2 border-b border-border mb-1">
            <p className="text-sm font-semibold text-foreground truncate max-w-44">
              {user.fullName}
            </p>
            <p className="text-xs text-muted-foreground truncate max-w-44">{user.email}</p>
            {roleLabel && (
              <span className="mt-1 inline-block text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 rounded px-1.5 py-0.5">
                {roleLabel}
              </span>
            )}
          </div>

          {/* Logout */}
          <DropdownMenu.Item
            onSelect={handleLogout}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer outline-none',
              'text-destructive hover:bg-destructive/10 transition-colors',
              'focus:bg-destructive/10',
            )}
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
