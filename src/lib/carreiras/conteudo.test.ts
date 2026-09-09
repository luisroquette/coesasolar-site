import { describe, expect, it } from 'vitest';
import { normalizarDiferenciais, normalizarItensConteudo, normalizarTexto } from './conteudo';

describe('conteúdo público da vaga', () => {
  it('remove cabeçalho repetido e marcadores sem alterar o texto', () => {
    expect(normalizarItensConteudo(['💻 *O que você fará:*', '* Criar agentes', '- Revisar código']))
      .toEqual(['Criar agentes', 'Revisar código']);
  });

  it('remove marcador de citação do pitch', () => {
    expect(normalizarTexto('> Construa soluções reais')).toBe('Construa soluções reais');
  });

  it('encerra diferenciais antes da seção duplicada e remove CTA de currículo', () => {
    expect(normalizarDiferenciais([
      'Projetos próprios também serão considerados.',
      '💼 Remuneração e benefícios',
      'Remuneração compatível com a posição',
      '📩 Envie seu currículo + portfólio para: contato@coesaenergia.com.br',
    ])).toEqual(['Projetos próprios também serão considerados.']);
    expect(normalizarItensConteudo(['Envie seu currículo para contato@coesaenergia.com.br'])).toEqual([]);
  });
});
