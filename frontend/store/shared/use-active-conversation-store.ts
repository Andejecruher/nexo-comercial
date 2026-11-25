import { create } from 'zustand';

/**
 * Conversación abierta actualmente en la bandeja admin.
 *
 * Permite que capas fuera del inbox (por ejemplo, el dispatcher de toasts
 * realtime) sepan qué conversación está viendo el usuario y eviten alertas
 * redundantes. La bandeja de conversaciones la mantiene sincronizada a través
 * de `setSelectedConversationId`.
 */
interface ActiveConversationState {
  activeConversationId: string | undefined;
  setActiveConversation: (id: string | undefined) => void;
}

export const useActiveConversationStore = create<ActiveConversationState>((set) => ({
  activeConversationId: undefined,
  setActiveConversation: (id) => set({ activeConversationId: id }),
}));
