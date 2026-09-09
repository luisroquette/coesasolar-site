import { describe, expect, it } from 'vitest';
import { normalizarItensConteudo, normalizarTexto } from './conteudo';

describe('conteúdo público da vaga', () => {
  it('remove cabeçalho repetido e marcadores sem alterar o texto', () => {
    expect(normalizarItensConteudo(['💻 *O que você fará:*', '* Criar agentes', '- Revisar código']))
      .toEqual(['Criar agentes', 'Revisar código']);
  });

  it('remove marcador de citação do pitch', () => {
    expect(normalizarTexto('> Construa soluções reais')).toBe('Construa soluções reais');
  });
});
