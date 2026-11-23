import { ConversationFlowState, WaInboundMessage } from '../../types/whatsapp.types';
import { AiBlockReason } from './fsm-guards';

export interface FsmRouterInput {
  conversationId: string;
  citizenId: string;
  phone: string;
  messageId: string;
  waMessageId: string;
  messageText: string;
  inboundMessages?: WaInboundMessage[];
  lineExternalIdentifier?: string;
  correlationId: string;
  excludeMessageIds?: string[];
  batchGeneration?: number;
  metaOverride?: {
    flowState: ConversationFlowState;
    version: number;
    assignedUserId?: string;
    attendanceMode?: string | null;
    botEnabled?: boolean | null;
  };
}

export type FsmDecision =
  | { kind: 'ai_handled'; runId?: string }
  | { kind: 'ai_blocked'; reason: AiBlockReason }
  | { kind: 'duplicate'; messageId: string }
  | { kind: 'lock_conflict'; conversationId: string }
  | { kind: 'no_agent' }
  | { kind: 'error'; error: string };

export interface FsmRouterResult {
  decision: FsmDecision;
  flowState: ConversationFlowState;
  transitioned: boolean;
  newFlowState?: ConversationFlowState;
  durationMs: number;
}
