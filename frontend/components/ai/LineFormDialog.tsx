'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ReactNode } from 'react';

interface LineFormDialogProps {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}

export function LineFormDialog({ open, title, children, footer, onClose }: LineFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex w-[calc(100%-1rem)] max-h-[calc(100dvh-1rem)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[min(90dvh,calc(100dvh-2rem))] sm:max-w-lg">
        <DialogHeader className="shrink-0 px-5 pt-5 pb-4 pr-12 sm:px-6 sm:pr-14">
          <DialogTitle className="flex items-center gap-2 text-left">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Completá los datos de la línea de comunicación. El formulario se desplaza; las acciones
            quedan fijas al pie.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
          {children}
        </div>
        <DialogFooter className="shrink-0 border-t bg-background px-5 py-3 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
