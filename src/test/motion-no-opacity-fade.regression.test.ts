import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * REGRESSÃO: texto travado invisível quando a aba perde foco no meio do fade-in.
 *
 * framer-motion pausa animações (WAAPI/rAF) quando a aba fica em background —
 * uma interrupção nesse instante (troca de aba, notificação, captura de tela)
 * trava `opacity` no valor inicial pra sempre, porque `whileInView`/`animate`
 * com `once: true` nunca reavalia. Reproduzido ao vivo em coesasolar.com.br
 * (11/09/2026): título e parágrafo da seção "Economize sem complicação"
 * ficaram com opacity:0 permanente após um scroll real interrompido.
 *
 * Fix: nenhum motion prop (`initial`/`animate`/`whileInView`/`exit`) nestes
 * componentes anima `opacity` — mantém só slide/scale, que nunca torna o
 * texto ilegível mesmo se a transição travar no meio.
 */

const FILES_WITHOUT_OPACITY_FADE = [
  'src/components/home/SimulationForm.tsx',
  'src/components/home/CTASection.tsx',
  'src/components/home/PressSection.tsx',
  'src/components/home/HowItWorksSection.tsx',
  'src/components/home/AboutSection.tsx',
  'src/components/home/WhyChooseSection.tsx',
  'src/components/home/HomeNavbar.tsx',
  'src/components/home/FAQSection.tsx',
  'src/components/home/BenefitsSection.tsx',
  'src/components/home/EconomyCalculator.tsx',
  'src/components/home/HeroSection.tsx',
  'src/components/home/ThankYouModal.tsx',
  'src/components/proposta/ProjecaoEconomia.tsx',
  'src/components/home/PlansSection.tsx',
  'src/components/proposta/FABButton.tsx',
  'src/components/proposta/CadastroForm.tsx',
  'src/components/proposta/ProvaSocial.tsx',
  'src/components/proposta/ComoFunciona.tsx',
  'src/components/proposta/EconomiaDetalhes.tsx',
  'src/components/proposta/PropostaHero.tsx',
];

const MOTION_PROP_RE = /\b(initial|animate|whileInView|exit)=\{\{([^}]*)\}\}/g;

function motionPropsWithOpacity(source: string): string[] {
  const hits: string[] = [];
  for (const match of source.matchAll(MOTION_PROP_RE)) {
    const [full, , body] = match;
    if (/opacity\s*:/.test(body)) hits.push(full.trim());
  }
  return hits;
}

describe('REGRESSÃO: motion.div não anima opacity (texto trava invisível se a aba perder foco)', () => {
  for (const file of FILES_WITHOUT_OPACITY_FADE) {
    it(`${file} não tem opacity em initial/animate/whileInView/exit`, () => {
      const source = readFileSync(join(process.cwd(), file), 'utf-8');
      expect(motionPropsWithOpacity(source)).toEqual([]);
    });
  }

  it('caso positivo: slide/scale continua animado normalmente (sem opacity)', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/home/BenefitsSection.tsx'),
      'utf-8',
    );
    expect(source).toMatch(/initial=\{\{\s*x:\s*-30\s*\}\}/);
    expect(source).toMatch(/whileInView=\{\{\s*x:\s*0\s*\}\}/);
  });
});
