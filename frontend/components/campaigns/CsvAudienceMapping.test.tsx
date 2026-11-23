import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VariableMapping } from './CsvAudienceMapping';
describe('VariableMapping', () => {
  it('switches a variable from static text to a selected data field', () => {
    const onChange = vi.fn();
    const props = {
      variables: [{ key: 'body.1', parameter: '1', component: 'BODY' }],
      fields: ['nombre', 'telefono'],
      onChange,
    };
    const { rerender } = render(
      <VariableMapping {...props} mappings={{ 'body.1': { mode: 'static', value: 'Hola' } }} />,
    );
    fireEvent.change(screen.getByLabelText('Origen del valor'), { target: { value: 'dynamic' } });
    expect(onChange).toHaveBeenLastCalledWith({ 'body.1': { mode: 'dynamic', field: '' } });
    rerender(
      <VariableMapping {...props} mappings={{ 'body.1': { mode: 'dynamic', field: '' } }} />,
    );
    fireEvent.change(screen.getByLabelText('Campo para {{1}}'), { target: { value: 'nombre' } });
    expect(onChange).toHaveBeenLastCalledWith({ 'body.1': { mode: 'dynamic', field: 'nombre' } });
  });
});
