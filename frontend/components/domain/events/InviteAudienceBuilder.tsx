'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import type { Neighborhood, Tag } from '@/lib/catalog-api';
import { Filter, Loader2, Send } from 'lucide-react';

interface InviteAudienceBuilderProps {
  tags: Tag[];
  neighborhoods: Neighborhood[];
  selectedTagIds: string[];
  selectedNeighborhoodIds: string[];
  message: string;
  onTagsChange: (ids: string[]) => void;
  onNeighborhoodsChange: (ids: string[]) => void;
  onMessageChange: (value: string) => void;
  onSend: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function InviteAudienceBuilder({
  tags,
  neighborhoods,
  selectedTagIds,
  selectedNeighborhoodIds,
  message,
  onTagsChange,
  onNeighborhoodsChange,
  onMessageChange,
  onSend,
  loading,
  disabled,
}: InviteAudienceBuilderProps) {
  const hasSegment = selectedTagIds.length > 0 || selectedNeighborhoodIds.length > 0;
  const canSend = hasSegment && message.trim().length > 0 && !disabled;

  const toggleTag = (id: string, checked: boolean) => {
    if (checked) onTagsChange([...selectedTagIds, id]);
    else onTagsChange(selectedTagIds.filter((t) => t !== id));
  };

  const toggleNeighborhood = (id: string, checked: boolean) => {
    if (checked) onNeighborhoodsChange([...selectedNeighborhoodIds, id]);
    else onNeighborhoodsChange(selectedNeighborhoodIds.filter((n) => n !== id));
  };

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Send className="size-4 text-primary" />
        Invitación segmentada (WhatsApp)
      </div>
      <p className="text-xs text-muted-foreground">
        Elegí al menos un criterio: etiquetas y/o barrios. El backend une ambos conjuntos y encola
        mensajes al endpoint de invitación existente.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Barrios</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start gap-2" type="button">
                <Filter className="size-4" />
                Barrios
                {selectedNeighborhoodIds.length > 0 && (
                  <Badge variant="secondary">{selectedNeighborhoodIds.length}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="start">
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {neighborhoods.length === 0 && (
                  <p className="text-sm text-muted-foreground">No hay barrios cargados.</p>
                )}
                {neighborhoods.map((n) => {
                  const checked = selectedNeighborhoodIds.includes(n.id);
                  return (
                    <label key={n.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => toggleNeighborhood(n.id, Boolean(c))}
                      />
                      <span>{n.name}</span>
                    </label>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>Etiquetas</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start gap-2" type="button">
                <Filter className="size-4" />
                Tags
                {selectedTagIds.length > 0 && (
                  <Badge variant="secondary">{selectedTagIds.length}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="start">
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {tags.length === 0 && (
                  <p className="text-sm text-muted-foreground">No hay etiquetas cargadas.</p>
                )}
                {tags.map((t) => {
                  const checked = selectedTagIds.includes(t.id);
                  return (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => toggleTag(t.id, Boolean(c))}
                      />
                      <span>{t.name}</span>
                    </label>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="invite-msg">Mensaje *</Label>
        <Textarea
          id="invite-msg"
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder="Texto del mensaje de invitación (máx. 1024 caracteres)"
          rows={4}
          maxLength={1024}
          disabled={disabled}
        />
        <p className="text-[10px] text-muted-foreground text-right">{message.length}/1024</p>
      </div>

      <Button
        type="button"
        disabled={!canSend || loading}
        onClick={onSend}
        className="w-full gap-2 sm:w-auto"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Enviar invitaciones
      </Button>
    </div>
  );
}
