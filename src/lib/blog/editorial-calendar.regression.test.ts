// REGRESSÃO: calendário editorial — pauta planejada vence o seed; pauta enriquece o prompt.
import { describe, it, expect } from 'vitest';
import { pickPlannedKeyword, buildEditorialBriefSection, type EditorialBrief } from './editorial-calendar';

describe('REGRESSÃO: calendário editorial', () => {
  describe('pickPlannedKeyword', () => {
    const rows = [
      { keyword: 'pauta futura', scheduled_date: '2026-09-01', status: 'planned' },
      { keyword: 'pauta de hoje', scheduled_date: '2026-08-19', status: 'planned' },
      { keyword: 'pauta atrasada', scheduled_date: '2026-08-15', status: 'planned' },
      { keyword: 'já publicada', scheduled_date: '2026-08-18', status: 'published' },
      { keyword: 'pulada', scheduled_date: '2026-08-18', status: 'skipped' },
      { keyword: 'sem data', scheduled_date: null, status: 'planned' },
    ];
    const today = '2026-08-19';

    it('escolhe a pauta com a data mais antiga entre as elegíveis', () => {
      expect(pickPlannedKeyword(rows, today)).toBe('pauta atrasada');
    });

    it('ignora pautas publicadas e puladas', () => {
      const onlyPublished = [
        { keyword: 'x', scheduled_date: '2026-08-01', status: 'published' },
        { keyword: 'y', scheduled_date: '2026-08-01', status: 'skipped' },
      ];
      expect(pickPlannedKeyword(onlyPublished, today)).toBeNull();
    });

    it('ignora pauta com data futura', () => {
      const future = [
        { keyword: 'amanhã', scheduled_date: '2026-08-20', status: 'planned' },
      ];
      expect(pickPlannedKeyword(future, today)).toBeNull();
    });

    it('aceita pauta sem data (publica na próxima janela do cron)', () => {
      const undated = [
        { keyword: 'livre', scheduled_date: null, status: 'planned' },
      ];
      expect(pickPlannedKeyword(undated, today)).toBe('livre');
    });

    it('retorna null quando não há pauta planejada', () => {
      expect(pickPlannedKeyword([], today)).toBeNull();
    });
  });

  describe('buildEditorialBriefSection', () => {
    it('renderiza keywords relacionadas, concorrentes e pontos de atenção', () => {
      const brief: EditorialBrief = {
        relatedKeywords: ['custo de solução b2b', 'contrato b2b'],
        competitors: ['site-competidor.com'],
        attentionPoints: 'Citar o estudo de 2026 sobre reajuste de contratos.',
      };
      const section = buildEditorialBriefSection(brief);
      expect(section).toContain('## PAUTA DO CALENDÁRIO');
      expect(section).toContain('custo de solução b2b');
      expect(section).toContain('site-competidor.com');
      expect(section).toContain('reajuste de contratos');
    });

    it('omite campos vazios mas mantém os preenchidos', () => {
      const section = buildEditorialBriefSection({
        relatedKeywords: [],
        competitors: [],
        attentionPoints: 'Priorizar FAQ no fechamento.',
      });
      expect(section).toContain('Priorizar FAQ no fechamento');
      expect(section).not.toContain('Keywords relacionadas');
      expect(section).not.toContain('Concorrentes');
    });

    it('retorna vazio para brief nulo (keyword do seed)', () => {
      expect(buildEditorialBriefSection(null)).toBe('');
    });
  });
});
