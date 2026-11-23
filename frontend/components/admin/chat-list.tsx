'use client';

import { ConversationFilter } from '@/components/admin/conversation-filter';
import { StartConversationDialog } from '@/components/admin/start-conversation-dialog';
import { BotIcon } from '@/components/domain/messaging/bot-icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAiAgents } from '@/hooks/useAiAgents';
import { usePhoneLines } from '@/hooks/ai/usePhoneLines';
import type { InboxListFilters, InboxStatusTab } from '@/hooks/useAdminInboxConversations';
import { useDepartments } from '@/hooks/useDepartments';
import type { CommunicationLine } from '@/lib/ai-api';
import {
  resolveInboxAttendant,
  type InboxConversation,
  type InboxStatus,
} from '@/lib/messaging-api';
import { formatPhoneDisplay } from '@/lib/phone-utils';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Bot, Building2, Loader2, PhoneCall, Search, SquarePen, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

interface ChatListProps {
  selectedId: string | null;
  onSelect: (chat: InboxConversation) => void;
  conversations: InboxConversation[];
  loading?: boolean;
  filters: InboxListFilters;
  search: string;
  onSearchChange: (value: string) => void;
  onApplyFilters: (filters: Partial<InboxListFilters>) => void;
}

const STATUS_FILTERS: { value: InboxStatusTab; label: string }[] = [
  { value: 'active', label: 'Activas' },
  { value: 'inactive', label: 'Inactivas' },
];

const INBOX_STATUS_CONFIG: Record<InboxStatus, { label: string; color: string; bg: string }> = {
  active: { label: 'Activa', color: 'text-primary', bg: 'bg-primary/10' },
  inactive: { label: 'Inactiva', color: 'text-muted-foreground', bg: 'bg-muted' },
};

function linePresentation(line: CommunicationLine) {
  const rawPhone = line.phoneNumber?.trim() ?? '';
  const phone = rawPhone ? formatPhoneDisplay(rawPhone) || rawPhone : '';
  const name = line.displayName?.trim() ?? '';
  const hasConfiguredName = Boolean(
    name && name !== rawPhone && name !== phone && name !== line.externalIdentifier,
  );

  return {
    primary: hasConfiguredName ? name : phone || name || line.externalIdentifier,
    secondary: hasConfiguredName && phone ? phone : undefined,
  };
}

