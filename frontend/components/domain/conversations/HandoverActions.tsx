'use client';

import { Button } from '@/components/ui/button';
import type { ConversationFlowState } from '@/lib/conversation-fsm';
import { FLOW_STATE_LABELS } from '@/lib/conversation-fsm';
import type { ConversationActionFlags } from '@/lib/conversation-ui-actions';

interface HandoverActionsProps {
  flowState: ConversationFlowState;
  flags: ConversationActionFlags;
  running: string | undefined;
  onHandover: () => Promise<boolean>;
  onClose: () => Promise<boolean>;
  onReopen: () => Promise<boolean>;
}

export function HandoverActions({
  flowState,
  flags,
  running,
  onHandover,
  onClose,
  onReopen,
}: HandoverActionsProps) {
  const showLifecycle = flags.canHandover || flags.canClose || flags.canReopen;

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-black tracking-tight">Estado y handover</h3>
        <span className="text-xs text-muted-foreground">
          FSM: <span className="font-semibold text-foreground">{FLOW_STATE_LABELS[flowState]}</span>
        </span>
      </div>

      {showLifecycle ? (
        <>
          <div className="flex flex-wrap gap-2">
            {flags.canHandover && (
              <Button
                type="button"
                variant="outline"
                disabled={!!running}
                onClick={() => void onHandover()}
              >
                {running === 'handover' ? 'Procesando…' : 'Handover a humano'}
              </Button>
            )}
            {flags.canClose && (
              <Button
                type="button"
                variant="destructive"
                disabled={!!running}
                onClick={() => void onClose()}
              >
                {running === 'close' ? 'Cerrando…' : 'Cerrar conversación'}
              </Button>
            )}
            {flags.canReopen && (
              <Button
                type="button"
                variant="secondary"
                disabled={!!running}
                onClick={() => void onReopen()}
              >
                {running === 'reopen' ? 'Reabriendo…' : 'Reabrir'}
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Las acciones se ocultan si la transición no es válida según la FSM del backend. Reabrir
            solo supervisores.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No hay transiciones disponibles para tu rol en este estado.
        </p>
      )}
    </div>
  );
}
