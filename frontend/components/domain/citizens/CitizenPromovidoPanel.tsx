'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CitizenPromovidoInfo } from '@/lib/citizens-api';
import { formatDateTime } from '@/lib/promovido-mapper';
import Link from 'next/link';

const ORIGIN_LABEL: Record<CitizenPromovidoInfo['origin'], string> = {
  ocr: 'Captura OCR',
  manual: 'Registro manual',
};

interface CitizenPromovidoPanelProps {
  promovido: CitizenPromovidoInfo | null;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

export function CitizenPromovidoPanel({ promovido }: CitizenPromovidoPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Información de Promovido</CardTitle>
      </CardHeader>
      <CardContent>
        {promovido ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={promovido.isActive ? 'default' : 'outline'}>
                {promovido.isActive ? 'Vinculación activa' : 'Vinculación inactiva'}
              </Badge>
              <Badge variant="secondary">{ORIGIN_LABEL[promovido.origin]}</Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Líder responsable" value={promovido.leaderName} />
              <Field label="Sección electoral" value={promovido.sectionCode} />
              <Field label="Distrito" value={promovido.districtCode} />
              <Field label="Estado" value={promovido.stateName} />
            </div>

            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Vinculado: {formatDateTime(promovido.createdAt)} · Actualizado:{' '}
                {formatDateTime(promovido.updatedAt)}
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/promovidos">Ver en Promovidos</Link>
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Este ciudadano no está vinculado actualmente a un promovido.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
