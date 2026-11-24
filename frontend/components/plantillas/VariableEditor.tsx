'use client';
import { Code2, Italic, List, ListOrdered, Quote, Smile, Strikethrough } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import emojiCatalog from '@/lib/plantillas/emoji-catalog.json';

type SelectionOffsets = { start: number; end: number };
type Draft = { key: string; start: number; end: number; fresh: boolean };
const namePattern = /^[a-z][a-z0-9_]*$/;
const groups = [...new Set(emojiCatalog.map((item) => item[2]))];
const groupNames: Record<string, string> = {
  'Smileys & Emotion': 'Caras',
  'People & Body': 'Personas',
  'Animals & Nature': 'Naturaleza',
  'Food & Drink': 'Comida',
  'Travel & Places': 'Viajes',
  Activities: 'Actividades',
  Objects: 'Objetos',
  Symbols: 'Símbolos',
  Flags: 'Banderas',
};
const searchAliases: Record<string, string> = {
  sonrisa: 'smile',
  corazon: 'heart',
  corazón: 'heart',
  mano: 'hand',
  gato: 'cat',
  perro: 'dog',
  comida: 'food',
  fiesta: 'party',
  bandera: 'flag',
  mujer: 'woman',
  hombre: 'man',
};

export function transformLines(
  value: string,
  offsets: SelectionOffsets,
  kind: 'ordered' | 'unordered' | 'quote',
) {
  const start = offsets.start === 0 ? 0 : value.lastIndexOf('\n', offsets.start - 1) + 1;
  const last =
    offsets.end > offsets.start && value[offsets.end - 1] === '\n' ? offsets.end - 1 : offsets.end;
  const endIndex = value.indexOf('\n', last);
  const end = endIndex < 0 ? value.length : endIndex;
  const lines = value.slice(start, end).split('\n');
  const prefix = kind === 'ordered' ? /^\d+\. / : kind === 'unordered' ? /^- / : /^> /;
  const anyPrefix = /^(?:\d+\. |- |> )/;
  const remove =
    lines.filter(Boolean).length > 0 && lines.filter(Boolean).every((line) => prefix.test(line));
  let number = 0;
  const updatedLines = lines.map((line) => {
    if (!line) return line;
    const bare = line.replace(anyPrefix, '');
    return remove
      ? bare
      : `${kind === 'ordered' ? `${++number}. ` : kind === 'unordered' ? '- ' : '> '}${bare}`;
  });
  const updated = updatedLines.join('\n');
  const next = value.slice(0, start) + updated + value.slice(end);
  const mapPoint = (point: number) => {
    if (point > end) return point + updated.length - (end - start);
    let oldAt = start;
    let newAt = start;
    for (let i = 0; i < lines.length; i++) {
      const oldLine = lines[i];
      const newLine = updatedLines[i];
      if (point <= oldAt + oldLine.length) {
        const oldPrefix = oldLine.match(anyPrefix)?.[0].length ?? 0;
        const newPrefix = newLine.match(anyPrefix)?.[0].length ?? 0;
        return newAt + newPrefix + Math.max(0, point - oldAt - oldPrefix);
      }
      oldAt += oldLine.length + 1;
      newAt += newLine.length + 1;
    }
    return start + updated.length;
  };
  return { value: next, selection: { start: mapPoint(offsets.start), end: mapPoint(offsets.end) } };
}

