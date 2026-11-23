'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Tag } from '@/lib/catalog-api';
import type { CitizenTagInfo } from '@/lib/citizens-api';
import { useState } from 'react';

interface CitizenTagsPanelProps {
  tags: CitizenTagInfo[];
  availableTags: Tag[];
  selectedCitizenIds?: string[];
  loading?: boolean;
  onAssignTag?: (tagId: string) => Promise<void>;
  onRemoveTag?: (tagId: string) => Promise<void>;
  onBulkAction?: (tagIds: string[], operation: 'assign' | 'remove') => Promise<void>;
}

export function CitizenTagsPanel({
  tags,
  availableTags,
  selectedCitizenIds = [],
  loading = false,
  onAssignTag,
  onRemoveTag,
  onBulkAction,
}: CitizenTagsPanelProps) {
  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [bulkSelectedTagIds, setBulkSelectedTagIds] = useState<string[]>([]);
  const [bulkOperation, setBulkOperation] = useState<'assign' | 'remove'>('assign');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tagging</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground mb-2">Etiquetas actuales</p>
          <div className="flex flex-wrap gap-2">
            {tags.length === 0 && (
              <span className="text-sm text-muted-foreground">Sin etiquetas</span>
            )}
            {tags.map((tag) => (
              <Badge key={tag.id} style={tag.color ? { borderColor: tag.color } : undefined}>
                {tag.name}
                {onRemoveTag && (
                  <button className="ml-2" onClick={() => void onRemoveTag(tag.id)}>
                    ×
                  </button>
                )}
              </Badge>
            ))}
          </div>
        </div>

        {onAssignTag && (
          <div className="flex gap-2">
            <Select value={selectedTagId} onValueChange={setSelectedTagId}>
              <SelectTrigger>
                <SelectValue placeholder="Asignar etiqueta" />
              </SelectTrigger>
              <SelectContent>
                {availableTags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!selectedTagId || loading}
              onClick={async () => {
                if (!selectedTagId) return;
                await onAssignTag(selectedTagId);
                setSelectedTagId('');
              }}
            >
              Asignar
            </Button>
          </div>
        )}

        {onBulkAction && (
          <div className="space-y-2 border rounded-xl p-3 bg-muted/20">
            <p className="text-sm font-medium">Asignación masiva</p>
            <p className="text-xs text-muted-foreground">
              Ciudadanos seleccionados: {selectedCitizenIds.length}
            </p>

            <div className="grid sm:grid-cols-2 gap-2">
              <Select
                value={bulkOperation}
                onValueChange={(value) => setBulkOperation(value as 'assign' | 'remove')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assign">Asignar</SelectItem>
                  <SelectItem value="remove">Remover</SelectItem>
                </SelectContent>
              </Select>

              <Button
                disabled={
                  selectedCitizenIds.length === 0 || bulkSelectedTagIds.length === 0 || loading
                }
                onClick={() => void onBulkAction(bulkSelectedTagIds, bulkOperation)}
              >
                Ejecutar acción masiva
              </Button>
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              {availableTags.map((tag) => {
                const checked = bulkSelectedTagIds.includes(tag.id);
                return (
                  <label key={tag.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => {
                        if (value) {
                          setBulkSelectedTagIds((prev) => [...prev, tag.id]);
                          return;
                        }
                        setBulkSelectedTagIds((prev) => prev.filter((id) => id !== tag.id));
                      }}
                    />
                    {tag.name}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
