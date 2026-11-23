import { buildPageTokens } from '@/components/tickets/TicketPaginationBar';
import { describe, expect, it } from 'vitest';

describe('buildPageTokens', () => {
  it('lista todas las páginas cuando entran sin elipsis', () => {
    expect(buildPageTokens(1, 3)).toEqual([1, 2, 3]);
    expect(buildPageTokens(2, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('colapsa solo la derecha al inicio del recorrido', () => {
    expect(buildPageTokens(1, 15)).toEqual([1, 2, 3, 'ellipsis-right', 15]);
    expect(buildPageTokens(2, 15)).toEqual([1, 2, 3, 'ellipsis-right', 15]);
  });

  it('incluye la página actual cuando la ventana toca el inicio', () => {
    expect(buildPageTokens(4, 15)).toEqual([1, 2, 3, 4, 5, 'ellipsis-right', 15]);
  });

  it('colapsa solo la izquierda al final del recorrido', () => {
    expect(buildPageTokens(15, 15)).toEqual([1, 'ellipsis-left', 13, 14, 15]);
  });

  it('colapsa ambos extremos en el medio', () => {
    expect(buildPageTokens(7, 15)).toEqual([1, 'ellipsis-left', 6, 7, 8, 'ellipsis-right', 15]);
  });

  it('respeta siblings para ventanas más anchas', () => {
    expect(buildPageTokens(10, 20, 2)).toEqual([
      1,
      'ellipsis-left',
      8,
      9,
      10,
      11,
      12,
      'ellipsis-right',
      20,
    ]);
  });

  it('nunca renderiza una elipsis que oculta una sola página', () => {
    // Con 8 páginas y current=2 el salto es de 2 páginas: la elipsis es válida.
    expect(buildPageTokens(2, 8)).toEqual([1, 2, 3, 'ellipsis-right', 8]);
  });

  it('devuelve vacío para entradas inválidas', () => {
    expect(buildPageTokens(0, 10)).toEqual([]);
    expect(buildPageTokens(11, 10)).toEqual([]);
    expect(buildPageTokens(1, 0)).toEqual([]);
  });
});
