'use client';

import { NotificationsBell } from '@/components/admin/notifications-bell';
import { AdminSidebar } from '@/components/admin/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { ChevronDown, LogOut, Menu, User, Wifi, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type OnlineStatus = 'online' | 'ausente' | 'offline';

const STATUS_OPTIONS: { value: OnlineStatus; label: string; color: string; dot: string }[] = [
  { value: 'online', label: 'En línea', color: 'text-green-600', dot: 'bg-green-500' },
  { value: 'ausente', label: 'Ausente', color: 'text-amber-500', dot: 'bg-amber-400' },
  { value: 'offline', label: 'Desconectado', color: 'text-muted-foreground', dot: 'bg-gray-400' },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [status, setStatus] = useState<OnlineStatus>('online');
  const [statusOpen, setStatusOpen] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const { overflow: htmlOverflow, height: htmlHeight } = html.style;
    const { overflow: bodyOverflow, height: bodyHeight } = document.body.style;
    html.style.overflow = 'hidden';
    html.style.height = '100%';
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100%';
    return () => {
      html.style.overflow = htmlOverflow;
      html.style.height = htmlHeight;
      document.body.style.overflow = bodyOverflow;
      document.body.style.height = bodyHeight;
    };
  }, []);

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === status)!;

  const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
    '/perfil': { title: 'Mi perfil — Voz Ciudadana', subtitle: 'Información de tu cuenta' },
    '/admin': {
      title: 'Configuraciones — Voz Ciudadana',
      subtitle: 'Centro de atención ciudadana',
    },
    '/admin/indicadores/atencion': {
      title: 'Indicadores — Atención — Voz Ciudadana',
      subtitle: 'Gestión de whatsapp · Métricas de atención ciudadana y gestión social',
    },
    '/admin/conversaciones': {
      title: 'Bandeja de conversaciones — Voz Ciudadana',
      subtitle: 'Gestión de whatsapp · Seguimiento de reportes y mensajes WhatsApp',
    },
    '/admin/tickets': {
      title: 'Casos — Voz Ciudadana',
      subtitle: 'Gestión de whatsapp · Reportes ciudadanos y seguimiento operativo',
    },
    '/admin/ciudadanos': {
      title: 'Directorio Ciudadano — Voz Ciudadana',
      subtitle: 'Gestión de whatsapp · Personas registradas para atención y participación',
    },
    '/admin/campanas': {
      title: 'Campañas — Voz Ciudadana',
      subtitle: 'Gestión de whatsapp · Campañas y seguimiento operativo',
    },
    '/admin/mensajes-masivos': {
      title: 'Mensajes Masivos — Voz Ciudadana',
      subtitle: 'Gestión de whatsapp · Mensajes masivos y seguimiento operativo',
    },
    '/admin/plantillas': {
      title: 'Plantillas — Voz Ciudadana',
      subtitle: 'Gestión de whatsapp · Plantillas de whatsapp',
    },
    '/admin/indicadores/precampana': {
      title: 'Indicadores — Precampaña — Voz Ciudadana',
      subtitle: 'Gestión de campaña · Métricas y seguimiento de la fase de precampaña',
    },
    '/admin/eventos': {
      title: 'Eventos — Voz Ciudadana',
      subtitle: 'Gestión de campaña · Eventos de la campaña',
    },
    '/admin/catalogo-electoral': {
      title: 'Catálogo electoral — Voz Ciudadana',
      subtitle: 'Gestión de campaña · Catálogo electoral',
    },
    '/admin/estructuras': {
      title: 'Estructuras — Voz Ciudadana',
      subtitle: 'Gestión de campaña · Catálogo de estructuras operativas',
    },
    '/admin/coordinadores': {
      title: 'Coordinadores — Voz Ciudadana',
      subtitle: 'Gestión de campaña · Coordinadores de sección',
    },
    '/admin/lideres': {
      title: 'Líderes — Voz Ciudadana',
      subtitle: 'Gestión de campaña · Líderes territoriales',
    },
    '/admin/promovidos': {
      title: 'Promovidos — Voz Ciudadana',
      subtitle: 'Gestión de campaña · Promovidos de la campaña',
    },
    '/admin/configuracion': {
      title: 'Configuraciones — Voz Ciudadana',
      subtitle: 'Configuraciones de la plataforma',
    },
    '/admin/equipo': {
      title: 'Equipo — Voz Ciudadana',
      subtitle: 'Configuración · Gestión de usuarios y roles',
    },
    '/admin/departamentos': {
      title: 'Departamentos — Voz Ciudadana',
      subtitle: 'Configuraciones · Departamentos para routing automático',
    },
    '/admin/barrios': {
      title: 'Barrios — Voz Ciudadana',
      subtitle: 'Configuraciones · Territorio y barrios sin cambiar la URL existente',
    },
    '/admin/etiquetas': {
      title: 'Etiquetas — Voz Ciudadana',
      subtitle: 'Configuraciones · Etiquetas para clasificación operativa',
    },
    '/admin/ai': {
      title: 'Panel IA — Voz Ciudadana',
      subtitle: 'Configuraciones · Panel de inteligencia artificial',
    },
    '/admin/ai/agents': {
      title: 'Agentes IA — Voz Ciudadana',
      subtitle: 'Configuraciones · Configuración de agentes de inteligencia artificial',
    },
    '/admin/ai/tools': {
      title: 'Herramientas IA — Voz Ciudadana',
      subtitle: 'Configuraciones · Herramientas internas y externas disponibles para los agentes',
    },
    '/admin/ai/topics': {
      title: 'Tópicos IA — Voz Ciudadana',
      subtitle: 'Configuraciones · Tópicos de conversación y asignación de herramientas',
    },
    '/admin/ai/prompts': {
      title: 'Prompts del sistema — Voz Ciudadana',
      subtitle: 'Configuraciones · Prompts dinámicos del sistema con versionado',
    },
    '/admin/ai/lines': {
      title: 'Líneas de comunicación — Voz Ciudadana',
      subtitle: 'Configuraciones · Configuración de canales y asignación de agentes IA',
    },
    '/admin/accesos/roles': {
      title: 'Roles — Voz Ciudadana',
      subtitle: 'Configuración · Administración de roles y permisos',
    },
    '/admin/accesos/permissions': {
      title: 'Permisos — Voz Ciudadana',
      subtitle: 'Configuración · Catálogo de permisos administrativos',
    },
  };

  const page =
    PAGE_TITLES[pathname] ??
    (pathname.startsWith('/admin/accesos/roles/')
      ? {
          title: 'Permisos del rol — Voz Ciudadana',
          subtitle: 'Configuración · Asignación de permisos por rol',
        }
      : pathname.startsWith('/admin/ai/')
        ? PAGE_TITLES['/admin/ai']
        : pathname.startsWith('/admin/ciudadanos/')
          ? {
              title: 'Perfil de ciudadano — Voz Ciudadana',
              subtitle: 'Detalle CRM del ciudadano seleccionado',
            }
          : pathname.startsWith('/admin/tickets/')
            ? {
                title: 'Ticket — Voz Ciudadana',
                subtitle: 'Detalle de caso ciudadano',
              }
            : pathname === '/admin/eventos/new'
              ? {
                  title: 'Nueva jornada — Voz Ciudadana',
                  subtitle: 'Alta de jornada de atención y agenda operativa',
                }
              : pathname.startsWith('/admin/eventos/')
                ? {
                    title: 'Jornada — Voz Ciudadana',
                    subtitle: 'Registros y asistencia ciudadana',
                  }
                : PAGE_TITLES['/admin']);

  // Iniciales para el avatar
  const initials = user?.fullName
    ? user.fullName
        .split(' ')
        .slice(0, 2)
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : 'AD';

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-background">
        {/* Mobile Top Bar */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border bg-card shrink-0">
          {/* Hamburger Menu */}
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <button
                className="p-2 rounded-lg hover:bg-accent transition-colors shrink-0"
                aria-label="Abrir menú"
              >
                <Menu className="w-5 h-5 text-foreground" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex h-full min-h-0 flex-col gap-0 overflow-hidden p-0 w-64 border-0"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Menú de navegación</SheetTitle>
                <SheetDescription>Secciones del panel de administración.</SheetDescription>
              </SheetHeader>
              <AdminSidebar activePath={pathname} onNavigate={() => setSidebarOpen(false)} />
            </SheetContent>
          </Sheet>

          {/* Title - Truncated */}
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">{page.title}</h1>
          </div>

          {/* Mobile: status dot compacto */}
          <div className="relative shrink-0">
            <button
              onClick={() => setStatusOpen((o) => !o)}
              className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-accent transition-colors"
              aria-label="Estado de conexión"
            >
              <span className="relative flex h-2 w-2">
                {status === 'online' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
                )}
                <span
                  className={cn('relative inline-flex rounded-full h-2 w-2', currentStatus.dot)}
                />
              </span>
              <ChevronDown
                className={cn(
                  'w-3 h-3 text-muted-foreground transition-transform',
                  statusOpen && 'rotate-180',
                )}
              />
            </button>
            {statusOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setStatusOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-40 bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-40">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setStatus(opt.value);
                        setStatusOpen(false);
                      }}
                      className={cn(
                        'flex items-center gap-2.5 w-full px-3 py-2.5 text-xs font-medium transition-colors hover:bg-muted',
                        status === opt.value ? opt.color + ' bg-muted/60' : 'text-foreground/70',
                      )}
                    >
                      <span className={cn('w-2 h-2 rounded-full shrink-0', opt.dot)} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Notifications bell */}
          <NotificationsBell />

          {/* User Dropdown - Compact */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-black hover:opacity-90 transition-opacity">
                {initials}
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-52">
              {user && (
                <>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-0.5">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {user.fullName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium mt-0.5">
                        {user.roles.join(', ')}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                </>
              )}

              <DropdownMenuItem className="gap-2 hover:cursor-pointer" asChild>
                <Link href="/perfil">
                  <User className="w-4 h-4" />
                  Mi perfil
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                onClick={logout}
              >
                <LogOut className="w-4 h-4" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile Content */}
        <div className="relative h-0 min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    );
  }

  // Desktop Layout
  return (
    <div className="flex h-dvh max-h-dvh min-h-0 overflow-hidden bg-background">
      <AdminSidebar activePath={pathname} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 h-16 border-b border-border bg-card shrink-0">
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate" title={page.title}>
              {page.title}
            </h1>
            <p className="text-xs text-muted-foreground truncate" title={page.subtitle}>
              {page.subtitle}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Online status selector */}
            <div className="relative">
              <button
                onClick={() => setStatusOpen((o) => !o)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border hover:bg-muted transition-colors text-xs font-medium',
                  currentStatus.color,
                )}
              >
                <span className="relative flex h-2 w-2">
                  {status === 'online' && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
                  )}
                  <span
                    className={cn('relative inline-flex rounded-full h-2 w-2', currentStatus.dot)}
                  />
                </span>
                {currentStatus.label}
                {status === 'online' ? (
                  <Wifi className="w-3.5 h-3.5" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5" />
                )}
                <ChevronDown
                  className={cn('w-3 h-3 transition-transform', statusOpen && 'rotate-180')}
                />
              </button>
              {statusOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setStatusOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-40 bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-40">
                    {STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setStatus(opt.value);
                          setStatusOpen(false);
                        }}
                        className={cn(
                          'flex items-center gap-2.5 w-full px-3 py-2.5 text-xs font-medium transition-colors hover:bg-muted',
                          status === opt.value ? opt.color + ' bg-muted/60' : 'text-foreground/70',
                        )}
                      >
                        <span className={cn('w-2 h-2 rounded-full shrink-0', opt.dot)} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Notifications bell */}
            <NotificationsBell />

            {/* User dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-accent/50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-black">
                    {initials}
                  </div>
                  {user && (
                    <span className="text-xs font-medium text-foreground max-w-30 truncate hidden sm:block">
                      {user.fullName}
                    </span>
                  )}
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-52">
                {user && (
                  <>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-0.5">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {user.fullName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium mt-0.5">
                          {user.roles.join(', ')}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                  </>
                )}

                <DropdownMenuItem className="gap-2 hover:cursor-pointer" asChild>
                  <Link href="/perfil">
                    <User className="w-4 h-4" />
                    Mi perfil
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                  onClick={logout}
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Page content */}
        <div className="relative h-0 min-h-0 flex-1 overflow-hidden">{children}</div>
      </main>
    </div>
  );
}
