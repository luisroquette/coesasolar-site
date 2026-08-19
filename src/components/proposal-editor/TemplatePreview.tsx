import { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { TemplatePage, CanvasElementData, A4_WIDTH, A4_HEIGHT } from './types';
import { cn } from '@/lib/utils';
import { usePlanosComerciais, convertToPlanoConfig } from '@/hooks/usePlanosComerciais';
import { calcularPropostaAssinante, formatCurrency, AssinanteInput } from '@/lib/calculations';

// Sample data for preview - Proposta Inicial
export const SAMPLE_PROPOSAL_DATA = {
  // Dados do cliente
  cliente_nome: 'João da Silva Santos',
  cliente_cidade: 'São Paulo',
  cliente_uf: 'SP',
  cliente_cpf_cnpj: '123.456.789-00',
  cliente_email: 'joao.silva@email.com',
  cliente_telefone: '(11) 99999-8888',
  
  // Economia e desconto
  desconto_percentual: '25',
  economia_mensal: 'R$ 50,57',
  economia_anual: 'R$ 606,90',
  economia_acumulada: 'R$ 1.951,12',
  economia_2_anos: 'R$ 1.820,79',
  economia_5_anos: 'R$ 3.034,50',
  
  // Valores comparativos
  valor_sem_coesa: 'R$ 272,80',
  valor_com_coesa: 'R$ 222,23',
  
  // Consumo e tarifas
  consumo_medio: '268',
  tarifa: 'R$ 0,8506',
  tarifa_coesa: 'R$ 0,6379',
  cip: 'R$ 45,00',
  disponibilidade: 'R$ 75,71',
  disponibilidade_kwh: '50',
  disponibilidade_valor: 'R$ 37,16',
  
  // Detalhes boleto concessionária
  tributos_concessionaria: 'R$ 15,58',
  total_concessionaria: 'R$ 86,60',
  
  // Detalhes boleto COESA
  energia_compensada_kwh: '218',
  valor_energia_coesa: 'R$ 136,35',
  taxa_bancaria: 'R$ 36,83',
  total_coesa: 'R$ 170,45',
  
  // Contrato
  fidelidade_anos: '3',
  fidelidade_meses: '36',
  numero_ucs: '1',
  concessionaria: 'CEMIG',
  tipo_instalacao: 'Monofásico',
  
  // Datas
  data_emissao: new Date().toLocaleDateString('pt-BR'),
  data_validade: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'),
  numero_proposta: 'PROP-2026-001234',
  
  // Links
  qr_url: 'https://wa.me/5511999998888?text=Olá!%20Tenho%20interesse%20na%20proposta.',
  qr_whatsapp: 'https://wa.me/5511999998888?text=Olá!%20Tenho%20interesse%20na%20proposta.',
  logo_coesa: '/logos/coesa-green.png',
};

// Interface para plano calculado
interface PlanoCalculado {
  id: string;
  nome: string;
  fidelidadeAnos: number;
  descontoPercentual: number;
  economiaMensal: number;
  economiaAcumulada: number;
  destaque?: boolean;
  unlock?: boolean;
}

interface TemplatePreviewProps {
  pages: TemplatePage[];
  currentPageIndex?: number;
  zoom?: number;
  showAllPages?: boolean;
  data?: Partial<typeof SAMPLE_PROPOSAL_DATA>;
}

export function TemplatePreview({
  pages,
  currentPageIndex = 0,
  zoom = 0.5,
  showAllPages = false,
  data = SAMPLE_PROPOSAL_DATA,
}: TemplatePreviewProps) {
  const mergedData = useMemo(() => ({ ...SAMPLE_PROPOSAL_DATA, ...data }), [data]);
  const { planos: planosDb, loading: planosLoading } = usePlanosComerciais();

  // Calcular economia para cada plano usando os dados de exemplo
  const planosCalculados: PlanoCalculado[] = useMemo(() => {
    if (planosLoading || planosDb.length === 0) {
      // Fallback estático
      return [
        { id: '1', nome: 'Plano Inicial', fidelidadeAnos: 3, descontoPercentual: 10, economiaMensal: 20.23, economiaAcumulada: 780.45 },
        { id: '2', nome: 'Plano Economia', fidelidadeAnos: 4, descontoPercentual: 12, economiaMensal: 24.28, economiaAcumulada: 1293.41, destaque: true },
        { id: '3', nome: 'Plano Premium', fidelidadeAnos: 5, descontoPercentual: 15, economiaMensal: 30.34, economiaAcumulada: 2094.07 },
        { id: '4', nome: 'Plano Master', fidelidadeAnos: 5, descontoPercentual: 18, economiaMensal: 36.41, economiaAcumulada: 2512.89, unlock: true },
      ];
    }

    // Usar dados reais do banco com cálculos
    const consumoMedio = parseInt(mergedData.consumo_medio) || 268;
    const tarifa = parseFloat(mergedData.tarifa.replace('R$ ', '').replace(',', '.')) || 0.8506;
    const cip = parseFloat(mergedData.cip.replace('R$ ', '').replace(',', '.')) || 45;
    const tipoInstalacao = mergedData.tipo_instalacao as 'Monofásico' | 'Bifásico' | 'Trifásico' || 'Monofásico';
    const numeroUcs = parseInt(mergedData.numero_ucs) || 1;

    return planosDb.map(plano => {
      const planoConfig = convertToPlanoConfig(plano);
      const input: AssinanteInput = {
        tarifa,
        cip,
        consumoMedio,
        fidelidadeAnos: planoConfig.fidelidadeAnos,
        descontoPercentual: planoConfig.descontoPercentual,
        tipoInstalacao,
        numeroUcs,
      };
      
      const resultado = calcularPropostaAssinante(input);
      
      return {
        id: plano.id,
        nome: plano.nome,
        fidelidadeAnos: plano.fidelidade_anos,
        descontoPercentual: plano.desconto_percentual,
        economiaMensal: resultado.economiaMensal,
        economiaAcumulada: resultado.economiaAcumulada,
        destaque: plano.destaque,
        unlock: plano.unlock,
      };
    });
  }, [planosDb, planosLoading, mergedData]);

  const replacePlaceholders = (content: string): string => {
    let result = content;
    Object.entries(mergedData).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    });
    return result;
  };

  const renderElement = (element: CanvasElementData) => {
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      left: element.x * zoom,
      top: element.y * zoom,
      width: element.width * zoom,
      height: element.height * zoom,
      transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
      opacity: element.style.opacity ?? 1,
    };

    switch (element.type) {
      case 'text':
        return (
          <div
            key={element.id}
            style={{
              ...baseStyle,
              fontSize: (element.style.fontSize || 16) * zoom,
              fontWeight: element.style.fontWeight || 'normal',
              fontFamily: element.style.fontFamily || 'inherit',
              color: element.style.color || '#000',
              backgroundColor: element.style.backgroundColor,
              borderRadius: element.style.borderRadius ? element.style.borderRadius * zoom : undefined,
              textAlign: element.style.textAlign || 'left',
              padding: element.style.padding ? element.style.padding * zoom : undefined,
              lineHeight: element.style.lineHeight || 1.4,
              overflow: 'hidden',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {replacePlaceholders(element.content)}
          </div>
        );

      case 'dynamic-field':
        const resolvedContent = replacePlaceholders(element.content);
        return (
          <div
            key={element.id}
            style={{
              ...baseStyle,
              fontSize: (element.style.fontSize || 14) * zoom,
              fontWeight: element.style.fontWeight || 'normal',
              color: element.style.color || '#1f2937',
              backgroundColor: 'transparent',
              borderRadius: element.style.borderRadius ? element.style.borderRadius * zoom : undefined,
              padding: element.style.padding ? element.style.padding * zoom : undefined,
              overflow: 'hidden',
            }}
          >
            {resolvedContent}
          </div>
        );

      case 'shape':
        return (
          <div
            key={element.id}
            style={{
              ...baseStyle,
              backgroundColor: element.style.backgroundColor || '#e5e7eb',
              borderRadius: element.content === 'circle' 
                ? '50%' 
                : element.style.borderRadius ? element.style.borderRadius * zoom : undefined,
              borderWidth: element.style.borderWidth ? element.style.borderWidth * zoom : undefined,
              borderColor: element.style.borderColor,
              borderStyle: element.style.borderWidth ? 'solid' : undefined,
            }}
          />
        );

      case 'image':
        return (
          <img
            key={element.id}
            src={element.content}
            alt=""
            style={{
              ...baseStyle,
              objectFit: 'cover',
              borderRadius: element.style.borderRadius ? element.style.borderRadius * zoom : undefined,
            }}
          />
        );

      case 'qr-code':
        const qrUrl = replacePlaceholders(element.content);
        return (
          <div
            key={element.id}
            style={{
              ...baseStyle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#fff',
              padding: 8 * zoom,
              borderRadius: 8 * zoom,
            }}
          >
            <QRCodeSVG
              value={qrUrl}
              size={Math.min(element.width, element.height) * zoom - 16 * zoom}
              level="M"
            />
          </div>
        );

      // Renderiza a seção de comparação de planos dinamicamente
      case 'plans-comparison':
        return renderPlansComparison(element, baseStyle);

      default:
        return null;
    }
  };

  // Renderiza a seção de comparação de planos
  const renderPlansComparison = (element: CanvasElementData, baseStyle: React.CSSProperties) => {
    const planoSelecionadoIndex = parseInt(mergedData.fidelidade_anos) === 3 ? 0 : 
                                   parseInt(mergedData.fidelidade_anos) === 4 ? 1 :
                                   parseInt(mergedData.fidelidade_anos) === 5 ? 2 : 0;
    const planoSelecionado = planosCalculados[planoSelecionadoIndex] || planosCalculados[0];

    return (
      <div
        key={element.id}
        style={{
          ...baseStyle,
          display: 'flex',
          flexDirection: 'column',
          padding: 12 * zoom,
          backgroundColor: '#fff',
          borderRadius: 12 * zoom,
        }}
      >
        {/* Banner Sofia */}
        <div style={{
          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          borderRadius: 12 * zoom,
          padding: `${10 * zoom}px ${16 * zoom}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16 * zoom,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 * zoom }}>
            <div style={{
              width: 36 * zoom,
              height: 36 * zoom,
              borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18 * zoom,
            }}>💬</div>
            <div>
              <div style={{ color: '#fff', fontSize: 12 * zoom, fontWeight: 'bold' }}>
                Economize {mergedData.economia_mensal}/mês
              </div>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 9 * zoom }}>
                Quer saber mais? Tire suas dúvidas com a sofIA!
              </div>
            </div>
          </div>
          <div style={{
            width: 28 * zoom,
            height: 28 * zoom,
            borderRadius: '50%',
            backgroundColor: 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 14 * zoom,
          }}>→</div>
        </div>

        {/* Título Compare os Planos */}
        <div style={{ textAlign: 'center', marginBottom: 12 * zoom }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: 6 * zoom,
            fontSize: 13 * zoom,
            fontWeight: 'bold',
            color: '#111827',
          }}>
            ✨ Compare os Planos
          </div>
          <div style={{ fontSize: 9 * zoom, color: '#6b7280', marginTop: 2 * zoom }}>
            Escolha o plano ideal para você e veja sua economia
          </div>
        </div>

        {/* Cards de Planos */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(planosCalculados.length, 4)}, 1fr)`,
          gap: 8 * zoom,
          marginBottom: 12 * zoom,
        }}>
          {planosCalculados.slice(0, 4).map((plano, index) => {
            const isSelected = plano.id === planoSelecionado?.id;
            const bgColor = plano.unlock ? '#faf5ff' : plano.destaque ? '#fffbeb' : '#f9fafb';
            const accentColor = plano.unlock ? '#9333ea' : plano.destaque ? '#f59e0b' : '#374151';
            
            return (
              <div
                key={plano.id}
                style={{
                  backgroundColor: bgColor,
                  borderRadius: 10 * zoom,
                  padding: 10 * zoom,
                  border: `${1 * zoom}px solid ${isSelected ? accentColor : '#e5e7eb'}`,
                  position: 'relative',
                }}
              >
                {/* Badge */}
                {(plano.destaque || plano.unlock) && (
                  <div style={{
                    position: 'absolute',
                    top: -6 * zoom,
                    right: 6 * zoom,
                    backgroundColor: plano.unlock ? '#9333ea' : '#f59e0b',
                    color: '#fff',
                    fontSize: 6 * zoom,
                    fontWeight: 'bold',
                    padding: `${2 * zoom}px ${6 * zoom}px`,
                    borderRadius: 6 * zoom,
                  }}>
                    {plano.unlock ? '🔓 UNLOCK' : '⭐ Popular'}
                  </div>
                )}

                {/* Fidelidade */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3 * zoom,
                  marginBottom: 6 * zoom,
                }}>
                  <span style={{ fontSize: 9 * zoom, color: '#6b7280' }}>⏱</span>
                  <span style={{ fontSize: 10 * zoom, fontWeight: 'bold', color: '#374151' }}>
                    {plano.fidelidadeAnos} {plano.fidelidadeAnos === 1 ? 'ano' : 'anos'}
                  </span>
                </div>

                {/* Desconto */}
                <div style={{
                  backgroundColor: plano.unlock ? '#f3e8ff' : plano.destaque ? '#fef3c7' : '#f3f4f6',
                  borderRadius: 8 * zoom,
                  padding: `${6 * zoom}px`,
                  textAlign: 'center',
                  marginBottom: 8 * zoom,
                }}>
                  <div style={{
                    fontSize: 18 * zoom,
                    fontWeight: 'bold',
                    color: accentColor,
                  }}>
                    {plano.descontoPercentual}%
                  </div>
                  <div style={{ fontSize: 7 * zoom, color: '#6b7280' }}>
                    de desconto
                  </div>
                </div>

                {/* Economia Mensal */}
                <div style={{ textAlign: 'center', marginBottom: 6 * zoom }}>
                  <div style={{ fontSize: 7 * zoom, color: '#6b7280' }}>Economia mensal</div>
                  <div style={{ fontSize: 11 * zoom, fontWeight: 'bold', color: '#111827' }}>
                    {formatCurrency(plano.economiaMensal)}
                  </div>
                </div>

                {/* Economia Total */}
                <div style={{
                  backgroundColor: '#f9fafb',
                  borderRadius: 6 * zoom,
                  padding: 6 * zoom,
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 6 * zoom, color: '#6b7280' }}>
                    Total em {plano.fidelidadeAnos} {plano.fidelidadeAnos === 1 ? 'ano' : 'anos'}
                  </div>
                  <div style={{ fontSize: 10 * zoom, fontWeight: 'bold', color: '#111827' }}>
                    {formatCurrency(plano.economiaAcumulada)}
                  </div>
                </div>

                {/* Círculo de seleção */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginTop: 8 * zoom,
                }}>
                  <div style={{
                    width: 14 * zoom,
                    height: 14 * zoom,
                    borderRadius: '50%',
                    border: `${1.5 * zoom}px solid ${isSelected ? '#10b981' : '#d1d5db'}`,
                    backgroundColor: isSelected ? '#10b981' : '#fff',
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Resumo do plano selecionado */}
        {planoSelecionado && (
          <div style={{
            background: planoSelecionado.unlock 
              ? 'linear-gradient(135deg, #9333ea 0%, #c026d3 100%)' 
              : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            borderRadius: 12 * zoom,
            padding: 12 * zoom,
            color: '#fff',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 8 * zoom, opacity: 0.9 }}>Plano selecionado</div>
                <div style={{ fontSize: 12 * zoom, fontWeight: 'bold' }}>
                  {planoSelecionado.fidelidadeAnos} anos com {planoSelecionado.descontoPercentual}% de desconto
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 8 * zoom, opacity: 0.9 }}>Sua economia mensal</div>
                <div style={{ fontSize: 16 * zoom, fontWeight: 'bold' }}>
                  {formatCurrency(planoSelecionado.economiaMensal)}
                </div>
              </div>
            </div>
            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.2)',
              marginTop: 8 * zoom,
              paddingTop: 8 * zoom,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 10 * zoom,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 * zoom }}>
                📈 Economia total no período:
              </div>
              <div style={{ fontWeight: 'bold', fontSize: 12 * zoom }}>
                {formatCurrency(planoSelecionado.economiaAcumulada)}
              </div>
            </div>
          </div>
        )}

        {/* CTA Button */}
        <div style={{
          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          borderRadius: 12 * zoom,
          padding: `${14 * zoom}px`,
          textAlign: 'center',
          marginTop: 12 * zoom,
        }}>
          <div style={{
            color: '#fff',
            fontSize: 13 * zoom,
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6 * zoom,
          }}>
            ⚡ Quero minha Proposta Definitiva →
          </div>
        </div>

        {/* Disclaimer */}
        <div style={{
          textAlign: 'center',
          marginTop: 8 * zoom,
          fontSize: 7 * zoom,
          color: '#6b7280',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4 * zoom,
        }}>
          ⏰ Garanta sua economia agora • Proposta válida por tempo limitado
        </div>
      </div>
    );
  };

  const pagesToRender = showAllPages ? pages : [pages[currentPageIndex]].filter(Boolean);

  return (
    <div className={cn('flex gap-4', showAllPages ? 'flex-wrap justify-center' : 'justify-center')}>
      {pagesToRender.map((page, index) => (
        <div
          key={page.id}
          className="relative bg-white shadow-lg"
          style={{
            width: A4_WIDTH * zoom,
            height: A4_HEIGHT * zoom,
            backgroundColor: page.backgroundColor || '#ffffff',
          }}
        >
          {showAllPages && (
            <div className="absolute -top-6 left-0 text-xs text-muted-foreground">
              Página {showAllPages ? index + 1 : currentPageIndex + 1}
            </div>
          )}
          {[...page.elements]
            .sort((a, b) => a.zIndex - b.zIndex)
            .map(renderElement)}
        </div>
      ))}
    </div>
  );
}
