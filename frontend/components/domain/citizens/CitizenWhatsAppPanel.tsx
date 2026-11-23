'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { usePermissions } from '@/hooks/usePermissions';
import { campaignUrl, WhatsAppIcon } from './citizen-whatsapp-actions';

interface CitizenWhatsAppPanelProps {
  selectedCitizenIds: string[];
}

export function CitizenWhatsAppPanel({ selectedCitizenIds }: CitizenWhatsAppPanelProps) {
  const { can } = usePermissions();
  if (
    selectedCitizenIds.length === 0 ||
    !can('campanas_whatsapp.create') ||
    !can('plantillas.view')
  )
    return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <WhatsAppIcon className="size-4 text-primary" />
          Acciones de WhatsApp Masivas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
          <p className="text-sm font-medium">Asignación masiva</p>
          <p className="text-xs text-muted-foreground">
            Ciudadanos seleccionados: {selectedCitizenIds.length}
          </p>

          <Button asChild className="w-full sm:w-auto">
            <Link href={campaignUrl(selectedCitizenIds)}>Crear Campaña</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
