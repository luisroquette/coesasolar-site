import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface FAQ {
  question: string;
  answer: string;
}

// FAQs padrão como fallback
const DEFAULT_FAQS: FAQ[] = [
  {
    question: "O que é energia solar por assinatura?",
    answer: "É um modelo onde você recebe energia de uma usina solar remota e paga um valor menor do que pagaria para a concessionária. Não precisa instalar nada na sua casa ou empresa - a economia vem direto na sua conta de luz.",
  },
  {
    question: "Preciso instalar painéis solares na minha casa?",
    answer: "Não! Esse é o diferencial da energia por assinatura. A energia é gerada em nossas usinas solares e os créditos são compensados na sua conta de luz. Você economiza sem nenhuma obra ou instalação.",
  },
  {
    question: "Quanto vou economizar na minha conta de luz?",
    answer: "A economia varia de 15% a 30% dependendo do seu consumo mensal. Quanto maior o consumo, maior o desconto. Faça uma simulação gratuita e descubra o valor exato para o seu caso.",
  },
  {
    question: "Existe algum custo de adesão ou mensalidade?",
    answer: "Não há custo de adesão nem mensalidade fixa. Você paga apenas pela energia que consome, sempre com desconto em relação à tarifa normal da concessionária.",
  },
  {
    question: "Qual é o prazo de contrato?",
    answer: "Nossos contratos têm duração de 5 anos, garantindo economia a longo prazo. Durante esse período, você tem a segurança de manter sua economia independente de aumentos nas tarifas.",
  },
  {
    question: "Como funciona o processo de adesão?",
    answer: "É 100% digital! Após fazer a simulação, você recebe uma proposta personalizada. Se aceitar, assina o contrato digitalmente e nós cuidamos de toda a parte técnica com a concessionária.",
  },
];

export function useFAQs() {
  const [faqs, setFaqs] = useState<FAQ[]>(DEFAULT_FAQS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFAQs() {
      try {
        // Tentar carregar FAQs das KB sources com type='faq'
        const { data, error } = await supabase
          .from('ai_agents')
          .select('kb_sources')
          .eq('agent_id', 'sofia')
          .eq('status', 'active')
          .single();

        if (error || !data?.kb_sources) {
          setFaqs(DEFAULT_FAQS);
          return;
        }

        const kbSources = Array.isArray(data.kb_sources) ? data.kb_sources : [];
        const faqSource = kbSources.find((kb: any) => kb.type === 'faq' || kb.name?.toLowerCase().includes('faq'));

        if (faqSource && typeof faqSource === 'object' && 'content' in faqSource && faqSource.content) {
          // Parsear FAQs do content (formato Q: ... A: ...)
          const parsedFaqs = parseFAQContent(String(faqSource.content));
          if (parsedFaqs.length > 0) {
            setFaqs(parsedFaqs);
            return;
          }
        }

        // Fallback para FAQs padrão
        setFaqs(DEFAULT_FAQS);
      } catch (err) {
        console.error('Erro ao carregar FAQs:', err);
        setFaqs(DEFAULT_FAQS);
      } finally {
        setLoading(false);
      }
    }

    loadFAQs();
  }, []);

  return { faqs, loading };
}

// Parseia content no formato "Q: pergunta\nA: resposta\n\n..."
function parseFAQContent(content: string): FAQ[] {
  const faqs: FAQ[] = [];
  const blocks = content.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    let question = '';
    let answer = '';

    for (const line of lines) {
      if (line.startsWith('Q:') || line.startsWith('P:')) {
        question = line.substring(2).trim();
      } else if (line.startsWith('A:') || line.startsWith('R:')) {
        answer = line.substring(2).trim();
      }
    }

    if (question && answer) {
      faqs.push({ question, answer });
    }
  }

  return faqs;
}
