'use client';

import { cn } from '@/lib/shared/utils';
import { BookOpen, Bot, FileText, GitFork, Phone, Wrench } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const AI_NAV = [
  { href: '/admin/ai/phone-lines', label: 'Líneas', icon: Phone },
  { href: '/admin/ai/relationships', label: 'Relaciones', icon: GitFork },
  { href: '/admin/ai/agents', label: 'Agentes', icon: Bot },
  { href: '/admin/ai/tools', label: 'Herramientas', icon: Wrench },
  { href: '/admin/ai/topics', label: 'Tópicos', icon: BookOpen },
  { href: '/admin/ai/prompts', label: 'Prompts', icon: FileText },
];

export default function AiAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-nav */}
      <nav className="flex items-center gap-0.5 px-6 pt-4 pb-0 border-b border-border bg-card shrink-0 overflow-x-auto">
        {AI_NAV.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
