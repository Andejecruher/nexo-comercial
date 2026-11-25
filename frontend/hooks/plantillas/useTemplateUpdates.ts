'use client';
import { useEffect, useState } from 'react';
import { tryRefreshToken } from '@/lib/shared/api-client';
import { authStorage } from '@/lib/shared/auth-storage';
import { createTemplateSseParser } from '@/lib/plantillas/template-sse';
import type { TemplateStatusUpdate } from '@/lib/shared/templates-api';

/** fetch streaming keeps the project's Bearer auth; no access tokens in URLs. */
export function useTemplateUpdates(
  lineId: string | undefined,
  cursor: string | undefined,
  onUpdate: (event: TemplateStatusUpdate) => void,
) {
  const [connection, setConnection] = useState<
    'connecting' | 'live' | 'reconnecting' | 'unauthorized'
  >('connecting');
  useEffect(() => {
    if (!lineId || cursor === undefined) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastId = cursor;
    let attempts = 0;
    const connect = async () => {
      if (controller.signal.aborted) return;
      setConnection(attempts ? 'reconnecting' : 'connecting');
      try {
        const query = new URLSearchParams({ lineId, cursor: lastId });
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/v1/templates/stream?${query}`,
          {
            headers: {
              Authorization: `Bearer ${authStorage.getAccessToken() ?? ''}`,
              Accept: 'text/event-stream',
            },
            signal: controller.signal,
          },
        );
        if (response.status === 401) {
          if (await tryRefreshToken()) {
            if (!controller.signal.aborted)
              timer = setTimeout(() => {
                void connect();
              }, 0);
            return;
          }
          setConnection('unauthorized');
          return;
        }
        if (response.status === 403) {
          setConnection('unauthorized');
          return;
        }
        if (
          !response.ok ||
          !response.body ||
          !response.headers.get('content-type')?.includes('text/event-stream')
        )
          throw new Error('SSE no disponible');
        attempts = 0;
        setConnection('live');
        const parse = createTemplateSseParser((event) => {
          if (!controller.signal.aborted) {
            onUpdate(event);
            lastId = event.id;
          }
        });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        try {
          while (!controller.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            parse(decoder.decode(value, { stream: true }));
          }
        } finally {
          await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
      } catch {
        /* Network loss: resume from the last applied event, without refetching. */
      }
      if (!controller.signal.aborted) {
        setConnection('reconnecting');
        attempts++;
        timer = setTimeout(
          () => {
            void connect();
          },
          Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5)),
        );
      }
    };
    void connect();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [lineId, cursor, onUpdate]);
  return connection;
}
