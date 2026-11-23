'use client';

import { BrandLogo } from '@/components/brand/brand-logo';
import { usePermissions } from '@/hooks/usePermissions';
import type { Permission } from '@/lib/auth-guards';
import type { UserRole } from '@/lib/auth-storage';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  Bot,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  Flag,
  KeyRound,
  MapPin,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  NotepadTextDashed,
  Settings,
  ShieldUserIcon,
  Tag,
  Tickets,
  TrendingUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type NavIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

type NavChild = {
  icon: NavIcon;
  label: string;
  href: string;
  children?: NavChild[];
  requiredPermissions?: Permission[];
  requiredRoles?: UserRole[];
};
type NavItem = {
  icon: NavIcon;
  label: string;
  href?: string;
  badge?: number;
  children?: NavChild[];
  requiredPermissions?: Permission[];
  requiredRoles?: UserRole[];
};

const NAV_ITEMS: NavItem[] = [
  {
    icon: Bell,
    label: 'GESTIÓN DE WHATSAPP',
    children: [
      {
        icon: TrendingUp,
        label: 'Indicadores de Atencion',
        href: '/admin/indicadores/atencion',
        requiredPermissions: ['indicadores_atencion.view'],
      },
      {
        icon: MessageSquare,
        label: 'Bandeja de entrada',
        href: '/admin/conversaciones',
        requiredPermissions: ['conversaciones.view'],
      },
      {
        icon: Tickets,
        label: 'Tickets',
        href: '/admin/tickets',
        requiredPermissions: ['tickets.view'],
      },
      {
        icon: Users,
        label: 'Ciudadanos',
        href: '/admin/ciudadanos',
        requiredPermissions: ['ciudadanos.view'],
      },
      {
        icon: Megaphone,
        label: 'Crear Campana',
        href: '/admin/campanas',
        requiredPermissions: ['campanas_whatsapp.view'],
      },
      {
        icon: MessagesSquare,
        label: 'Mensajes Masivos',
        href: '/admin/mensajes-masivos',
        requiredPermissions: ['mensajes_masivos.view'],
      },
      {
        icon: NotepadTextDashed,
        label: 'Plantillas',
        href: '/admin/plantillas',
        requiredPermissions: ['plantillas.view'],
      },
    ],
  },
  {
    icon: Flag,
    label: 'GESTIÓN DE CAMPAÑA',
    children: [
      {
        icon: CalendarDays,
        label: 'Jornadas y Eventos',
        href: '/admin/eventos',
        requiredPermissions: ['eventos.view'],
      },
    ],
  },
  {
    icon: Settings,
    label: 'CONFIGURACIÓN DE PLATAFORMA',
    children: [
      {
        icon: Settings,
        label: 'Configuración',
        href: '/admin/configuracion',
        requiredPermissions: ['configuracion.view'],
        children: [
          {
            icon: Users,
            label: 'Equipo',
            href: '/admin/equipo',
            requiredPermissions: ['users.view'],
          },
          {
            icon: Building2,
            label: 'Departamentos',
            href: '/admin/departamentos',
            requiredPermissions: ['departamentos.view'],
          },
          {
            icon: MapPin,
            label: 'Territorio',
            href: '/admin/barrios',
            requiredPermissions: ['barrios.view'],
          },
          {
            icon: Tag,
            label: 'Etiquetas',
            href: '/admin/etiquetas',
            requiredPermissions: ['etiquetas.view'],
          },
          {
            icon: Bot,
            label: 'Canales e IA',
            href: '/admin/ai',
            requiredPermissions: ['ai.view'],
          },
          {
            icon: ShieldUserIcon,
            label: 'Roles',
            href: '/admin/accesos/roles',
            requiredPermissions: ['roles.view', 'permissions.view'],
          },
          {
            icon: KeyRound,
            label: 'Permisos',
            href: '/admin/accesos/permissions',
            requiredPermissions: ['permissions.view'],
          },
        ],
      },
    ],
  },
];

const DOUBLE_CLICK_DELAY_MS = 250;

function isPathActive(href: string, activePath?: string) {
  return activePath === href || (href !== '/admin' && !!activePath?.startsWith(href + '/'));
}

function hasActiveDescendant(child: NavChild, activePath?: string): boolean {
  if (isPathActive(child.href, activePath)) return true;
  return !!child.children?.some((nested) => hasActiveDescendant(nested, activePath));
}

interface SidebarProps {
  activePath?: string;
  onNavigate?: () => void;
}

