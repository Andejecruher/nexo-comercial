import { cn } from '@/lib/utils';

interface StructureColorSwatchProps {
  color: string;
  className?: string;
}

export function StructureColorSwatch({ color, className }: StructureColorSwatchProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-3.5 shrink-0 rounded-full border border-black/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,.25)]',
        className,
      )}
      style={{ backgroundColor: color }}
    />
  );
}
