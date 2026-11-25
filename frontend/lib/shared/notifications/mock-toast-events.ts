import { toast } from 'sonner';

import { buildConversationsHref } from '@/lib/shared/conversations-navigation';

export type MockToastVariant = 'info' | 'warning' | 'success';

/** Navegador inyectado por el llamador (p. ej. `router.push`). */
export type MockToastNavigate = (href: string) => void;

export interface MockToastEvent {
  id: string;
  label: string;
  variant: MockToastVariant;
  mock: {
    contactName?: string;
    ticketId: string;
    conversationId: string;
    departmentSlug?: string;
    messagePreview?: string;
    assignedUserId?: string;
  };
  trigger: (navigate: MockToastNavigate) => void;
}

/**
 * Mock events that mirror the exact structure produced by `useRealtimeNotifications`.
 * Used in the notification settings modal to preview how each toast looks and reads.
 */
export const MOCK_TOAST_EVENTS: MockToastEvent[] = [
  {
    id: 'newMessage',
    label: 'Nuevo mensaje',
    variant: 'info',
    mock: {
      contactName: 'María González',
      ticketId: 'TK-1234',
      conversationId: 'conv-abc-123',
      departmentSlug: 'soporte',
      messagePreview: 'Hola, necesito ayuda con mi pedido #4521',
    },
    trigger: (navigate) => {
      const conversationId = 'conv-abc-123';
      const contactName = 'María González';
      const description = contactName
        ? `${contactName} envió un mensaje nuevo.`
        : 'Tenés un mensaje nuevo.';
      toast.info('Nuevo mensaje', {
        id: `msg-${conversationId}`,
        duration: 6_000,
        description,
        action: {
          label: 'Ver',
          onClick: () => navigate(buildConversationsHref({ conversationId })),
        },
      });
    },
  },
  {
    id: 'newTicket',
    label: 'Nuevo ticket',
    variant: 'info',
    mock: {
      contactName: 'Carlos Ruiz',
      ticketId: 'TK-5678',
      conversationId: 'conv-def-456',
      departmentSlug: 'ventas',
      messagePreview: 'Quiero información sobre los planes empresariales',
    },
    trigger: (navigate) => {
      const conversationId = 'conv-def-456';
      const contactName = 'Carlos Ruiz';
      const description = contactName
        ? `${contactName} envió un mensaje nuevo.`
        : 'Tenés un mensaje nuevo.';
      toast.info('Nuevo ticket recibido', {
        id: `msg-${conversationId}`,
        duration: 6_000,
        description,
        action: {
          label: 'Ver',
          onClick: () => navigate(buildConversationsHref({ conversationId })),
        },
      });
    },
  },
  {
    id: 'departmentTransfer',
    label: 'Transferencia de departamento',
    variant: 'warning',
    mock: {
      ticketId: 'TK-9012',
      conversationId: 'conv-ghi-789',
      departmentSlug: 'facturacion',
    },
    trigger: (navigate) => {
      const conversationId = 'conv-ghi-789';
      const departmentSlug = 'facturacion';
      const description = departmentSlug
        ? `La conversación pasó al departamento ${departmentSlug}.`
        : 'La conversación fue transferida a otro departamento.';
      toast.warning('Transferencia de departamento', {
        id: `transfer-${conversationId}`,
        duration: Infinity,
        description,
        action: {
          label: 'Ver',
          onClick: () => navigate(buildConversationsHref({ conversationId })),
        },
      });
    },
  },
  {
    id: 'ticketClosed',
    label: 'Cierre de ticket',
    variant: 'success',
    mock: {
      ticketId: 'TK-3456',
      conversationId: 'conv-jkl-012',
      departmentSlug: 'soporte',
    },
    trigger: (navigate) => {
      const conversationId = 'conv-jkl-012';
      toast.success('Ticket cerrado', {
        id: `close-${conversationId}`,
        duration: Infinity,
        description: 'El ticket fue cerrado. Confirmá con el ciudadano si precisa seguimiento.',
        action: {
          label: 'Ver',
          onClick: () => navigate(buildConversationsHref({ conversationId })),
        },
      });
    },
  },
];

export function triggerMockToast(eventId: string, navigate: MockToastNavigate): void {
  const event = MOCK_TOAST_EVENTS.find((e) => e.id === eventId);
  event?.trigger(navigate);
}