/** Plain text is the source of truth; badges and inline inputs only decorate it. */
export function VariableEditor({
  value,
  onChange,
  onBlur,
  onVariable,
  onRenameVariable = () => undefined,
  onInsertVariable = () => undefined,
  parameterFormat = 'POSITIONAL',
  invalid = false,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  onVariable: (key: string) => void;
  onRenameVariable?: (oldKey: string, newKey: string) => void;
  onInsertVariable?: () => string | undefined;
  parameterFormat?: 'NAMED' | 'POSITIONAL';
  invalid?: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const draft = useRef<Draft | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionOffsets = useRef<SelectionOffsets | undefined>(undefined);
  const pendingSelection = useRef<SelectionOffsets | undefined>(undefined);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState('');
  const [emojiGroup, setEmojiGroup] = useState(groups[0]);
  const [visibleEmojiCount, setVisibleEmojiCount] = useState(120);
  useEffect(
    () => () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    },
    [],
  );
  const read = () => ref.current?.textContent?.replace(/\u200b/g, '') ?? '';
  const getSelectionOffsets = (): SelectionOffsets | undefined => {
    const root = ref.current;
    const selection = window.getSelection();
    if (!root || !selection?.rangeCount || !root.contains(selection.anchorNode))
      return selectionOffsets.current;
    const range = selection.getRangeAt(0);
    const before = range.cloneRange();
    before.selectNodeContents(root);
    before.setEnd(range.startContainer, range.startOffset);
    const after = range.cloneRange();
    after.selectNodeContents(root);
    after.setEnd(range.endContainer, range.endOffset);
    return { start: before.toString().length, end: after.toString().length };
  };
  const rememberSelection = () => {
    selectionOffsets.current = getSelectionOffsets();
  };
  const restoreSelection = (offsets: SelectionOffsets) => {
    const root = ref.current;
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let startPoint: { node: Text; offset: number } | undefined;
    let endPoint: { node: Text; offset: number } | undefined;
    let consumed = 0;
    let node = walker.nextNode() as Text | null;
    while (node) {
      const length = node.textContent?.length ?? 0;
      if (!startPoint && offsets.start >= consumed && offsets.start <= consumed + length)
        startPoint = { node, offset: offsets.start - consumed };
      if (!endPoint && offsets.end >= consumed && offsets.end <= consumed + length)
        endPoint = { node, offset: offsets.end - consumed };
      consumed += length;
      node = walker.nextNode() as Text | null;
    }
    const range = document.createRange();
    if (startPoint && endPoint) {
      range.setStart(startPoint.node, startPoint.offset);
      range.setEnd(endPoint.node, endPoint.offset);
    } else {
      range.selectNodeContents(root);
      range.collapse(false);
    }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };
  const renderTokens = () => {
    const root = ref.current;
    if (!root || draft.current) return;
    const fragment = document.createDocumentFragment();
    for (const part of value.split(/(\{\{[^{}]+\}\})/g)) {
      if (/^\{\{[^{}]+\}\}$/.test(part)) {
        const badge = document.createElement('span');
        badge.textContent = part;
        badge.contentEditable = 'false';
        badge.dataset.variable = part.slice(2, -2);
        badge.className = 'rounded bg-primary/10 text-primary px-1 cursor-pointer';
        badge.setAttribute('role', 'button');
        badge.tabIndex = 0;
        badge.setAttribute(
          'aria-label',
          `${parameterFormat === 'NAMED' ? 'Editar' : 'Muestra de'} ${part}`,
        );
        badge.setAttribute('aria-keyshortcuts', 'Enter Alt+Enter F2');
        fragment.append(badge);
      } else fragment.append(document.createTextNode(part));
    }
    root.replaceChildren(fragment);
    if (pendingSelection.current) {
      root.focus();
      restoreSelection(pendingSelection.current);
      selectionOffsets.current = pendingSelection.current;
      pendingSelection.current = undefined;
    }
  };
  useLayoutEffect(() => {
    renderTokens();
    // DOM decoration only changes when the canonical text or variable mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, parameterFormat]);
  const updateValue = (nextValue: string, nextSelection: SelectionOffsets) => {
    pendingSelection.current = nextSelection;
    selectionOffsets.current = nextSelection;
    onChange(nextValue);
  };
  const safeInsertion = (offsets: SelectionOffsets): SelectionOffsets => {
    for (const match of value.matchAll(/\{\{[^{}]+\}\}/g)) {
      const start = match.index;
      const end = start + match[0].length;
      if (
        (offsets.start < end && offsets.end > start) ||
        (offsets.start > start && offsets.start < end) ||
        (offsets.end > start && offsets.end < end)
      )
        return { start: end, end };
    }
    const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)];
    const boundary = (point: number, forward: boolean) => {
      const inside = segments.find(
        ({ index, segment }) => index < point && point < index + segment.length,
      );
      return inside ? inside.index + (forward ? inside.segment.length : 0) : point;
    };
    return offsets.start === offsets.end
      ? { start: boundary(offsets.start, true), end: boundary(offsets.end, true) }
      : { start: boundary(offsets.start, false), end: boundary(offsets.end, true) };
  };
  const insert = (text: string) => {
    const offsets = safeInsertion(
      getSelectionOffsets() ?? { start: value.length, end: value.length },
    );
    updateValue(`${value.slice(0, offsets.start)}${text}${value.slice(offsets.end)}`, {
      start: offsets.start + text.length,
      end: offsets.start + text.length,
    });
  };
  const toggleFormat = (mark: string) => {
    const offsets = getSelectionOffsets();
    if (!offsets || offsets.start === offsets.end) return;
    const selected = value.slice(offsets.start, offsets.end);
    if (selected.startsWith(mark) && selected.endsWith(mark) && selected.length > mark.length * 2) {
      const bare = selected.slice(mark.length, -mark.length);
      updateValue(value.slice(0, offsets.start) + bare + value.slice(offsets.end), {
        start: offsets.start,
        end: offsets.start + bare.length,
      });
    } else if (
      value.slice(offsets.start - mark.length, offsets.start) === mark &&
      value.slice(offsets.end, offsets.end + mark.length) === mark
    ) {
      updateValue(
        value.slice(0, offsets.start - mark.length) +
          selected +
          value.slice(offsets.end + mark.length),
        { start: offsets.start - mark.length, end: offsets.end - mark.length },
      );
    } else {
      updateValue(
        value.slice(0, offsets.start) + mark + selected + mark + value.slice(offsets.end),
        { start: offsets.start + mark.length, end: offsets.end + mark.length },
      );
    }
  };
  const lineFormat = (kind: 'ordered' | 'unordered' | 'quote') => {
    const offsets = getSelectionOffsets() ?? { start: value.length, end: value.length };
    const result = transformLines(value, offsets, kind);
    updateValue(result.value, result.selection);
  };
  const preserveSelection = (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault();
  const nodeStart = (node: Node) => {
    const range = document.createRange();
    range.selectNodeContents(ref.current!);
    range.setEndBefore(node);
    return range.toString().length;
  };
  const cancelDraft = () => {
    draft.current = null;
    renderTokens();
  };
  const commitDraft = (input: HTMLInputElement) => {
    const editing = draft.current;
    if (!editing) return;
    const name = input.value.trim();
    if (!namePattern.test(name) || (name !== editing.key && value.includes(`{{${name}}}`))) {
      if (editing.fresh) cancelDraft();
      else {
        input.setCustomValidity(
          'Usa minúsculas, números y guiones bajos; el nombre debe ser único',
        );
        input.reportValidity();
        input.focus();
      }
      return;
    }
    draft.current = null;
    if (editing.fresh) {
      updateValue(value.slice(0, editing.start) + `{{${name}}}` + value.slice(editing.end), {
        start: editing.start + name.length + 4,
        end: editing.start + name.length + 4,
      });
    } else if (editing.key !== name) {
      onRenameVariable(editing.key, name);
      const next = value.replaceAll(`{{${editing.key}}}`, `{{${name}}}`);
      updateValue(next, {
        start: editing.start + name.length + 4,
        end: editing.start + name.length + 4,
      });
    } else renderTokens();
  };
  const createDraftInput = (container: HTMLElement, editing: Draft) => {
    const input = document.createElement('input');
    input.value = editing.key;
    input.setAttribute('aria-label', 'Nombre de variable inline');
    input.setAttribute('pattern', '[a-z][a-z0-9_]*');
    input.className =
      'w-28 max-w-[40vw] rounded border bg-background px-1 text-foreground outline-none focus:ring-2 focus:ring-ring';
    input.addEventListener('input', (event) => {
      event.stopPropagation();
      input.setCustomValidity('');
    });
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.isComposing) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        commitDraft(input);
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelDraft();
      }
    });
    input.addEventListener('blur', () => {
      if (draft.current === editing) commitDraft(input);
    });
    container.replaceChildren(document.createTextNode('{{'), input, document.createTextNode('}}'));
    input.focus();
    input.select();
  };
  const editBadge = (badge: HTMLElement) => {
    if (disabled || parameterFormat !== 'NAMED' || draft.current) return;
    const key = badge.dataset.variable!;
    const start = nodeStart(badge);
    const editing = { key, start, end: start + key.length + 4, fresh: false };
    draft.current = editing;
    createDraftInput(badge, editing);
  };
  const insertNamed = () => {
    if (draft.current) return;
    const offsets = safeInsertion(
      getSelectionOffsets() ?? { start: value.length, end: value.length },
    );
    const editing = { key: '', start: offsets.start, end: offsets.end, fresh: true };
    draft.current = editing;
    // A temporary {{}} marker lives only in the editable DOM until a valid name is confirmed.
    const marker = document.createElement('span');
    marker.contentEditable = 'false';
    marker.className = 'rounded bg-primary/10 text-primary px-1';
    const range =
      window.getSelection()?.rangeCount &&
      ref.current?.contains(window.getSelection()?.anchorNode ?? null)
        ? window.getSelection()!.getRangeAt(0)
        : null;
    if (range) {
      range.deleteContents();
      range.insertNode(marker);
    } else ref.current?.append(marker);
    createDraftInput(marker, editing);
  };
  const shown = emojiCatalog.filter(([emoji, name, group]) => {
    const query = emojiQuery.trim().toLocaleLowerCase();
    return !query
      ? group === emojiGroup
      : `${emoji} ${name}`.toLowerCase().includes(searchAliases[query] ?? query);
  });
  return (
    <div className="overflow-visible rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring">
      <div
        className="flex flex-wrap items-center gap-1 border-b bg-muted/40 p-2"
        role="toolbar"
        aria-label="Formato del cuerpo"
      >
        <Button
          type="button"
          size="icon"
          variant="ghost"
          title="Aplicar negrita"
          aria-label="Aplicar negrita"
          disabled={disabled}
          onMouseDown={preserveSelection}
          onClick={() => toggleFormat('*')}
        >
          <strong>B</strong>
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          title="Aplicar cursiva"
          aria-label="Aplicar cursiva"
          disabled={disabled}
          onMouseDown={preserveSelection}
          onClick={() => toggleFormat('_')}
        >
          <Italic />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          title="Insertar código"
          aria-label="Insertar código"
          disabled={disabled}
          onMouseDown={preserveSelection}
          onClick={() => toggleFormat('```')}
        >
          <Code2 />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          title="Aplicar tachado"
          aria-label="Aplicar tachado"
          disabled={disabled}
          onMouseDown={preserveSelection}
          onClick={() => toggleFormat('~')}
        >
          <Strikethrough />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          title="Lista numerada"
          aria-label="Lista numerada"
          disabled={disabled}
          onMouseDown={preserveSelection}
          onClick={() => lineFormat('ordered')}
        >
          <ListOrdered />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          title="Lista desordenada"
          aria-label="Lista desordenada"
          disabled={disabled}
          onMouseDown={preserveSelection}
          onClick={() => lineFormat('unordered')}
        >
          <List />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          title="Cita"
          aria-label="Cita"
          disabled={disabled}
          onMouseDown={preserveSelection}
          onClick={() => lineFormat('quote')}
        >
          <Quote />
        </Button>
        <div className="relative">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="Insertar emoji"
            aria-label="Insertar emoji"
            aria-expanded={emojiPickerOpen}
            disabled={disabled}
            onMouseDown={preserveSelection}
            onClick={() => {
              rememberSelection();
              setEmojiPickerOpen((open) => !open);
            }}
          >
            <Smile />
          </Button>
          {emojiPickerOpen && (
            <div
              role="dialog"
              aria-label="Selector de emojis"
              className="absolute left-0 z-50 mt-1 w-[min(90vw,22rem)] rounded-md border bg-popover p-2 shadow-lg"
            >
              <input
                aria-label="Buscar emoji"
                placeholder="Buscar emoji"
                value={emojiQuery}
                onChange={(event) => {
                  setEmojiQuery(event.target.value);
                  setVisibleEmojiCount(120);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setEmojiPickerOpen(false);
                    ref.current?.focus();
                  }
                }}
                className="mb-2 w-full rounded border bg-background px-2 py-1 text-sm"
              />
              <div
                role="tablist"
                aria-label="Categorías de emoji"
                className="mb-2 flex gap-1 overflow-x-auto pb-1"
              >
                {groups.map((group) => (
                  <button
                    key={group}
                    type="button"
                    role="tab"
                    aria-selected={emojiGroup === group}
                    title={groupNames[group] ?? group}
                    aria-label={groupNames[group] ?? group}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                      event.preventDefault();
                      const next =
                        groups[
                          (groups.indexOf(group) +
                            (event.key === 'ArrowRight' ? 1 : groups.length - 1)) %
                            groups.length
                        ];
                      setEmojiGroup(next);
                      setEmojiQuery('');
                      setVisibleEmojiCount(120);
                      event.currentTarget.parentElement
                        ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                        [groups.indexOf(next)]?.focus();
                    }}
                    className="shrink-0 rounded px-2 py-1 text-xs hover:bg-muted aria-selected:bg-muted"
                    onClick={() => {
                      setEmojiGroup(group);
                      setEmojiQuery('');
                      setVisibleEmojiCount(120);
                    }}
                  >
                    {groupNames[group] ?? group}
                  </button>
                ))}
              </div>
              <div
                role="group"
                aria-label="Emojis"
                className="grid max-h-60 grid-cols-7 gap-1 overflow-y-auto sm:grid-cols-8"
              >
                {shown.slice(0, visibleEmojiCount).map(([emoji, name]) => (
                  <Button
                    key={emoji}
                    type="button"
                    size="icon"
                    variant="ghost"
                    title={name}
                    aria-label={`Insertar ${emoji}`}
                    onMouseDown={preserveSelection}
                    onClick={() => {
                      insert(emoji);
                      setEmojiPickerOpen(false);
                    }}
                  >
                    {emoji}
                  </Button>
                ))}
                {shown.length > visibleEmojiCount && (
                  <button
                    type="button"
                    className="col-span-full rounded p-2 text-sm text-primary hover:bg-muted"
                    onClick={() => setVisibleEmojiCount((count) => count + 120)}
                  >
                    Mostrar más emojis
                  </button>
                )}
              </div>
              {!shown.length && (
                <p className="py-4 text-center text-sm text-muted-foreground">Sin resultados</p>
              )}
            </div>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          title="Insertar variable"
          aria-label="Insertar variable"
          disabled={disabled}
          onMouseDown={preserveSelection}
          onClick={() => {
            if (parameterFormat === 'NAMED') insertNamed();
            else {
              const token = onInsertVariable();
              if (token) insert(token);
            }
          }}
        >
          # Variable
        </Button>
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-label="Cuerpo"
        aria-multiline="true"
        aria-invalid={invalid}
        aria-readonly={disabled}
        contentEditable={!disabled}
        suppressContentEditableWarning
        className="min-h-40 whitespace-pre-wrap break-words p-3 font-mono text-sm leading-7 outline-none"
        onInput={(event) => {
          if (draft.current || composing.current || event.target !== ref.current) return;
          rememberSelection();
          pendingSelection.current = selectionOffsets.current;
          onChange(read());
        }}
        onBlur={() => {
          rememberSelection();
          onBlur();
        }}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          rememberSelection();
          pendingSelection.current = selectionOffsets.current;
          onChange(read());
        }}
        onPaste={(event) => {
          event.preventDefault();
          if (!draft.current)
            insert(event.clipboardData.getData('text/plain').replace(/\r\n/g, '\n'));
        }}
        onDrop={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          const badge = (event.target as HTMLElement).closest<HTMLElement>('[data-variable]');
          if (badge && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            if (event.altKey || parameterFormat === 'POSITIONAL')
              onVariable(badge.dataset.variable!);
            else editBadge(badge);
          } else if (badge && event.key === 'F2') {
            event.preventDefault();
            onVariable(badge.dataset.variable!);
          } else if (event.key === 'Enter' && !event.nativeEvent.isComposing && !draft.current) {
            event.preventDefault();
            insert('\n');
          }
        }}
        onClick={(event) => {
          const badge = (event.target as HTMLElement).closest<HTMLElement>('[data-variable]');
          if (!badge || disabled) return;
          if (parameterFormat === 'POSITIONAL') {
            onVariable(badge.dataset.variable!);
            return;
          }
          if (clickTimer.current) clearTimeout(clickTimer.current);
          clickTimer.current = setTimeout(() => {
            clickTimer.current = null;
            editBadge(badge);
          }, 250);
        }}
        onDoubleClick={(event) => {
          const badge = (event.target as HTMLElement).closest<HTMLElement>('[data-variable]');
          if (!badge || disabled) return;
          if (clickTimer.current) clearTimeout(clickTimer.current);
          clickTimer.current = null;
          onVariable(badge.dataset.variable!);
        }}
      />
    </div>
  );
}
