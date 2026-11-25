'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  CitizenConversationSummary,
  CitizenParticipationHistoryItem,
} from '@/lib/shared/citizens-api';

interface CitizenTimelineSummaryProps {
  conversationSummary: CitizenConversationSummary;
  participationHistory: CitizenParticipationHistoryItem[];
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CitizenTimelineSummary({
  conversationSummary,
  participationHistory,
}: CitizenTimelineSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen de conversaciones y participación</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs uppercase">Total conversaciones</p>
            <p className="text-xl font-semibold">{conversationSummary.totalConversations}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs uppercase">Abiertas</p>
            <p className="text-xl font-semibold">{conversationSummary.openConversations}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs uppercase">Último contacto</p>
            <p className="text-sm font-medium">
              {conversationSummary.lastConversation
                ? formatDate(conversationSummary.lastConversation.updatedAt)
                : 'Sin conversaciones'}
            </p>
          </div>
        </div>

        {conversationSummary.lastConversation && (
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground uppercase mb-1">Última conversación</p>
            <p className="font-medium">
              {conversationSummary.lastConversation.channel} ·{' '}
              {conversationSummary.lastConversation.status}
            </p>
            <p className="text-muted-foreground mt-1">
              {conversationSummary.lastConversation.lastMessage ?? 'Sin último mensaje visible'}
            </p>
          </div>
        )}

        <div>
          <p className="text-sm font-medium mb-2">Historial de participación</p>
          {participationHistory.length === 0 ? (
            <p className="text-muted-foreground">No hay participación registrada.</p>
          ) : (
            <div className="space-y-2">
              {participationHistory.map((item) => (
                <div key={item.registrationId} className="rounded-lg border p-3">
                  <p className="font-medium">{item.eventTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    Inicio: {formatDate(item.eventStartsAt)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Registro: {item.registrationStatus} · Asistencia: {item.attendanceStatus}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
