'use client';

import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/shared/utils';
import { Smile } from 'lucide-react';
import { useMemo, useState } from 'react';

interface EmojiGroup {
  id: string;
  label: string;
  icon: string;
  emojis: string[];
}

const EMOJI_GROUPS: EmojiGroup[] = [
  {
    id: 'smileys',
    label: 'Caras',
    icon: '😊',
    emojis: [
      '😀',
      '😃',
      '😄',
      '😁',
      '😆',
      '😅',
      '😂',
      '🤣',
      '😊',
      '😇',
      '🙂',
      '😉',
      '😍',
      '🥰',
      '😘',
      '😗',
      '😋',
      '😛',
      '😜',
      '🤪',
      '😎',
      '🤩',
      '🥳',
      '😏',
      '😒',
      '😞',
      '😔',
      '😟',
      '😕',
      '🙁',
      '😣',
      '😖',
      '😫',
      '😩',
      '🥺',
      '😢',
      '😭',
      '😤',
      '😠',
      '😡',
      '🤬',
      '🤯',
      '😳',
      '🥵',
      '🥶',
      '😱',
      '😨',
      '😰',
      '🤗',
      '🤔',
      '🤭',
      '🤫',
      '😶',
      '😐',
      '😬',
      '🙄',
      '😮',
      '😲',
      '🥱',
      '😴',
      '🤤',
      '😪',
      '😵',
      '🥴',
      '🤢',
      '🤮',
      '🤧',
      '😷',
      '🤒',
      '🤕',
      '🤠',
      '😈',
    ],
  },
  {
    id: 'gestures',
    label: 'Gestos',
    icon: '👍',
    emojis: [
      '👍',
      '👎',
      '👏',
      '🙌',
      '🤝',
      '🙏',
      '✌️',
      '🤞',
      '🤟',
      '🤘',
      '👌',
      '🤌',
      '👈',
      '👉',
      '👆',
      '👇',
      '👋',
      '✋',
      '🖐️',
      '💪',
      '🫶',
      '❤️',
      '🧡',
      '💛',
      '💚',
      '💙',
      '💜',
      '🖤',
      '🤍',
      '💔',
      '💕',
      '💖',
      '✨',
      '⭐',
      '🔥',
      '✅',
      '❌',
      '🎉',
      '🎊',
      '💯',
    ],
  },
  {
    id: 'people',
    label: 'Personas',
    icon: '👤',
    emojis: [
      '👤',
      '👥',
      '🧑',
      '👨',
      '👩',
      '👴',
      '👵',
      '👶',
      '🧒',
      '👦',
      '👧',
      '👨‍💼',
      '👩‍💼',
      '👮',
      '👷',
      '🧑‍⚕️',
      '🧑‍🏫',
      '🙋',
      '💁',
      '🙇',
    ],
  },
  {
    id: 'nature',
    label: 'Naturaleza',
    icon: '🌿',
    emojis: [
      '🐶',
      '🐱',
      '🐭',
      '🐹',
      '🐰',
      '🦊',
      '🐻',
      '🐼',
      '🐨',
      '🐯',
      '🦁',
      '🐮',
      '🐷',
      '🐸',
      '🐵',
      '🐔',
      '🐧',
      '🐦',
      '🌸',
      '🌹',
      '🌻',
      '🌳',
      '🌲',
      '🌵',
      '🍀',
      '🌞',
      '🌙',
      '⭐',
      '☁️',
      '🌧️',
      '⛈️',
      '❄️',
    ],
  },
  {
    id: 'food',
    label: 'Comida',
    icon: '🌮',
    emojis: [
      '🍏',
      '🍎',
      '🍊',
      '🍋',
      '🍌',
      '🍉',
      '🍇',
      '🍓',
      '🥑',
      '🌶️',
      '🌽',
      '🌮',
      '🌯',
      '🍔',
      '🍟',
      '🍕',
      '🌭',
      '🥪',
      '🥗',
      '🍝',
      '🍜',
      '🍣',
      '🍰',
      '🎂',
      '🍪',
      '🍩',
      '☕',
      '🍵',
      '🍺',
      '🍷',
      '🥤',
      '💧',
    ],
  },
  {
    id: 'activity',
    label: 'Actividades',
    icon: '⚽',
    emojis: [
      '⚽',
      '🏀',
      '🏈',
      '⚾',
      '🎾',
      '🏐',
      '🏓',
      '⛳',
      '🎯',
      '🎮',
      '🎲',
      '🧩',
      '🎵',
      '🎶',
      '🎤',
      '🎧',
      '🎬',
      '🎨',
      '📚',
      '✈️',
      '🚗',
      '🚌',
      '🚲',
      '🏠',
      '🏢',
      '⛪',
      '🏥',
      '🏫',
    ],
  },
  {
    id: 'objects',
    label: 'Objetos',
    icon: '💡',
    emojis: [
      '💡',
      '📱',
      '💻',
      '⌨️',
      '📷',
      '📸',
      '🎥',
      '📞',
      '📎',
      '📄',
      '📁',
      '📌',
      '📍',
      '🔒',
      '🔑',
      '✉️',
      '📦',
      '📝',
      '📅',
      '⏰',
      '💰',
      '💳',
      '🛒',
      '🧰',
      '🔧',
      '🔨',
    ],
  },
  {
    id: 'symbols',
    label: 'Símbolos',
    icon: '🇲🇽',
    emojis: [
      '🇲🇽',
      '🏳️',
      '🏁',
      '🔔',
      '📢',
      '🗳️',
      '🏛️',
      '⚠️',
      '🚫',
      '✔️',
      '➕',
      '➖',
      '❓',
      '❗',
      '💬',
      '💭',
      '🕒',
      '📍',
      '➡️',
      '⬅️',
      '⬆️',
      '⬇️',
      '🔄',
      '♻️',
    ],
  },
];

