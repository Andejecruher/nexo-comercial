import { Badge } from '@/components/ui/badge';
import { ShieldCheck } from 'lucide-react';

export function ProtectedEntityBadge() {
  return (
    <Badge
      variant="outline"
      className="gap-1 text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300"
    >
      <ShieldCheck className="h-3 w-3" />
      Protegido
    </Badge>
  );
}