export function AdminSidebar({ activePath, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [openSubgroups, setOpenSubgroups] = useState<Record<string, boolean>>({});
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const { can, roles } = usePermissions();

  useEffect(
    () => () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    },
    [],
  );

  const canShowChild = (child: NavChild): boolean =>
    (!child.requiredPermissions ||
      child.requiredPermissions.some((permission) => can(permission))) &&
    (!child.requiredRoles || child.requiredRoles.some((role) => roles.includes(role)));

  const filterChild = (child: NavChild): NavChild =>
    child.children
      ? { ...child, children: child.children.filter(canShowChild).map(filterChild) }
      : child;

  const canShowItem = (item: NavItem) =>
    (!item.requiredPermissions || item.requiredPermissions.some((permission) => can(permission))) &&
    (!item.requiredRoles || item.requiredRoles.some((role) => roles.includes(role)));

  const visibleNavItems = NAV_ITEMS.filter(canShowItem)
    .map((item) =>
      item.children
        ? { ...item, children: item.children.filter(canShowChild).map(filterChild) }
        : item,
    )
    .filter((item) => !item.children || item.children.length > 0);

  const isSubgroupOpen = (child: NavChild) => openSubgroups[child.href] ?? false;

  const toggleSubgroup = (child: NavChild) =>
    setOpenSubgroups((prev) => ({ ...prev, [child.href]: !isSubgroupOpen(child) }));

  /** Un click alterna el subgrupo; un doble-click navega a su propia página. */
  const handleSubgroupClick = (child: NavChild) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      onNavigate?.();
      router.push(child.href);
      return;
    }
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      toggleSubgroup(child);
    }, DOUBLE_CLICK_DELAY_MS);
  };

  const handleNavigation = () => {
    onNavigate?.();
  };

  const renderChild = (child: NavChild) => {
    const ChildIcon = child.icon;
    const isChildActive = isPathActive(child.href, activePath);

    if (child.children?.length) {
      const isOpen = isSubgroupOpen(child);
      const hasActiveNested = child.children.some((nested) =>
        hasActiveDescendant(nested, activePath),
      );

      return (
        <div key={child.href}>
          <button
            type="button"
            onClick={() => handleSubgroupClick(child)}
            title="Click para desplegar · doble click para abrir la página"
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-sm w-full text-left',
              isChildActive || hasActiveNested
                ? 'bg-sidebar-accent text-sidebar-foreground font-semibold'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )}
          >
            <ChildIcon className="w-5 h-5 shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -5 }}
                  transition={{ duration: 0.15 }}
                  className="whitespace-nowrap flex-1"
                >
                  {child.label}
                </motion.span>
              )}
            </AnimatePresence>
            {!collapsed && (
              <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown className="w-4 h-4 opacity-50" />
              </motion.div>
            )}
          </button>

          <AnimatePresence initial={false}>
            {isOpen && !collapsed && (
              <motion.div
                key="nested"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="mt-1 ml-4 pl-3 border-l-2 border-sidebar-border space-y-1 pb-1">
                  {child.children.map(renderChild)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    return (
      <Link
        key={child.href}
        href={child.href}
        onClick={handleNavigation}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-sm',
          isChildActive
            ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-sm'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )}
      >
        <ChildIcon className="w-5 h-5 shrink-0" />
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -5 }}
              transition={{ duration: 0.15 }}
              className="whitespace-nowrap flex-1"
            >
              {child.label}
            </motion.span>
          )}
        </AnimatePresence>
      </Link>
    );
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 'auto' }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className={cn(
        'relative flex flex-col bg-sidebar border-r border-sidebar-border shrink-0 overflow-hidden h-full min-h-0',
        onNavigate && 'flex-1',
      )}
    >
      {/* Logo + Toggle */}
      <div className="flex items-center justify-between gap-3 px-4 h-16 border-b border-sidebar-border shrink-0 min-w-0">
        {/* Logo - clickeable cuando colapsado */}
        <button
          onClick={() => collapsed && setCollapsed(false)}
          className={cn(
            'flex items-center gap-3 min-w-0 flex-1',
            collapsed && 'cursor-pointer hover:opacity-80 transition-opacity',
          )}
          disabled={!collapsed}
          aria-label={collapsed ? 'Expandir sidebar' : undefined}
        >
          <BrandLogo size="md" variant="onDark" label="" />
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
                className="min-w-0 overflow-hidden"
              >
                <div className="text-sidebar-foreground font-black text-sm tracking-tight whitespace-nowrap leading-none">
                  Nexo Comercial
                </div>
                <div className="text-sidebar-foreground/40 text-[9px] font-semibold uppercase tracking-widest leading-none mt-0.5">
                  Gestión social · Cintalapa
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </button>

        {/* Toggle button - Solo visible cuando expandido y no es mobile */}
        {!onNavigate && !collapsed && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={() => setCollapsed(true)}
            className="shrink-0 w-8 h-8 rounded-lg hover:bg-sidebar-accent transition-colors flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground"
            aria-label="Colapsar sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </motion.button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-5 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const hasChildren = !!item.children?.length;

          // Group with subitems
          if (hasChildren) {
            return (
              <div key={item.label}>
                {/* Group header: title + icon on the right */}
                <div
                  className={cn(
                    'flex items-center py-2 px-3 transition-colors w-full select-none',
                    collapsed ? 'justify-center' : 'justify-between gap-3',
                  )}
                >
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -5 }}
                        transition={{ duration: 0.15 }}
                        className="text-[10px] font-bold tracking-wider uppercase whitespace-nowrap text-sidebar-foreground/50"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <Icon
                    className={cn(
                      'w-4 h-4 shrink-0 text-sidebar-foreground/50',
                      collapsed && 'w-5 h-5',
                    )}
                  />
                </div>

                {/* Subitems - always expanded */}
                <div className="mt-1 space-y-1">{item.children!.map(renderChild)}</div>
              </div>
            );
          }

          // Regular item (kept for type safety, not used in current NAV_ITEMS)
          const isActive = isPathActive(item.href!, activePath);

          return (
            <Link
              key={item.label}
              href={item.href!}
              onClick={handleNavigation}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors group relative',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <div className="relative shrink-0">
                <Icon className="w-5 h-5" />
                {item.badge && !collapsed && (
                  <span
                    className={cn(
                      'absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center',
                      isActive
                        ? 'bg-sidebar-primary-foreground text-sidebar-primary'
                        : 'bg-primary text-primary-foreground',
                    )}
                  >
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </div>
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -5 }}
                    transition={{ duration: 0.15 }}
                    className="text-sm font-medium whitespace-nowrap flex-1"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {!collapsed && item.badge && (
                <span
                  className={cn(
                    'text-xs font-semibold px-2 py-0.5 rounded-full',
                    isActive
                      ? 'bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground'
                      : 'bg-primary/20 text-primary-light',
                  )}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </motion.aside>
  );
}
