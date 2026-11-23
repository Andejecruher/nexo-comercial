'use client';

import { usePermissions } from '@/hooks/usePermissions';
import type { Permission } from '@/lib/auth-guards';
import type { UserRole } from '@/lib/auth-storage';
import { motion } from 'framer-motion';
import { Bot, Building2, KeyRound, MapPin, Shield, ShieldUserIcon, Tag, Users } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

type SettingsLink = {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  requiredPermissions?: Permission[];
  requiredRoles?: UserRole[];
};

const SETTINGS_LINKS: SettingsLink[] = [
  {
    href: '/admin/equipo',
    title: 'Equipo',
    description: 'Usuarios del panel administrativo y su estado de acceso.',
    icon: Users,
    requiredPermissions: ['users.view'],
  },
  {
    href: '/admin/departamentos',
    title: 'Departamentos',
    description: 'Routing de atención ciudadana y reglas operativas de áreas.',
    icon: Building2,
  },
  {
    href: '/admin/barrios',
    title: 'Territorio y barrios',
    description: 'Catálogo territorial usado para segmentación y atención ciudadana.',
    icon: MapPin,
  },
  {
    href: '/admin/etiquetas',
    title: 'Etiquetas',
    description: 'Clasificación operativa para conversaciones, casos y seguimiento.',
    icon: Tag,
  },
  {
    href: '/admin/catalogo-electoral',
    title: 'Catálogo electoral',
    description: 'Secciones, casillas y estructura electoral del municipio.',
    icon: MapPin,
    requiredRoles: ['SUPER_ADMIN'],
  },
  {
    href: '/admin/ai',
    title: 'Canales e IA avanzada',
    description: 'Líneas de comunicación, agentes, prompts, topics y tools existentes.',
    icon: Bot,
  },
  {
    href: '/admin/accesos/roles',
    title: 'Roles',
    description: 'Administración de roles y sus permisos asignados.',
    icon: ShieldUserIcon,
    requiredPermissions: ['roles.view', 'permissions.view'],
  },
  {
    href: '/admin/accesos/permissions',
    title: 'Permisos',
    description: 'Catálogo de permisos administrativos de la plataforma.',
    icon: KeyRound,
    requiredPermissions: ['permissions.view'],
  },
];

export function SettingsView() {
  const { can, roles: userRoles } = usePermissions();

  const visibleLinks = useMemo(
    () =>
      SETTINGS_LINKS.filter(
        (link) =>
          (!link.requiredPermissions ||
            link.requiredPermissions.some((permission) => can(permission))) &&
          (!link.requiredRoles || link.requiredRoles.some((role) => userRoles.includes(role))),
      ),
    [can, userRoles],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-6">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-primary">
                Configuraciones
              </p>
              <h1 className="mt-2 text-2xl font-black text-foreground">Centro de administración</h1>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
              <div className="flex items-center gap-2 font-bold">
                <Shield className="h-4 w-4" /> Acceso protegido
              </div>
            </div>
          </div>
        </div>
        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {visibleLinks.map(({ href, title, description, icon: Icon }, index) => (
              <motion.div
                key={href}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <Link
                  href={href}
                  className="group flex h-full gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-foreground">{title}</h3>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
