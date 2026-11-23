'use client';
import { Fragment, useLayoutEffect, useRef, type ReactNode } from 'react';
import { MessageBubble, type MessageRenderable } from './MessageBubble';

import { messageDay, messageDayLabel } from '@/lib/message-dates';
export interface HistoryProps {
  messages: MessageRenderable[];
  identity?: string;
  currentUserId?: string;
  hasOlder?: boolean;
  loadingOlder?: boolean;
  loadOlder?: () => Promise<void>;
  historyError?: string;
  children?: ReactNode;
}
export function MessageHistory({
  messages,
  identity,
  currentUserId,
  hasOlder,
  loadingOlder,
  loadOlder,
  historyError,
  children,
}: HistoryProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const previous = useRef<{ identity?: string; first?: string }>({});
  const anchor = useRef<{ id: string; top: number } | undefined>(undefined);
  const nearBottom = useRef(true);
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const first = messages[0]?.id;
    const reset = previous.current.identity !== identity || !previous.current.first;
    if (reset) {
      el.scrollTop = el.scrollHeight;
      nearBottom.current = true;
      anchor.current = undefined;
    } else if (anchor.current && previous.current.first !== first) {
      const node = el.querySelector<HTMLElement>(`[data-message-id="${anchor.current.id}"]`);
      if (node) el.scrollTop += node.getBoundingClientRect().top - anchor.current.top;
      anchor.current = undefined;
    } else if (nearBottom.current) el.scrollTop = el.scrollHeight;
    previous.current = { identity, first };
  }, [messages, identity, children]);
  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !content.current) return;
    const observer = new ResizeObserver(() => {
      const el = viewport.current;
      if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  const older = () => {
    const el = viewport.current;
    if (!el || loadingOlder || !hasOlder || !loadOlder) return;
    const nodes = [...el.querySelectorAll<HTMLElement>('[data-message-id]')];
    const node = nodes.find(
      (n) => n.getBoundingClientRect().bottom >= el.getBoundingClientRect().top,
    );
    if (node)
      anchor.current = { id: node.dataset.messageId!, top: node.getBoundingClientRect().top };
    void loadOlder();
  };
  return (
    <div
      ref={viewport}
      role="region"
      aria-label="Historial de mensajes"
      tabIndex={0}
      className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain bg-background [overflow-anchor:none] focus-visible:outline-2 focus-visible:outline-ring"
      onScroll={() => {
        const el = viewport.current!;
        nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        if (el.scrollTop < 120) older();
      }}
    >
      <div ref={content} className="flex min-w-0 flex-col gap-3 p-3 sm:p-4 wrap-anywhere">
        {hasOlder && (
          <button
            type="button"
            disabled={loadingOlder}
            onClick={older}
            className="min-h-11 cursor-pointer text-sm underline disabled:cursor-not-allowed"
          >
            {loadingOlder ? 'Cargando mensajes anteriores…' : 'Cargar mensajes anteriores'}
          </button>
        )}
        {historyError && <p role="alert">{historyError}</p>}
        {messages.map((message, index) => {
          const date =
            typeof message.meta?.eventAt === 'string' ? message.meta.eventAt : message.createdAt;
          const prev = messages[index - 1];
          const prevDate =
            typeof prev?.meta?.eventAt === 'string' ? prev.meta.eventAt : prev?.createdAt;
          return (
            <Fragment key={message.id}>
              {(!prevDate || messageDay(date) !== messageDay(prevDate)) && (
                <div
                  role="separator"
                  className="self-center rounded-full bg-muted px-3 py-1 text-xs"
                >
                  {messageDayLabel(date)}
                </div>
              )}
              <div data-message-id={message.id} className="flex min-w-0 flex-col">
                <MessageBubble message={message} currentUserId={currentUserId} />
              </div>
            </Fragment>
          );
        })}
        {children}
      </div>
    </div>
  );
}
