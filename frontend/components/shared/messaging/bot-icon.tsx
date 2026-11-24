'use client';

/**
 * BotIcon — ÚNICO renderizador del ícono de agente IA de la aplicación.
 *
 * Regla R-UI-1: cualquier vista que señale "esto lo atiende un agente de IA"
 * reutiliza este componente con tamaño/color consistentes; está prohibido
 * renderizar el ícono `Bot` de lucide inline por vista.
 */

import { cn } from '@/lib/shared/utils';
import { Bot } from 'lucide-react';

export interface BotIconProps {
  className?: string;
  /** Texto accesible (ej. "Atendido por Bot Agua"). Sin label el ícono es decorativo. */
  label?: string;
}

export function BotIcon({ className, label }: BotIconProps) {
  return (
    <Bot
      className={cn('size-3.5 text-muted-foreground', className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  );
}
