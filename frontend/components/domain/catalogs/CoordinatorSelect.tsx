'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { coordinatorsApi } from '@/lib/coordinators-api';
import { useEffect, useState } from 'react';

interface CoordinatorSelectProps {
  id?: string;
  /** Sección de la que se filtran los coordinadores (F4.3: selector filtrado por sección). */
  sectionId?: string;
  value?: string | null;
  onValueChange: (value: string | null) => void;
  isDisabled?: boolean;
}

const NONE = 'none';

/**
 * Selector de coordinador filtrado por sección. Lista los coordinadores activos
 * de la sección actual. Sin sección seleccionada, queda deshabilitado porque el
 * coordinador es un cargo ligado a una sección (D1/D4).
 */
export function CoordinatorSelect({
  id,
  sectionId,
  value,
  onValueChange,
  isDisabled = false,
}: CoordinatorSelectProps) {
  const [coordinators, setCoordinators] = useState<Array<{ id: string; fullName: string }>>([]);
  const [loading, setLoading] = useState(false);

  const normalizedValue = value ? value : NONE;

  useEffect(() => {
    if (!sectionId) {
      setCoordinators([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void coordinatorsApi
      .list({ sectionId })
      .then((result) => {
        if (cancelled) return;
        const list = result.ok ? (result.data.coordinators ?? []) : [];
        setCoordinators(
          list
            .filter((coordinator) => coordinator.isActive || coordinator.id === value)
            .map((coordinator) => ({ id: coordinator.id, fullName: coordinator.fullName })),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sectionId, value]);

  const disabled = isDisabled || !sectionId;

  return (
    <Select
      value={normalizedValue}
      onValueChange={(next) => onValueChange(next === NONE ? null : next)}
      disabled={disabled || loading}
    >
      <SelectTrigger id={id} className="h-11 w-full rounded-lg bg-background shadow-xs">
        <SelectValue placeholder={loading ? 'Cargando...' : 'Seleccioná un coordinador'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE} disabled={!sectionId}>
          {!sectionId ? 'Seleccioná primero la sección' : 'Sin coordinador asignado'}
        </SelectItem>
        {coordinators.map((coordinator) => (
          <SelectItem key={coordinator.id} value={coordinator.id}>
            {coordinator.fullName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