interface EmojiPickerButtonProps {
  disabled?: boolean;
  onSelect: (emoji: string) => void;
}

export function EmojiPickerButton({ disabled, onSelect }: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(EMOJI_GROUPS[0].id);
  const [query, setQuery] = useState('');

  const visibleEmojis = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle) {
      const byLabel = EMOJI_GROUPS.filter((group) => group.label.toLowerCase().includes(needle));
      if (byLabel.length > 0) return byLabel.flatMap((group) => group.emojis);
      return EMOJI_GROUPS.flatMap((group) => group.emojis).filter((emoji) =>
        emoji.includes(query.trim()),
      );
    }
    return EMOJI_GROUPS.find((group) => group.id === category)?.emojis ?? [];
  }, [category, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground disabled:opacity-50 shrink-0"
          disabled={disabled}
          aria-label="Insertar emoji"
          aria-expanded={open}
        >
          <Smile className="size-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-[320px] p-0">
        <div className="border-b border-border p-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar emoji…"
            className="h-8 text-sm"
            aria-label="Buscar emoji"
          />
        </div>
        <ScrollArea className="h-52">
          <div className="grid grid-cols-8 gap-0.5 p-2" role="list" aria-label="Emojis">
            {visibleEmojis.map((emoji, index) => (
              <button
                key={`${emoji}-${index}`}
                type="button"
                className="flex size-9 items-center justify-center rounded-md text-xl leading-none hover:bg-muted"
                aria-label={emoji}
                onClick={() => onSelect(emoji)}
              >
                {emoji}
              </button>
            ))}
            {visibleEmojis.length === 0 && (
              <p className="col-span-8 px-2 py-6 text-center text-xs text-muted-foreground">
                Sin coincidencias
              </p>
            )}
          </div>
        </ScrollArea>
        {!query.trim() && (
          <div className="flex border-t border-border p-1" role="tablist" aria-label="Categorías">
            {EMOJI_GROUPS.map((group) => {
              const selected = group.id === category;
              return (
                <button
                  key={group.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={group.label}
                  className={cn(
                    'flex h-8 flex-1 items-center justify-center rounded-md text-base hover:bg-muted',
                    selected && 'bg-primary/10',
                  )}
                  onClick={() => setCategory(group.id)}
                >
                  {group.icon}
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
