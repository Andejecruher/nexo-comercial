import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ShieldAlert } from 'lucide-react';

export function AccessDeniedState({ onRetry }: { onRetry?: () => void }) {
  return (
    <Empty className="min-h-[320px]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldAlert />
        </EmptyMedia>
        <EmptyTitle>No tenés acceso a esta sección</EmptyTitle>
        <EmptyDescription>
          Tu usuario no cuenta con los permisos necesarios para consultar o modificar accesos.
        </EmptyDescription>
      </EmptyHeader>
      {onRetry && (
        <EmptyContent>
          <Button variant="outline" onClick={onRetry}>
            Reintentar
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
