import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VariableEditor, transformLines } from './VariableEditor';

afterEach(() => {
  vi.useRealTimers();
});
function Harness({
  initial = '',
  mode = 'NAMED',
  onVariable = vi.fn(),
  onRename = vi.fn(),
}: {
  initial?: string;
  mode?: 'NAMED' | 'POSITIONAL';
  onVariable?: (key: string) => void;
  onRename?: (oldKey: string, newKey: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <VariableEditor
        value={value}
        onChange={setValue}
        onBlur={vi.fn()}
        onVariable={onVariable}
        onRenameVariable={onRename}
        parameterFormat={mode}
        onInsertVariable={() => '{{1}}'}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}
function selectText(root: HTMLElement, start: number, end = start) {
  const range = document.createRange();
  range.setStart(root.firstChild!, start);
  range.setEnd(root.firstChild!, end);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}
describe('named variables', () => {
  it('inserts a temporary marker inline and only saves a valid name', () => {
    render(<Harness initial="Hola " />);
    const body = screen.getByRole('textbox', { name: 'Cuerpo' });
    selectText(body, 5);
    fireEvent.click(screen.getByRole('button', { name: 'Insertar variable' }));
    expect(body.textContent).toBe('Hola {{}}');
    expect(screen.getByTestId('value')).toHaveTextContent('Hola');
    const input = screen.getByRole('textbox', { name: 'Nombre de variable inline' });
    fireEvent.input(input, { target: { value: 'nombre' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('value')).toHaveTextContent('Hola {{nombre}}');
  });
  it('cancels empty insertion and Escape without persisting braces', () => {
    render(<Harness initial="Hola " />);
    fireEvent.click(screen.getByRole('button', { name: 'Insertar variable' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Nombre de variable inline' }), {
      key: 'Escape',
    });
    expect(screen.getByTestId('value')).toHaveTextContent('Hola');
    expect(screen.getByRole('textbox', { name: 'Cuerpo' }).textContent).toBe('Hola ');
  });
  it('edits with one click, migrates each occurrence, and rejects invalid names', () => {
    vi.useFakeTimers();
    const onRename = vi.fn();
    render(<Harness initial="{{nombre}} y {{nombre}}" onRename={onRename} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar {{nombre}}' })[0]);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const input = screen.getByRole('textbox', { name: 'Nombre de variable inline' });
    fireEvent.input(input, { target: { value: '9mal' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).not.toHaveBeenCalled();
    fireEvent.input(input, { target: { value: 'ciudadano' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('nombre', 'ciudadano');
    expect(screen.getByTestId('value').textContent).toBe('{{ciudadano}} y {{ciudadano}}');
  });
  it('uses double click or Alt+Enter for the example without editing the name', () => {
    vi.useFakeTimers();
    const onVariable = vi.fn();
    render(<Harness initial="{{nombre}}" onVariable={onVariable} />);
    const badge = screen.getByRole('button', { name: 'Editar {{nombre}}' });
    fireEvent.click(badge);
    fireEvent.doubleClick(badge);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onVariable).toHaveBeenCalledWith('nombre');
    expect(screen.queryByRole('textbox', { name: 'Nombre de variable inline' })).toBeNull();
    fireEvent.keyDown(badge, { key: 'Enter', altKey: true });
    expect(onVariable).toHaveBeenCalledTimes(2);
  });
  it('preserves positional tokens and accesses their example', () => {
    const onVariable = vi.fn();
    render(<Harness mode="POSITIONAL" onVariable={onVariable} />);
    fireEvent.click(screen.getByRole('button', { name: 'Insertar variable' }));
    expect(screen.getByTestId('value')).toHaveTextContent('{{1}}');
    fireEvent.click(screen.getByRole('button', { name: 'Muestra de {{1}}' }));
    expect(onVariable).toHaveBeenCalledWith('1');
  });
});
describe('emoji and toolbar', () => {
  it('searches categories and inserts a complete composed emoji at a selection', () => {
    render(<Harness initial="Hola {{nombre}}" />);
    fireEvent.click(screen.getByRole('button', { name: 'Insertar emoji' }));
    expect(screen.getByRole('dialog', { name: 'Selector de emojis' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Personas' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar emoji' }), {
      target: { value: 'woman technologist: medium skin tone' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Insertar 👩🏽‍💻' }));
    expect(screen.getByTestId('value').textContent).toContain('👩🏽‍💻');
    expect(screen.getByTestId('value').textContent).toContain('{{nombre}}');
  });
  it('replaces selected text with an emoji while preserving adjacent variables', () => {
    render(<Harness initial="Hola {{nombre}}" />);
    const body = screen.getByRole('textbox', { name: 'Cuerpo' });
    selectText(body, 0, 4);
    fireEvent.click(screen.getByRole('button', { name: 'Insertar emoji' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insertar 😀' }));
    expect(screen.getByTestId('value').textContent).toBe('😀 {{nombre}}');
  });
  it('does not split an existing composed Unicode sequence at a caret offset', () => {
    render(<Harness initial="👩🏽‍💻!" />);
    const body = screen.getByRole('textbox', { name: 'Cuerpo' });
    selectText(body, 2);
    fireEvent.click(screen.getByRole('button', { name: 'Insertar emoji' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insertar 😀' }));
    expect(screen.getByTestId('value').textContent).toBe('👩🏽‍💻😀!');
  });
  it('toggles and switches list prefixes without duplication', () => {
    const original = 'Primera\nSegunda\nTercera';
    const ordered = transformLines(original, { start: 0, end: original.length }, 'ordered');
    expect(ordered.value).toBe('1. Primera\n2. Segunda\n3. Tercera');
    expect(transformLines(ordered.value, ordered.selection, 'ordered').value).toBe(original);
    const unordered = transformLines(ordered.value, ordered.selection, 'unordered');
    expect(unordered.value).toBe('- Primera\n- Segunda\n- Tercera');
    expect(transformLines('> Hola', { start: 0, end: 6 }, 'quote').value).toBe('Hola');
    const caret = transformLines('Hola', { start: 2, end: 2 }, 'quote');
    expect(caret).toEqual({ value: '> Hola', selection: { start: 4, end: 4 } });
  });
  it('uses WhatsApp delimiters for inline formatting and toggles them', () => {
    render(<Harness initial="Hola" />);
    const body = screen.getByRole('textbox', { name: 'Cuerpo' });
    selectText(body, 0, 4);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar tachado' }));
    expect(screen.getByTestId('value').textContent).toBe('~Hola~');
    selectText(body, 0, 6);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar tachado' }));
    expect(screen.getByTestId('value').textContent).toBe('Hola');
    selectText(body, 0, 4);
    fireEvent.click(screen.getByRole('button', { name: 'Insertar código' }));
    expect(screen.getByTestId('value').textContent).toBe('```Hola```');
  });
});