export function ChatList({
  selectedId,
  onSelect,
  conversations,
  loading,
  filters,
  search,
  onSearchChange,
  onApplyFilters,
}: ChatListProps) {
  const [startOpen, setStartOpen] = useState(false);
  const [localDepartmentIds, setLocalDepartmentIds] = useState<string[]>(
    filters.departmentIds ?? [],
  );
  const [localBotIds, setLocalBotIds] = useState<(string | null)[]>(filters.botIds ?? []);
  const aiAgents = useAiAgents();
  const autoSelectedLine = useRef<string | undefined>(undefined);

  const { lines } = usePhoneLines({ isActive: true });
  const { departments } = useDepartments({ autoFetch: true, pageSize: 50 });
  const activeDepartments = useMemo(
    () => departments.filter((department) => department.isActive),
    [departments],
  );

  const selectedLine =
    lines.find((line) => line.id === filters.communicationLineId) ??
    (filters.communicationLineId === undefined ? lines[0] : undefined);
  const selectedLinePresentation = selectedLine ? linePresentation(selectedLine) : undefined;
  const lineTriggerLabel = selectedLinePresentation?.primary
    ? selectedLinePresentation.primary
    : lines.length === 0
      ? 'Cargando líneas…'
      : 'Línea no disponible';

  useEffect(() => {
    setLocalDepartmentIds(filters.departmentIds ?? []);
  }, [filters.departmentIds]);

  useEffect(() => {
    setLocalBotIds(filters.botIds ?? []);
  }, [filters.botIds]);

  useEffect(() => {
    if (filters.communicationLineId !== undefined) {
      // Línea explícita (URL, evento o usuario): respetarla aunque no esté en
      // el catálogo activo. Auto-seleccionar lines[0] aquí pisaría el contexto
      // trazado por la notificación y contradiría la URL.
      autoSelectedLine.current = undefined;
      return;
    }
    if (lines.length === 0) return;

    const firstLineId = lines[0]?.id;
    if (!firstLineId || autoSelectedLine.current === firstLineId) return;
    autoSelectedLine.current = firstLineId;
    onApplyFilters({ communicationLineId: firstLineId });
  }, [filters.communicationLineId, lines, onApplyFilters]);

  const handleDepartmentIdsChange = (next: string[]) => {
    setLocalDepartmentIds(next);
    // Los botIds se conservan: ambos grupos se combinan con OR en el backend.
    onApplyFilters({ departmentIds: next });
  };

  const handleBotIdsChange = (next: (string | null)[]) => {
    setLocalBotIds(next);
    // Los departamentos se conservan: ambos grupos se combinan con OR.
    onApplyFilters({ botIds: next });
  };

  const lineTrigger = (
    <SelectTrigger
      id="inbox-line-filter"
      size="sm"
      className="h-10 w-full border-0 bg-muted/50 px-2.5 shadow-none hover:bg-muted"
      aria-label="Línea telefónica"
    >
      <PhoneCall className="size-3.5 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-left text-xs font-medium">
        {lineTriggerLabel}
      </span>
    </SelectTrigger>
  );

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 overflow-hidden border-r border-border bg-background">
      <div className="shrink-0 px-4 py-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Conversaciones</h2>
          <button
            type="button"
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            aria-label="Iniciar conversación"
            onClick={() => setStartOpen(true)}
          >
            <SquarePen className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0 space-y-1">
            <Label
              htmlFor="inbox-line-filter"
              className="pl-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Línea
            </Label>
            <Select
              value={selectedLine?.id ?? ''}
              onValueChange={(communicationLineId) => onApplyFilters({ communicationLineId })}
              disabled={lines.length === 0}
            >
              {selectedLinePresentation?.secondary ? (
                <Tooltip>
                  <TooltipTrigger asChild>{lineTrigger}</TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={6}>
                    {selectedLinePresentation.secondary}
                  </TooltipContent>
                </Tooltip>
              ) : (
                lineTrigger
              )}
              <SelectContent align="start" className="min-w-64">
                {lines.map((line) => {
                  const presentation = linePresentation(line);
                  return (
                    <SelectItem key={line.id} value={line.id} className="py-2">
                      <span className="flex min-w-0 flex-col items-start gap-0">
                        <span className="max-w-52 truncate text-xs font-medium">
                          {presentation.primary}
                        </span>
                        {presentation.secondary && (
                          <span className="text-[10px] font-normal text-muted-foreground">
                            {presentation.secondary}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-1">
            <Label
              htmlFor="inbox-dept-filter"
              className="pl-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Departamentos
            </Label>
            <ConversationFilter
              departmentIds={localDepartmentIds}
              onDepartmentIdsChange={handleDepartmentIdsChange}
              botIds={localBotIds}
              onBotIdsChange={handleBotIdsChange}
              aiAgents={aiAgents}
            />
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Buscar ciudadano o colonia..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className="flex shrink-0 gap-1 px-3 py-2 border-b border-border overflow-x-auto">
        {STATUS_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => onApplyFilters({ inboxStatus: value })}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
              filters.inboxStatus === value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain flex flex-col">
        {loading && conversations.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground text-sm gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            Cargando…
          </div>
        )}
        {!loading && conversations.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-muted-foreground text-sm gap-2">
            <span>
              {(filters.departmentIds?.length ?? 0) > 0 || (filters.botIds?.length ?? 0) > 0
                ? 'Sin conversaciones para los filtros seleccionados'
                : 'Sin resultados'}
            </span>
          </div>
        )}
        {conversations.map((chat, i) => {
          const cfg = INBOX_STATUS_CONFIG[chat.inboxStatus];
          const isSelected = selectedId === chat.id;
          const departmentName = activeDepartments.find(
            (dept) => dept.slug === chat.departmentSlug,
          )?.name;
          const attendant = resolveInboxAttendant(chat, departmentName);
          const AttendantIcon =
            attendant.kind === 'agent'
              ? UserRound
              : attendant.kind === 'department'
                ? Building2
                : Bot;
          const phone = formatPhoneDisplay(chat.citizen.phone) || chat.citizen.phone;
          return (
            <motion.button
              key={chat.id}
              type="button"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => onSelect(chat)}
              className={cn(
                'w-full text-left px-4 py-3.5 border-b border-border transition-colors hover:bg-muted/50',
                isSelected && 'bg-primary/5 border-l-2 border-l-primary',
              )}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold shrink-0">
                  {chat.citizen.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="font-medium text-foreground text-sm truncate">
                        {chat.citizen.name}
                      </span>
                      {chat.botAgent && (
                        <BotIcon
                          className="size-3 shrink-0"
                          label={`Atendido por ${chat.botAgent.name}`}
                        />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {chat.lastTime}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mb-0.5">{phone}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground truncate max-w-40">
                      {chat.lastMessage}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {chat.unread > 0 && (
                        <span className="w-5 h-5 bg-primary rounded-full text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                          {chat.unread}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full',
                        attendant.kind === 'bot'
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-primary/5 text-foreground',
                      )}
                    >
                      <AttendantIcon className="size-2.5" aria-hidden />
                      {attendant.label}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-medium px-2 py-0.5 rounded-full',
                        cfg.bg,
                        cfg.color,
                      )}
                    >
                      {cfg.label}
                    </span>
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <StartConversationDialog open={startOpen} onOpenChange={setStartOpen} onSelect={onSelect} />
    </div>
  );
}
