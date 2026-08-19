import { TemplatePage, CanvasElementData, A4_WIDTH, A4_HEIGHT } from '@/components/proposal-editor/types';

/**
 * Template padrão para Proposta Inicial de Assinante
 * Baseado no layout real da proposta inicial pública
 * 
 * Estrutura A4: 794px x 1123px (210mm x 297mm @ 96 DPI)
 * 
 * PÁGINAS:
 * 1. Header + Disclaimer + Cliente + Estimativa de Economia + Comparativo Mensal + Economia Mensal + Composição da Conta
 * 2. Projeção de Economia + Compare os Planos + Footer com QR
 */

// Helper para criar elementos com IDs únicos usando timestamp + random
const createId = () => `el-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// Factory function to generate a fresh template with unique IDs each time
export function createDefaultInitialTemplate() {
  const generatePage1Elements = (): CanvasElementData[] => [
    // ========== HEADER VERDE ==========
    { id: createId(), type: 'shape', x: 0, y: 0, width: A4_WIDTH, height: 90, rotation: 0, style: { backgroundColor: '#059669', borderRadius: 0 }, content: 'rectangle', locked: false, zIndex: 1 },
    { id: createId(), type: 'shape', x: 30, y: 15, width: 50, height: 50, rotation: 0, style: { backgroundColor: '#ffffff', borderRadius: 10 }, content: 'rectangle', locked: false, zIndex: 2 },
    { id: createId(), type: 'text', x: 90, y: 22, width: 180, height: 28, rotation: 0, style: { fontSize: 20, fontWeight: 'bold', color: '#ffffff', textAlign: 'left' }, content: 'COESA Energia', locked: false, zIndex: 3 },
    { id: createId(), type: 'text', x: 90, y: 48, width: 200, height: 18, rotation: 0, style: { fontSize: 11, fontWeight: 'normal', color: '#d1fae5', textAlign: 'left' }, content: 'Energia Inteligente para você', locked: false, zIndex: 4 },
    { id: createId(), type: 'text', x: 560, y: 12, width: 180, height: 24, rotation: 0, style: { fontSize: 10, fontWeight: 'bold', color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, textAlign: 'center', padding: 5 }, content: 'PROPOSTA INICIAL', locked: false, zIndex: 5 },
    { id: createId(), type: 'text', x: 560, y: 38, width: 180, height: 20, rotation: 0, style: { fontSize: 9, fontWeight: 'semibold', color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, textAlign: 'center', padding: 4 }, content: '🛡️ Transparência Garantida', locked: false, zIndex: 6 },
    { id: createId(), type: 'dynamic-field', x: 580, y: 60, width: 180, height: 14, rotation: 0, style: { fontSize: 10, fontWeight: 'normal', color: '#d1fae5', textAlign: 'right' }, content: 'Emissão: {{data_emissao}}', locked: false, zIndex: 7 },
    { id: createId(), type: 'dynamic-field', x: 580, y: 74, width: 180, height: 14, rotation: 0, style: { fontSize: 10, fontWeight: 'semibold', color: '#ffffff', textAlign: 'right' }, content: 'Válida até: {{data_validade}}', locked: false, zIndex: 8 },

    // ========== DISCLAIMER AMARELO ==========
    { id: createId(), type: 'shape', x: 0, y: 90, width: A4_WIDTH, height: 55, rotation: 0, style: { backgroundColor: '#fbbf24', borderRadius: 0 }, content: 'rectangle', locked: false, zIndex: 10 },
    { id: createId(), type: 'text', x: 30, y: 100, width: 35, height: 35, rotation: 0, style: { fontSize: 24, textAlign: 'center', backgroundColor: '#92400e', color: '#ffffff', borderRadius: 20 }, content: '⚠️', locked: false, zIndex: 11 },
    { id: createId(), type: 'text', x: 75, y: 97, width: 680, height: 18, rotation: 0, style: { fontSize: 12, fontWeight: 'bold', color: '#78350f', textAlign: 'left' }, content: 'PROPOSTA COM DADOS ESTIMADOS', locked: false, zIndex: 12 },
    { id: createId(), type: 'text', x: 75, y: 115, width: 680, height: 25, rotation: 0, style: { fontSize: 9, fontWeight: 'normal', color: '#78350f', textAlign: 'left', lineHeight: 1.3 }, content: 'Esta proposta foi gerada automaticamente a partir do valor da conta de luz informado no sistema. O consumo e tipo de instalação foram inferidos. Para valores exatos, solicite dados adicionais ao cliente.', locked: false, zIndex: 13 },

    // ========== CARD DO CLIENTE ==========
    { id: createId(), type: 'shape', x: 20, y: 155, width: A4_WIDTH - 40, height: 60, rotation: 0, style: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' }, content: 'rectangle', locked: false, zIndex: 20 },
    { id: createId(), type: 'text', x: 35, y: 162, width: 60, height: 14, rotation: 0, style: { fontSize: 9, fontWeight: 'normal', color: '#6b7280', textAlign: 'left' }, content: 'CLIENTE', locked: false, zIndex: 21 },
    { id: createId(), type: 'dynamic-field', x: 35, y: 175, width: 400, height: 22, rotation: 0, style: { fontSize: 15, fontWeight: 'bold', color: '#111827', textAlign: 'left' }, content: '{{cliente_nome}}', locked: false, zIndex: 22 },
    { id: createId(), type: 'dynamic-field', x: 35, y: 195, width: 150, height: 16, rotation: 0, style: { fontSize: 10, fontWeight: 'normal', color: '#6b7280', textAlign: 'left' }, content: '{{cliente_telefone}}', locked: false, zIndex: 23 },
    { id: createId(), type: 'shape', x: 560, y: 162, width: 1, height: 45, rotation: 0, style: { backgroundColor: '#e5e7eb' }, content: 'line', locked: false, zIndex: 24 },
    { id: createId(), type: 'dynamic-field', x: 575, y: 165, width: 180, height: 16, rotation: 0, style: { fontSize: 9, fontWeight: 'normal', color: '#6b7280', textAlign: 'right' }, content: '{{concessionaria}}', locked: false, zIndex: 25 },
    { id: createId(), type: 'dynamic-field', x: 575, y: 182, width: 180, height: 18, rotation: 0, style: { fontSize: 11, fontWeight: 'semibold', color: '#374151', textAlign: 'right' }, content: '{{tipo_instalacao}} • {{numero_ucs}} UC(s)', locked: false, zIndex: 26 },

    // ========== HERO - ESTIMATIVA DE ECONOMIA ==========
    { id: createId(), type: 'shape', x: 20, y: 225, width: A4_WIDTH - 40, height: 95, rotation: 0, style: { backgroundColor: '#fef3c7', borderRadius: 16 }, content: 'rectangle', locked: false, zIndex: 30 },
    { id: createId(), type: 'text', x: 40, y: 240, width: 300, height: 26, rotation: 0, style: { fontSize: 20, fontWeight: 'bold', color: '#111827', textAlign: 'left' }, content: 'Estimativa de Economia', locked: false, zIndex: 31 },
    { id: createId(), type: 'text', x: 40, y: 264, width: 200, height: 22, rotation: 0, style: { fontSize: 18, fontWeight: 'bold', color: '#f59e0b', textAlign: 'left' }, content: 'Com Transparência', locked: false, zIndex: 32 },
    { id: createId(), type: 'text', x: 40, y: 290, width: 420, height: 22, rotation: 0, style: { fontSize: 9, fontWeight: 'normal', color: '#78350f', textAlign: 'left', lineHeight: 1.3 }, content: 'Esta é uma proposta inicial estimada. Os valores são aproximados e servem como base para uma análise mais detalhada.', locked: false, zIndex: 33 },
    { id: createId(), type: 'shape', x: 650, y: 232, width: 80, height: 80, rotation: 0, style: { backgroundColor: '#f59e0b', borderRadius: 40 }, content: 'circle', locked: false, zIndex: 34 },
    { id: createId(), type: 'dynamic-field', x: 652, y: 252, width: 76, height: 32, rotation: 0, style: { fontSize: 26, fontWeight: 'bold', color: '#ffffff', textAlign: 'center' }, content: '{{desconto_percentual}}%', locked: false, zIndex: 35 },
    { id: createId(), type: 'text', x: 652, y: 282, width: 76, height: 16, rotation: 0, style: { fontSize: 8, fontWeight: 'bold', color: '#ffffff', textAlign: 'center' }, content: 'DE DESCONTO', locked: false, zIndex: 36 },

    // ========== COMPARATIVO MENSAL ==========
    { id: createId(), type: 'text', x: 20, y: 332, width: 200, height: 18, rotation: 0, style: { fontSize: 11, fontWeight: 'bold', color: '#374151', textAlign: 'left' }, content: 'COMPARATIVO MENSAL', locked: false, zIndex: 40 },
    // Card Sem COESA
    { id: createId(), type: 'shape', x: 20, y: 352, width: 365, height: 90, rotation: 0, style: { backgroundColor: '#fef2f2', borderRadius: 12, borderWidth: 1, borderColor: '#fecaca' }, content: 'rectangle', locked: false, zIndex: 41 },
    { id: createId(), type: 'text', x: 35, y: 360, width: 100, height: 14, rotation: 0, style: { fontSize: 9, fontWeight: 'normal', color: '#dc2626', textAlign: 'left' }, content: 'Sem COESA', locked: false, zIndex: 42 },
    { id: createId(), type: 'text', x: 280, y: 358, width: 90, height: 18, rotation: 0, style: { fontSize: 8, fontWeight: 'semibold', color: '#ffffff', backgroundColor: '#dc2626', borderRadius: 8, textAlign: 'center', padding: 3 }, content: 'ATUAL', locked: false, zIndex: 43 },
    { id: createId(), type: 'dynamic-field', x: 35, y: 376, width: 200, height: 28, rotation: 0, style: { fontSize: 22, fontWeight: 'bold', color: '#dc2626', textAlign: 'left' }, content: '{{valor_sem_coesa}}', locked: false, zIndex: 44 },
    { id: createId(), type: 'dynamic-field', x: 35, y: 406, width: 150, height: 12, rotation: 0, style: { fontSize: 8, color: '#6b7280', textAlign: 'left' }, content: 'Consumo: {{consumo_medio}} kWh', locked: false, zIndex: 45 },
    { id: createId(), type: 'dynamic-field', x: 35, y: 418, width: 150, height: 12, rotation: 0, style: { fontSize: 8, color: '#6b7280', textAlign: 'left' }, content: 'Tarifa: {{tarifa}}/kWh', locked: false, zIndex: 46 },
    { id: createId(), type: 'dynamic-field', x: 35, y: 430, width: 150, height: 12, rotation: 0, style: { fontSize: 8, color: '#6b7280', textAlign: 'left' }, content: 'CIP: {{cip}}', locked: false, zIndex: 47 },

    // Card Com COESA
    { id: createId(), type: 'shape', x: 409, y: 352, width: 365, height: 90, rotation: 0, style: { backgroundColor: '#ecfdf5', borderRadius: 12, borderWidth: 2, borderColor: '#10b981' }, content: 'rectangle', locked: false, zIndex: 50 },
    { id: createId(), type: 'text', x: 424, y: 360, width: 100, height: 14, rotation: 0, style: { fontSize: 9, fontWeight: 'normal', color: '#059669', textAlign: 'left' }, content: 'Com COESA', locked: false, zIndex: 51 },
    { id: createId(), type: 'text', x: 665, y: 358, width: 95, height: 18, rotation: 0, style: { fontSize: 8, fontWeight: 'semibold', color: '#ffffff', backgroundColor: '#10b981', borderRadius: 8, textAlign: 'center', padding: 3 }, content: 'COM COESA', locked: false, zIndex: 52 },
    { id: createId(), type: 'dynamic-field', x: 424, y: 376, width: 200, height: 28, rotation: 0, style: { fontSize: 22, fontWeight: 'bold', color: '#059669', textAlign: 'left' }, content: '{{valor_com_coesa}}', locked: false, zIndex: 53 },
    { id: createId(), type: 'dynamic-field', x: 424, y: 406, width: 180, height: 12, rotation: 0, style: { fontSize: 8, color: '#6b7280', textAlign: 'left' }, content: 'Consumo: {{consumo_medio}} kWh', locked: false, zIndex: 54 },
    { id: createId(), type: 'dynamic-field', x: 424, y: 418, width: 180, height: 12, rotation: 0, style: { fontSize: 8, color: '#6b7280', textAlign: 'left' }, content: 'Tarifa: {{tarifa_coesa}}/kWh (-{{desconto_percentual}}%)', locked: false, zIndex: 55 },
    { id: createId(), type: 'dynamic-field', x: 424, y: 430, width: 180, height: 12, rotation: 0, style: { fontSize: 8, color: '#6b7280', textAlign: 'left' }, content: '+ Disponibilidade: {{disponibilidade}}', locked: false, zIndex: 56 },

    // ========== ECONOMIA MENSAL BANNER ==========
    { id: createId(), type: 'shape', x: 20, y: 452, width: A4_WIDTH - 40, height: 40, rotation: 0, style: { backgroundColor: '#fef3c7', borderRadius: 10 }, content: 'rectangle', locked: false, zIndex: 60 },
    { id: createId(), type: 'text', x: 40, y: 460, width: 30, height: 24, rotation: 0, style: { fontSize: 18, textAlign: 'center' }, content: '💰', locked: false, zIndex: 61 },
    { id: createId(), type: 'text', x: 75, y: 458, width: 120, height: 14, rotation: 0, style: { fontSize: 9, fontWeight: 'normal', color: '#78350f', textAlign: 'left' }, content: 'ECONOMIA MENSAL', locked: false, zIndex: 62 },
    { id: createId(), type: 'dynamic-field', x: 75, y: 472, width: 150, height: 18, rotation: 0, style: { fontSize: 14, fontWeight: 'bold', color: '#f59e0b', textAlign: 'left' }, content: '{{economia_mensal}}', locked: false, zIndex: 63 },
    { id: createId(), type: 'dynamic-field', x: 640, y: 464, width: 120, height: 18, rotation: 0, style: { fontSize: 12, fontWeight: 'bold', color: '#059669', textAlign: 'right' }, content: '{{economia_anual}}/ano', locked: false, zIndex: 64 },

    // ========== COMPOSIÇÃO DA CONTA ==========
    { id: createId(), type: 'text', x: 20, y: 502, width: 200, height: 18, rotation: 0, style: { fontSize: 11, fontWeight: 'bold', color: '#374151', textAlign: 'left' }, content: 'COMPOSIÇÃO DA SUA CONTA', locked: false, zIndex: 70 },

    // Boleto Concessionária
    { id: createId(), type: 'shape', x: 20, y: 522, width: 365, height: 140, rotation: 0, style: { backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' }, content: 'rectangle', locked: false, zIndex: 71 },
    { id: createId(), type: 'text', x: 35, y: 530, width: 200, height: 16, rotation: 0, style: { fontSize: 10, fontWeight: 'bold', color: '#374151', textAlign: 'left' }, content: '📄 BOLETO CONCESSIONÁRIA', locked: false, zIndex: 72 },
    { id: createId(), type: 'dynamic-field', x: 35, y: 552, width: 180, height: 14, rotation: 0, style: { fontSize: 9, color: '#6b7280', textAlign: 'left' }, content: 'Disponibilidade ({{disponibilidade_kwh}} kWh)', locked: false, zIndex: 73 },
    { id: createId(), type: 'dynamic-field', x: 300, y: 552, width: 70, height: 14, rotation: 0, style: { fontSize: 9, color: '#374151', textAlign: 'right' }, content: '{{disponibilidade_valor}}', locked: false, zIndex: 74 },
    { id: createId(), type: 'text', x: 35, y: 568, width: 180, height: 14, rotation: 0, style: { fontSize: 9, color: '#6b7280', textAlign: 'left' }, content: 'CIP', locked: false, zIndex: 75 },
    { id: createId(), type: 'dynamic-field', x: 300, y: 568, width: 70, height: 14, rotation: 0, style: { fontSize: 9, color: '#374151', textAlign: 'right' }, content: '{{cip}}', locked: false, zIndex: 76 },
    { id: createId(), type: 'text', x: 35, y: 584, width: 180, height: 14, rotation: 0, style: { fontSize: 9, color: '#6b7280', textAlign: 'left' }, content: 'Tributos', locked: false, zIndex: 77 },
    { id: createId(), type: 'dynamic-field', x: 300, y: 584, width: 70, height: 14, rotation: 0, style: { fontSize: 9, color: '#374151', textAlign: 'right' }, content: '{{tributos_concessionaria}}', locked: false, zIndex: 78 },
    { id: createId(), type: 'shape', x: 35, y: 605, width: 335, height: 1, rotation: 0, style: { backgroundColor: '#e5e7eb' }, content: 'line', locked: false, zIndex: 79 },
    { id: createId(), type: 'text', x: 35, y: 615, width: 100, height: 16, rotation: 0, style: { fontSize: 10, fontWeight: 'bold', color: '#374151', textAlign: 'left' }, content: 'TOTAL', locked: false, zIndex: 80 },
    { id: createId(), type: 'dynamic-field', x: 280, y: 615, width: 90, height: 16, rotation: 0, style: { fontSize: 11, fontWeight: 'bold', color: '#374151', textAlign: 'right' }, content: '{{total_concessionaria}}', locked: false, zIndex: 81 },

    // Boleto COESA
    { id: createId(), type: 'shape', x: 409, y: 522, width: 365, height: 140, rotation: 0, style: { backgroundColor: '#ecfdf5', borderRadius: 10, borderWidth: 2, borderColor: '#10b981' }, content: 'rectangle', locked: false, zIndex: 82 },
    { id: createId(), type: 'text', x: 424, y: 530, width: 200, height: 16, rotation: 0, style: { fontSize: 10, fontWeight: 'bold', color: '#059669', textAlign: 'left' }, content: '💚 BOLETO COESA', locked: false, zIndex: 83 },
    { id: createId(), type: 'text', x: 424, y: 552, width: 180, height: 14, rotation: 0, style: { fontSize: 9, color: '#6b7280', textAlign: 'left' }, content: 'Tarifa COESA', locked: false, zIndex: 84 },
    { id: createId(), type: 'dynamic-field', x: 680, y: 552, width: 80, height: 14, rotation: 0, style: { fontSize: 9, fontWeight: 'semibold', color: '#059669', textAlign: 'right' }, content: '{{tarifa_coesa}}/kWh', locked: false, zIndex: 85 },
    { id: createId(), type: 'dynamic-field', x: 424, y: 568, width: 180, height: 14, rotation: 0, style: { fontSize: 9, color: '#6b7280', textAlign: 'left' }, content: 'Energia ({{energia_compensada_kwh}} kWh)', locked: false, zIndex: 86 },
    { id: createId(), type: 'dynamic-field', x: 680, y: 568, width: 80, height: 14, rotation: 0, style: { fontSize: 9, color: '#059669', textAlign: 'right' }, content: '{{valor_energia_coesa}}', locked: false, zIndex: 87 },
    { id: createId(), type: 'text', x: 424, y: 584, width: 180, height: 14, rotation: 0, style: { fontSize: 9, color: '#6b7280', textAlign: 'left' }, content: 'Custo Financeiro', locked: false, zIndex: 88 },
    { id: createId(), type: 'dynamic-field', x: 680, y: 584, width: 80, height: 14, rotation: 0, style: { fontSize: 9, color: '#374151', textAlign: 'right' }, content: '{{taxa_bancaria}}', locked: false, zIndex: 89 },
    { id: createId(), type: 'shape', x: 424, y: 605, width: 335, height: 1, rotation: 0, style: { backgroundColor: '#a7f3d0' }, content: 'line', locked: false, zIndex: 90 },
    { id: createId(), type: 'text', x: 424, y: 615, width: 100, height: 16, rotation: 0, style: { fontSize: 10, fontWeight: 'bold', color: '#059669', textAlign: 'left' }, content: 'TOTAL', locked: false, zIndex: 91 },
    { id: createId(), type: 'dynamic-field', x: 660, y: 615, width: 100, height: 16, rotation: 0, style: { fontSize: 11, fontWeight: 'bold', color: '#059669', textAlign: 'right' }, content: '{{total_coesa}}', locked: false, zIndex: 92 },

    // Página 1 de 2
    { id: createId(), type: 'text', x: 700, y: 1095, width: 80, height: 20, rotation: 0, style: { fontSize: 9, color: '#9ca3af', textAlign: 'right' }, content: 'Página 1 de 2', locked: false, zIndex: 99 },
  ];

  const generatePage2Elements = (): CanvasElementData[] => [
    // ========== MINI HEADER ==========
    { id: createId(), type: 'shape', x: 0, y: 0, width: A4_WIDTH, height: 55, rotation: 0, style: { backgroundColor: '#059669', borderRadius: 0 }, content: 'rectangle', locked: false, zIndex: 1 },
    { id: createId(), type: 'shape', x: 25, y: 10, width: 35, height: 35, rotation: 0, style: { backgroundColor: '#ffffff', borderRadius: 8 }, content: 'rectangle', locked: false, zIndex: 2 },
    { id: createId(), type: 'text', x: 70, y: 15, width: 140, height: 18, rotation: 0, style: { fontSize: 13, fontWeight: 'bold', color: '#ffffff' }, content: 'COESA Energia', locked: false, zIndex: 3 },
    { id: createId(), type: 'text', x: 70, y: 32, width: 280, height: 14, rotation: 0, style: { fontSize: 9, color: '#d1fae5' }, content: 'Proposta Inicial para {{cliente_nome}}', locked: false, zIndex: 4 },
    { id: createId(), type: 'text', x: 670, y: 20, width: 100, height: 18, rotation: 0, style: { fontSize: 10, color: '#d1fae5', textAlign: 'right' }, content: 'Página 2 de 2', locked: false, zIndex: 5 },

    // ========== PROJEÇÃO DE ECONOMIA ==========
    { id: createId(), type: 'text', x: 20, y: 70, width: 200, height: 18, rotation: 0, style: { fontSize: 12, fontWeight: 'bold', color: '#374151', textAlign: 'left' }, content: 'PROJEÇÃO DE ECONOMIA', locked: false, zIndex: 10 },

    // Barra 1 mês
    { id: createId(), type: 'text', x: 20, y: 98, width: 50, height: 16, rotation: 0, style: { fontSize: 10, color: '#6b7280', textAlign: 'left' }, content: '1 mês', locked: false, zIndex: 11 },
    { id: createId(), type: 'shape', x: 75, y: 98, width: 50, height: 18, rotation: 0, style: { backgroundColor: '#d1fae5', borderRadius: 4 }, content: 'rectangle', locked: false, zIndex: 12 },
    { id: createId(), type: 'dynamic-field', x: 660, y: 98, width: 100, height: 16, rotation: 0, style: { fontSize: 10, fontWeight: 'semibold', color: '#059669', textAlign: 'right' }, content: '{{economia_mensal}}', locked: false, zIndex: 13 },

    // Barra 1 ano
    { id: createId(), type: 'text', x: 20, y: 122, width: 50, height: 16, rotation: 0, style: { fontSize: 10, color: '#6b7280', textAlign: 'left' }, content: '1 ano', locked: false, zIndex: 14 },
    { id: createId(), type: 'shape', x: 75, y: 122, width: 150, height: 18, rotation: 0, style: { backgroundColor: '#a7f3d0', borderRadius: 4 }, content: 'rectangle', locked: false, zIndex: 15 },
    { id: createId(), type: 'dynamic-field', x: 660, y: 122, width: 100, height: 16, rotation: 0, style: { fontSize: 10, fontWeight: 'semibold', color: '#059669', textAlign: 'right' }, content: '{{economia_anual}}', locked: false, zIndex: 16 },

    // Barra 2 anos
    { id: createId(), type: 'text', x: 20, y: 146, width: 50, height: 16, rotation: 0, style: { fontSize: 10, color: '#6b7280', textAlign: 'left' }, content: '2 anos', locked: false, zIndex: 17 },
    { id: createId(), type: 'shape', x: 75, y: 146, width: 280, height: 18, rotation: 0, style: { backgroundColor: '#6ee7b7', borderRadius: 4 }, content: 'rectangle', locked: false, zIndex: 18 },
    { id: createId(), type: 'dynamic-field', x: 660, y: 146, width: 100, height: 16, rotation: 0, style: { fontSize: 10, fontWeight: 'semibold', color: '#059669', textAlign: 'right' }, content: '{{economia_2_anos}}', locked: false, zIndex: 19 },

    // Barra 5 anos
    { id: createId(), type: 'text', x: 20, y: 170, width: 50, height: 16, rotation: 0, style: { fontSize: 10, color: '#6b7280', textAlign: 'left' }, content: '5 anos', locked: false, zIndex: 20 },
    { id: createId(), type: 'shape', x: 75, y: 170, width: 500, height: 18, rotation: 0, style: { backgroundColor: '#34d399', borderRadius: 4 }, content: 'rectangle', locked: false, zIndex: 21 },
    { id: createId(), type: 'dynamic-field', x: 660, y: 170, width: 100, height: 16, rotation: 0, style: { fontSize: 10, fontWeight: 'semibold', color: '#059669', textAlign: 'right' }, content: '{{economia_5_anos}}', locked: false, zIndex: 22 },

    // Barra período contratado (destaque)
    { id: createId(), type: 'dynamic-field', x: 20, y: 194, width: 50, height: 16, rotation: 0, style: { fontSize: 10, fontWeight: 'bold', color: '#f59e0b', textAlign: 'left' }, content: '{{fidelidade_anos}} anos', locked: false, zIndex: 23 },
    { id: createId(), type: 'shape', x: 75, y: 194, width: 360, height: 18, rotation: 0, style: { backgroundColor: '#fbbf24', borderRadius: 4 }, content: 'rectangle', locked: false, zIndex: 24 },
    { id: createId(), type: 'dynamic-field', x: 660, y: 194, width: 100, height: 16, rotation: 0, style: { fontSize: 10, fontWeight: 'bold', color: '#f59e0b', textAlign: 'right' }, content: '{{economia_acumulada}}', locked: false, zIndex: 25 },

    // Banner economia total
    { id: createId(), type: 'shape', x: 20, y: 222, width: A4_WIDTH - 40, height: 50, rotation: 0, style: { backgroundColor: '#fef3c7', borderRadius: 12 }, content: 'rectangle', locked: false, zIndex: 30 },
    { id: createId(), type: 'text', x: 40, y: 232, width: 30, height: 28, rotation: 0, style: { fontSize: 22, textAlign: 'center' }, content: '🎯', locked: false, zIndex: 31 },
    { id: createId(), type: 'dynamic-field', x: 80, y: 232, width: 280, height: 14, rotation: 0, style: { fontSize: 10, color: '#78350f', textAlign: 'left' }, content: 'Economia total em {{fidelidade_anos}} anos:', locked: false, zIndex: 32 },
    { id: createId(), type: 'dynamic-field', x: 80, y: 248, width: 200, height: 20, rotation: 0, style: { fontSize: 16, fontWeight: 'bold', color: '#f59e0b', textAlign: 'left' }, content: '{{economia_acumulada}}', locked: false, zIndex: 33 },
    { id: createId(), type: 'text', x: 660, y: 242, width: 100, height: 24, rotation: 0, style: { fontSize: 18, textAlign: 'center' }, content: '→', locked: false, zIndex: 34 },

    // ========== COMPARE OS PLANOS (dinâmico) ==========
    { id: createId(), type: 'plans-comparison', x: 20, y: 285, width: A4_WIDTH - 40, height: 500, rotation: 0, style: {}, content: 'plans-comparison', locked: false, zIndex: 40 },

    // ========== FOOTER ==========
    { id: createId(), type: 'shape', x: 0, y: 1023, width: A4_WIDTH, height: 100, rotation: 0, style: { backgroundColor: '#1f2937', borderRadius: 0 }, content: 'rectangle', locked: false, zIndex: 90 },
    { id: createId(), type: 'shape', x: 30, y: 1038, width: 35, height: 35, rotation: 0, style: { backgroundColor: '#ffffff', borderRadius: 8 }, content: 'rectangle', locked: false, zIndex: 91 },
    { id: createId(), type: 'text', x: 75, y: 1040, width: 180, height: 16, rotation: 0, style: { fontSize: 11, fontWeight: 'semibold', color: '#ffffff' }, content: 'COESA Energia Inteligente', locked: false, zIndex: 92 },
    { id: createId(), type: 'text', x: 75, y: 1056, width: 180, height: 14, rotation: 0, style: { fontSize: 9, color: '#9ca3af' }, content: 'Soluções em Energia Renovável', locked: false, zIndex: 93 },
    { id: createId(), type: 'text', x: 400, y: 1035, width: 180, height: 13, rotation: 0, style: { fontSize: 8, color: '#9ca3af', textAlign: 'right' }, content: 'Consultor: SOFIA', locked: false, zIndex: 94 },
    { id: createId(), type: 'text', x: 400, y: 1048, width: 180, height: 13, rotation: 0, style: { fontSize: 8, color: '#9ca3af', textAlign: 'right' }, content: '📧 contato@coesaenergia.com.br', locked: false, zIndex: 95 },
    { id: createId(), type: 'text', x: 400, y: 1061, width: 180, height: 13, rotation: 0, style: { fontSize: 8, color: '#9ca3af', textAlign: 'right' }, content: '📞 (11) 99999-9999', locked: false, zIndex: 96 },
    { id: createId(), type: 'qr-code', x: 710, y: 1033, width: 55, height: 55, rotation: 0, style: { backgroundColor: '#ffffff', borderRadius: 8, padding: 4 }, content: '{{qr_url}}', locked: false, zIndex: 97 },
    { id: createId(), type: 'text', x: 620, y: 1093, width: 150, height: 12, rotation: 0, style: { fontSize: 7, color: '#6b7280', textAlign: 'center' }, content: 'Escaneie para WhatsApp', locked: false, zIndex: 98 },
  ];

  return {
    name: 'Template Proposta Inicial (Padrão)',
    description: 'Template padrão para propostas iniciais com dados estimados - 2 páginas completas',
    type: 'inicial' as const,
    pages: [
      { id: `page-${Date.now()}-1`, elements: generatePage1Elements(), backgroundColor: '#ffffff' },
      { id: `page-${Date.now()}-2`, elements: generatePage2Elements(), backgroundColor: '#ffffff' },
    ] as TemplatePage[],
    is_active: true,
  };
}

// Legacy export for backwards compatibility
export const DEFAULT_INITIAL_TEMPLATE = createDefaultInitialTemplate();
