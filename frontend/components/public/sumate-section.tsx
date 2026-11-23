'use client';

import { SumateSectionView } from '@/components/public/sumate-section-view';
import { useRegistroCiudadano } from '@/hooks/useRegistroCiudadano';

export function SumateSection() {
  const registro = useRegistroCiudadano();
  return <SumateSectionView {...registro} />;
}
