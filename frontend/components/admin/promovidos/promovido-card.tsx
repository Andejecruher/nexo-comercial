'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import {
  promovidoFullName as fullName,
  promovidoPhone,
  promovidoSex,
} from '@/lib/promovido-mapper';
import { formatPhoneDisplay } from '@/lib/promovido-schema';
import type { PromovidoListItem } from '@/lib/promovidos-api';
import { Edit, MoreVertical, Users } from 'lucide-react';

interface PromovidoCardsProps {
  items: PromovidoListItem[];
  loading: boolean;
  onEdit: (item: PromovidoListItem) => void;
  onView: (item: PromovidoListItem) => void;
}

export function PromovidoCards({ items, loading, onEdit, onView }: PromovidoCardsProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Empty className="min-h-65">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Users />
          </EmptyMedia>
          <EmptyTitle>No hay promovidos</EmptyTitle>
          <EmptyDescription>Agregá el primer promovido para comenzar.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-xl border bg-card p-4 shadow-sm"
          role="article"
          aria-label={`Promovido ${fullName(item)}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onView(item)}
                className="text-left text-base font-semibold leading-tight hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {fullName(item)}
              </button>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant={item.isActive ? 'default' : 'secondary'} className="text-xs">
                  {item.isActive ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-11 w-11"
                onClick={() => onEdit(item)}
                aria-label={`Editar ${fullName(item)}`}
              >
                <Edit className="h-5 w-5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-11 w-11"
                onClick={() => onView(item)}
                aria-label={`Ver detalle de ${fullName(item)}`}
              >
                <MoreVertical className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Sección:</span>{' '}
              <span className="font-medium">{item.section.sectionCode}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Líder:</span>{' '}
              <span className="font-medium">{item.leader.fullName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Sexo:</span>{' '}
              <span>
                {promovidoSex(item) === 'H' ? 'Hombre' : promovidoSex(item) === 'M' ? 'Mujer' : '—'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Teléfono:</span>{' '}
              <span>{promovidoPhone(item) ? formatPhoneDisplay(promovidoPhone(item)!) : '—'}</span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Clave:</span>{' '}
              <span className="font-mono text-xs">{item.data.voterKey}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
