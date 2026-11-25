'use client';

import { MessageSquare } from 'lucide-react';
import type * as React from 'react';
export function campaignUrl(selectedCitizenIds: string[]) {
  const params = new URLSearchParams();
  selectedCitizenIds.forEach((id) => params.append('citizenId', id));
  return `/admin/campanas/nueva?${params.toString()}`;
}

export function WhatsAppIcon(props: React.SVGProps<SVGSVGElement>) {
  return <MessageSquare {...props} />;
}
