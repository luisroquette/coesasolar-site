import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AssinanteOutput, UsineiroOutput, formatCurrency, formatNumber, formatPercent } from './calculations';

// COESA Brand Colors (RGB)
const COESA_GREEN = { r: 61, g: 140, b: 92 };
const COESA_BLUE = { r: 0, g: 89, b: 179 };
const COESA_DARK = { r: 28, g: 35, b: 43 };
const WHITE = { r: 255, g: 255, b: 255 };
const GRAY = { r: 107, g: 114, b: 128 };

// Function to load image as base64
async function loadImageAsBase64(imagePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error('Could not get canvas context'));
      }
    };
    img.onerror = reject;
    img.src = imagePath;
  });
}

interface AssinantePDFData {
  cliente: {
    nome: string;
    cpfCnpj: string;
    endereco: string;
    cidade: string;
    uf: string;
    cep: string;
    telefone: string;
    email: string;
  };
  instalacao: {
    concessionaria: string;
    numeroUcs: number;
    numeroInstalacao: string;
    tipoInstalacao: string;
  };
  consumo: {
    tarifa: number;
    cip: number;
    consumoMedio: number;
    fidelidadeAnos: number;
    descontoPercentual: number;
    responsavelComercial: string;
  };
  resultado: AssinanteOutput;
}

interface UsineiroPDFData {
  projeto: {
    nome: string;
    spe: string;
    cidade: string;
    uf: string;
    tipoGd: string;
  };
  capacidade: {
    potenciaMwp: number;
    oversizing: number;
    quantidadeModulos: number;
    areaHectares: number;
  };
  comercializacao: {
    concessionaria: string;
    tipoComercializacao: string;
    taxaAdministracao: number;
    descontoClienteFinal: number;
    tarifaMedia: number;
  };
  custos: {
    capexTotal: number;
    omPercentual: number;
    arrendamentoMensal: number;
    seguroAnual: number;
    contabilidadeMensal: number;
  };
  financiamento?: {
    valor: number;
    carenciaMeses: number;
    prazoMeses: number;
    taxa: number;
  };
  regimeTributario: string;
  resultado: UsineiroOutput;
}

async function drawHeaderWithLogo(doc: jsPDF, title: string, logoBase64: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Green header bar
  doc.setFillColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
  doc.rect(0, 0, pageWidth, 35, 'F');
  
  // Add logo image
  try {
    doc.addImage(logoBase64, 'PNG', 15, 5, 50, 25);
  } catch {
    // Fallback to text if image fails
    doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text('COESA', 20, 22);
  }
  
  // Title
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth - 20, 18, { align: 'right' });
  
  // Date
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const today = new Date().toLocaleDateString('pt-BR');
  doc.text(`Gerado em: ${today}`, pageWidth - 20, 28, { align: 'right' });
}

function drawFooter(doc: jsPDF, pageNum: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Footer bar
  doc.setFillColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
  doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');
  
  // Footer text
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.setFontSize(8);
  doc.text('COESA Energia Inteligente - Soluções em Energia Renovável', 20, pageHeight - 8);
  doc.text(`Página ${pageNum}`, pageWidth - 20, pageHeight - 8, { align: 'right' });
}

function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFillColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
  doc.rect(15, y, 180, 8, 'F');
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, 20, y + 5.5);
  return y + 12;
}

export async function generateAssinantePDF(data: AssinantePDFData): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Load logo
  const { default: coesaWhite } = await import('@/assets/logos/coesa-white.png');
  const { default: coesaGreen } = await import('@/assets/logos/coesa-green.png');
  const logoWhiteBase64 = await loadImageAsBase64(coesaWhite);
  const logoGreenBase64 = await loadImageAsBase64(coesaGreen);
  
  // ============ HEADER SECTION ============
  // Green header bar
  doc.setFillColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
  doc.rect(0, 0, pageWidth, 28, 'F');
  
  // Logo in header
  try {
    doc.addImage(logoWhiteBase64, 'PNG', 12, 4, 40, 20);
  } catch {
    doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('COESA', 15, 16);
  }
  
  // Client info in header (compact)
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const clientLine1 = data.cliente.nome || 'Cliente';
  const clientLine2 = [data.cliente.email, data.cliente.telefone].filter(Boolean).join(' | ') || '';
  const clientLine3 = [data.cliente.cidade, data.cliente.uf].filter(Boolean).join(' - ') || '';
  
  doc.text(clientLine1, 58, 10);
  if (clientLine2) doc.text(clientLine2, 58, 15);
  if (clientLine3) doc.text(clientLine3, 58, 20);
  
  // Proposal date & validity on right
  const today = new Date();
  const validity = new Date(today);
  validity.setDate(validity.getDate() + 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Proposta: ${today.toLocaleDateString('pt-BR')}`, pageWidth - 15, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Validade: ${validity.toLocaleDateString('pt-BR')}`, pageWidth - 15, 18, { align: 'right' });
  
  let y = 36;
  
  // ============ HERO SECTION - PROPOSTA COMERCIAL ============
  const heroHeight = 42;
  doc.setFillColor(245, 250, 247); // Light green background
  doc.rect(10, y, pageWidth - 20, heroHeight, 'F');
  
  // Green accent bar on left
  doc.setFillColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
  doc.rect(10, y, 4, heroHeight, 'F');
  
  // Title
  doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('PROPOSTA COMERCIAL', 20, y + 12);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text('Energia Inteligente para você economizar', 20, y + 20);
  
  // Installation info line 1
  doc.setFontSize(8);
  const installInfo = `${data.instalacao.concessionaria || 'Concessionária'} | ${data.instalacao.tipoInstalacao} | ${data.instalacao.numeroUcs} UC(s)`;
  doc.text(installInfo, 20, y + 28);
  
  // Installation info line 2 - Nº Instalação and CIP
  const installDetails = [];
  if (data.instalacao.numeroInstalacao) {
    installDetails.push(`Nº Instalação: ${data.instalacao.numeroInstalacao}`);
  }
  if (data.consumo.cip && data.consumo.cip > 0) {
    installDetails.push(`CIP: R$ ${formatNumber(data.consumo.cip, 2)}`);
  }
  if (installDetails.length > 0) {
    doc.text(installDetails.join(' | '), 20, y + 34);
  }
  
  // Big discount percentage on right
  doc.setFillColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
  const discountBoxWidth = 55;
  doc.roundedRect(pageWidth - 15 - discountBoxWidth, y + 5, discountBoxWidth, heroHeight - 10, 4, 4, 'F');
  
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text(`${formatNumber(data.consumo.descontoPercentual, 0)}%`, pageWidth - 15 - discountBoxWidth/2, y + 22, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('DE DESCONTO', pageWidth - 15 - discountBoxWidth/2, y + 32, { align: 'center' });
  
  y += heroHeight + 8;
  
  // ============ COMPARATIVO SEM/COM COESA ============
  doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Comparativo Mensal', 15, y);
  y += 6;
  
  const compareBoxHeight = 28;
  const compareBoxWidth = (pageWidth - 30) / 2 - 3;
  
  // "SEM COESA" box
  doc.setFillColor(248, 248, 248);
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(10, y, compareBoxWidth, compareBoxHeight, 2, 2, 'FD');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text('SEM COESA', 15, y + 7);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Consumo: ${formatNumber(data.consumo.consumoMedio, 0)} kWh`, 15, y + 14);
  doc.text(`Tarifa: R$ ${formatNumber(data.consumo.tarifa, 4)}/kWh`, 15, y + 20);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text(formatCurrency(data.resultado.valorSemCoesa), 10 + compareBoxWidth - 8, y + 18, { align: 'right' });
  
  // "COM COESA" box
  doc.setFillColor(235, 250, 240);
  doc.setDrawColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
  doc.roundedRect(10 + compareBoxWidth + 6, y, compareBoxWidth, compareBoxHeight, 2, 2, 'FD');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
  doc.text('COM COESA', 10 + compareBoxWidth + 11, y + 7);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
  const tarifaComDesconto = data.consumo.tarifa * (1 - data.consumo.descontoPercentual / 100);
  doc.text(`Consumo: ${formatNumber(data.consumo.consumoMedio, 0)} kWh`, 10 + compareBoxWidth + 11, y + 14);
  doc.text(`Tarifa: R$ ${formatNumber(tarifaComDesconto, 4)}/kWh`, 10 + compareBoxWidth + 11, y + 20);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
  doc.text(formatCurrency(data.resultado.valorComCoesa), pageWidth - 18, y + 18, { align: 'right' });
  
  y += compareBoxHeight + 6;
  
  // Economy highlight strip
  doc.setFillColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
  doc.roundedRect(10, y, pageWidth - 20, 14, 2, 2, 'F');
  
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('ECONOMIA MENSAL:', 18, y + 9);
  doc.setFontSize(12);
  doc.text(formatCurrency(data.resultado.economiaMensal), pageWidth - 18, y + 9, { align: 'right' });
  
  y += 20;
  
  // ============ VANTAGENS DA ENERGIA INTELIGENTE ============
  doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Vantagens da Energia Inteligente', 15, y);
  y += 5;
  
  const vantagens = [
    { title: 'Personalização', desc: 'Proposta sob medida para seu perfil' },
    { title: 'Sem Investimento', desc: 'Economia imediata sem custo inicial' },
    { title: 'Experiência Digital', desc: 'Acompanhe tudo pelo app' },
    { title: 'Desconto Garantido', desc: `${formatNumber(data.consumo.descontoPercentual, 0)}% em toda fatura` },
  ];
  
  const vantagemWidth = (pageWidth - 30) / 4;
  vantagens.forEach((v, i) => {
    const x = 12 + (i * vantagemWidth);
    
    // Small green circle indicator
    doc.setFillColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
    doc.circle(x + vantagemWidth/2, y + 4, 3, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
    doc.text(v.title, x + vantagemWidth/2, y + 12, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    // Split long descriptions
    const descLines = doc.splitTextToSize(v.desc, vantagemWidth - 4);
    descLines.forEach((line: string, li: number) => {
      doc.text(line, x + vantagemWidth/2, y + 17 + (li * 4), { align: 'center' });
    });
  });
  
  y += 26;
  
  // ============ LINHA DO TEMPO HORIZONTAL ============
  doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Linha do Tempo', 15, y);
  y += 5;
  
  const timeline = [
    { day: 'D0', title: 'Assinatura', desc: 'Contrato' },
    { day: 'D+30', title: 'Análise', desc: 'Cadastro' },
    { day: 'D+60', title: 'Homologação', desc: 'Aprovação' },
    { day: 'D+90', title: 'Economia!', desc: '1ª fatura' },
  ];
  
  const tlWidth = pageWidth - 40;
  const tlStartX = 20;
  const tlNodeSpacing = tlWidth / (timeline.length - 1);
  
  // Timeline line
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(2);
  doc.line(tlStartX, y + 8, tlStartX + tlWidth, y + 8);
  
  // Green progress line (partial to D+90)
  doc.setDrawColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
  doc.setLineWidth(2);
  doc.line(tlStartX, y + 8, tlStartX + tlWidth, y + 8);
  
  timeline.forEach((item, i) => {
    const x = tlStartX + (i * tlNodeSpacing);
    
    // Node circle
    doc.setFillColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
    doc.circle(x, y + 8, 5, 'F');
    
    // Day label inside circle
    doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5);
    doc.text(item.day, x, y + 9.5, { align: 'center' });
    
    // Title below
    doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
    doc.setFontSize(7);
    doc.text(item.title, x, y + 18, { align: 'center' });
    
    // Description
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    doc.text(item.desc, x, y + 23, { align: 'center' });
  });
  
  y += 30;
  
  // ============ ECONOMIA AO LONGO DO TEMPO (HORIZONTAL BARS) ============
  doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Economia ao Longo do Tempo', 15, y);
  y += 5;
  
  const periods = [
    { label: '1 mês', value: data.resultado.economiaMensal },
    { label: '1 ano', value: data.resultado.economiaAnual },
    { label: '3 anos', value: data.resultado.economiaAnual * 3 },
    { label: '5 anos', value: data.resultado.economiaAnual * 5 },
    { label: `${data.consumo.fidelidadeAnos} anos`, value: data.resultado.economiaAcumulada },
  ];
  
  const maxValue = Math.max(...periods.map(p => p.value));
  const barMaxWidth = pageWidth - 90;
  const barHeight = 7;
  const barSpacing = 10;
  
  periods.forEach((period, i) => {
    const barY = y + (i * barSpacing);
    const barWidth = Math.max((period.value / maxValue) * barMaxWidth, 15);
    
    // Label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
    doc.text(period.label, 15, barY + 5);
    
    // Bar
    const greenIntensity = 0.4 + (i * 0.15); // Gradient effect
    doc.setFillColor(
      Math.round(COESA_GREEN.r * (1 - greenIntensity * 0.3)),
      Math.round(COESA_GREEN.g * (0.7 + greenIntensity * 0.3)),
      Math.round(COESA_GREEN.b * (1 - greenIntensity * 0.2))
    );
    doc.roundedRect(42, barY, barWidth, barHeight, 1, 1, 'F');
    
    // Value at end of bar
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
    doc.text(formatCurrency(period.value), 42 + barWidth + 4, barY + 5);
  });
  
  y += (periods.length * barSpacing) + 8;
  
  // ============ FOOTER ============
  // Footer bar
  doc.setFillColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
  doc.rect(0, pageHeight - 16, pageWidth, 16, 'F');
  
  // Footer text
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('COESA Energia Inteligente | Soluções em Energia Renovável', 15, pageHeight - 7);
  
  // Responsible
  if (data.consumo.responsavelComercial) {
    doc.text(`Responsável: ${data.consumo.responsavelComercial}`, pageWidth - 15, pageHeight - 7, { align: 'right' });
  }
  
  // Add small logo in footer
  try {
    doc.addImage(logoWhiteBase64, 'PNG', pageWidth / 2 - 12, pageHeight - 14, 24, 12);
  } catch {
    // Skip logo if fails
  }
  
  // Save PDF
  const fileName = `Proposta_Assinante_${data.cliente.nome.replace(/\s+/g, '_') || 'Cliente'}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

export async function generateUsineiroPDF(data: UsineiroPDFData): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Load logos
  const { default: coesaWhite } = await import('@/assets/logos/coesa-white.png');
  const logoWhiteBase64 = await loadImageAsBase64(coesaWhite);
  
  // ============ PAGE 1 - COVER ============
  // Full green background
  doc.setFillColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  
  // Logo on cover
  try {
    doc.addImage(logoWhiteBase64, 'PNG', (pageWidth - 80) / 2, 45, 80, 40);
  } catch {
    doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(36);
    doc.text('COESA', pageWidth / 2, 70, { align: 'center' });
  }
  
  // Divider line
  doc.setDrawColor(WHITE.r, WHITE.g, WHITE.b);
  doc.setLineWidth(0.3);
  doc.line(50, 100, pageWidth - 50, 100);
  
  // Document type
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text('INVEST TEASER', pageWidth / 2, 115, { align: 'center' });
  
  // Project name (big)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(32);
  const projectName = data.projeto.nome.toUpperCase();
  const projectNameLines = doc.splitTextToSize(projectName, pageWidth - 40);
  let coverY = 140;
  projectNameLines.forEach((line: string) => {
    doc.text(line, pageWidth / 2, coverY, { align: 'center' });
    coverY += 14;
  });
  
  // Location and capacity
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text(`${data.projeto.cidade} - ${data.projeto.uf}`, pageWidth / 2, coverY + 15, { align: 'center' });
  
  // Capacity badge
  doc.setFillColor(255, 255, 255);
  const badgeWidth = 70;
  doc.roundedRect((pageWidth - badgeWidth) / 2, coverY + 25, badgeWidth, 22, 4, 4, 'F');
  doc.setTextColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`${formatNumber(data.capacidade.potenciaMwp, 2)} MWp`, pageWidth / 2, coverY + 39, { align: 'center' });
  
  // Key metrics preview on cover
  const metricsY = coverY + 65;
  const metricBoxWidth = 50;
  const metricsStartX = (pageWidth - (metricBoxWidth * 3 + 20)) / 2;
  
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  const coverMetrics = [
    { label: 'TIR', value: formatPercent(data.resultado.tir) },
    { label: 'Payback', value: `${formatNumber(data.resultado.paybackAnos, 1)} anos` },
    { label: 'VPL', value: formatCurrency(data.resultado.vpl).replace('R$', 'R$ ') },
  ];
  
  coverMetrics.forEach((m, i) => {
    const x = metricsStartX + (i * (metricBoxWidth + 10));
    doc.setDrawColor(WHITE.r, WHITE.g, WHITE.b);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, metricsY, metricBoxWidth, 28, 2, 2, 'S');
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(m.label, x + metricBoxWidth / 2, metricsY + 9, { align: 'center' });
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(m.value, x + metricBoxWidth / 2, metricsY + 20, { align: 'center' });
  });
  
  // Date at bottom
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const today = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  doc.text(today.charAt(0).toUpperCase() + today.slice(1), pageWidth / 2, pageHeight - 25, { align: 'center' });
  
  // ============ PAGE 2 - SUMÁRIO EXECUTIVO ============
  doc.addPage();
  
  // Header
  doc.setFillColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
  doc.rect(0, 0, pageWidth, 25, 'F');
  
  try {
    doc.addImage(logoWhiteBase64, 'PNG', 12, 3, 36, 18);
  } catch {}
  
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('SUMÁRIO EXECUTIVO', pageWidth - 15, 15, { align: 'right' });
  
  let y = 35;
  
  // Project summary cards
  const summaryBoxWidth = (pageWidth - 30) / 2 - 3;
  const summaryBoxHeight = 75;
  
  // Left card - Projeto
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(10, y, summaryBoxWidth, summaryBoxHeight, 3, 3, 'F');
  doc.setFillColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
  doc.rect(10, y, 4, summaryBoxHeight, 'F');
  
  doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DADOS DO PROJETO', 18, y + 10);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const projetoData = [
    ['Projeto:', data.projeto.nome],
    ['SPE:', data.projeto.spe || '-'],
    ['Local:', `${data.projeto.cidade} - ${data.projeto.uf}`],
    ['Tipo GD:', data.projeto.tipoGd],
    ['Concessionária:', data.comercializacao.concessionaria || '-'],
    ['Comercialização:', data.comercializacao.tipoComercializacao],
  ];
  
  let projY = y + 18;
  projetoData.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    doc.text(label, 18, projY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
    doc.text(String(value).substring(0, 25), 50, projY);
    projY += 9;
  });
  
  // Right card - Capacidade
  const rightX = 10 + summaryBoxWidth + 6;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(rightX, y, summaryBoxWidth, summaryBoxHeight, 3, 3, 'F');
  doc.setFillColor(COESA_BLUE.r, COESA_BLUE.g, COESA_BLUE.b);
  doc.rect(rightX, y, 4, summaryBoxHeight, 'F');
  
  doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('CAPACIDADE INSTALADA', rightX + 8, y + 10);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const capacidadeData = [
    ['Potência:', `${formatNumber(data.capacidade.potenciaMwp, 2)} MWp`],
    ['Oversizing:', `${formatNumber(data.capacidade.oversizing, 2)}x`],
    ['Módulos:', formatNumber(data.capacidade.quantidadeModulos, 0)],
    ['Área:', `${formatNumber(data.capacidade.areaHectares, 2)} ha`],
    ['Geração Mensal:', `${formatNumber(data.resultado.geracaoMensalMwh, 2)} MWh`],
    ['Geração Anual:', `${formatNumber(data.resultado.geracaoMensalMwh * 12, 0)} MWh`],
  ];
  
  let capY = y + 18;
  capacidadeData.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    doc.text(label, rightX + 8, capY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
    doc.text(value, rightX + 45, capY);
    capY += 9;
  });
  
  y += summaryBoxHeight + 8;
  
  // KPI Highlights Section
  doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Indicadores Financeiros', 15, y);
  y += 5;
  
  const kpis = [
    { label: 'TIR', value: formatPercent(data.resultado.tir), desc: 'Taxa Interna de Retorno', color: COESA_GREEN },
    { label: 'VPL', value: formatCurrency(data.resultado.vpl), desc: 'Valor Presente Líquido', color: COESA_BLUE },
    { label: 'PAYBACK', value: `${formatNumber(data.resultado.paybackAnos, 1)} anos`, desc: 'Retorno do Investimento', color: COESA_GREEN },
  ];
  
  const kpiWidth = (pageWidth - 30) / 3 - 3;
  const kpiHeight = 35;
  
  kpis.forEach((kpi, i) => {
    const x = 10 + (i * (kpiWidth + 5));
    
    doc.setFillColor(kpi.color.r, kpi.color.g, kpi.color.b);
    doc.roundedRect(x, y, kpiWidth, kpiHeight, 3, 3, 'F');
    
    doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(kpi.label, x + kpiWidth / 2, y + 9, { align: 'center' });
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(kpi.value, x + kpiWidth / 2, y + 22, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text(kpi.desc, x + kpiWidth / 2, y + 30, { align: 'center' });
  });
  
  y += kpiHeight + 10;
  
  // Investment & Revenue Strip
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(10, y, pageWidth - 20, 22, 2, 2, 'F');
  
  const stripItems = [
    { label: 'CAPEX Total', value: formatCurrency(data.custos.capexTotal) },
    { label: 'Receita Anual', value: formatCurrency(data.resultado.receitaBrutaAnual) },
    { label: 'EBITDA Anual', value: formatCurrency(data.resultado.ebitdaAnual) },
  ];
  
  const stripWidth = (pageWidth - 30) / 3;
  stripItems.forEach((item, i) => {
    const x = 15 + (i * stripWidth);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    doc.text(item.label, x, y + 8);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
    doc.text(item.value, x, y + 17);
  });
  
  y += 30;
  
  // Premissas Section (compact table)
  doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Premissas do Projeto', 15, y);
  y += 3;
  
  autoTable(doc, {
    startY: y,
    head: [['Descrição', 'Valor', 'Descrição', 'Valor']],
    body: [
      ['CAPEX R$/Wp', `R$ ${formatNumber(data.custos.capexTotal / (data.capacidade.potenciaMwp * 1000000), 2)}`, 'O&M (% CAPEX)', `${formatNumber(data.custos.omPercentual, 2)}%`],
      ['Arrendamento', formatCurrency(data.custos.arrendamentoMensal) + '/mês', 'Seguro', formatCurrency(data.custos.seguroAnual) + '/ano'],
      ['Taxa Admin.', `${formatNumber(data.comercializacao.taxaAdministracao, 1)}%`, 'Desconto Cliente', `${formatNumber(data.comercializacao.descontoClienteFinal, 1)}%`],
      ['Regime Trib.', data.regimeTributario, 'Contabilidade', formatCurrency(data.custos.contabilidadeMensal) + '/mês'],
    ],
    theme: 'plain',
    headStyles: {
      fillColor: [COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    styles: {
      fontSize: 7,
      cellPadding: 3,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 35 },
      1: { cellWidth: 45 },
      2: { fontStyle: 'bold', cellWidth: 35 },
      3: { cellWidth: 45 },
    },
  });
  
  // Financing section if applicable
  if (data.financiamento && data.financiamento.valor > 0) {
    y = (doc as any).lastAutoTable.finalY + 6;
    
    doc.setFillColor(235, 240, 250);
    doc.roundedRect(10, y, pageWidth - 20, 18, 2, 2, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(COESA_BLUE.r, COESA_BLUE.g, COESA_BLUE.b);
    doc.text('FINANCIAMENTO', 15, y + 7);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
    const finText = `Valor: ${formatCurrency(data.financiamento.valor)} | Carência: ${data.financiamento.carenciaMeses} meses | Prazo: ${data.financiamento.prazoMeses} meses | Taxa: ${formatPercent(data.financiamento.taxa)}`;
    doc.text(finText, 15, y + 13);
  }
  
  // Footer
  doc.setFillColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
  doc.rect(0, pageHeight - 14, pageWidth, 14, 'F');
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('COESA Energia Inteligente | Soluções em Energia Renovável', 15, pageHeight - 5);
  doc.text('Página 2', pageWidth - 15, pageHeight - 5, { align: 'right' });
  
  // ============ PAGE 3 - FLUXO DE CAIXA ============
  doc.addPage();
  
  // Header
  doc.setFillColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
  doc.rect(0, 0, pageWidth, 25, 'F');
  
  try {
    doc.addImage(logoWhiteBase64, 'PNG', 12, 3, 36, 18);
  } catch {}
  
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('FLUXO DE CAIXA PROJETADO', pageWidth - 15, 15, { align: 'right' });
  
  y = 32;
  
  // Chart-like visualization of key years
  doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Evolução do Fluxo de Caixa Livre', 15, y);
  y += 4;
  
  const keyYears = [1, 5, 10, 15, 20, 25];
  const barMaxWidth = pageWidth - 80;
  const maxFCL = Math.max(...data.resultado.fluxoCaixa.filter(fc => keyYears.includes(fc.ano)).map(fc => Math.abs(fc.fluxoCaixaLivre)));
  
  keyYears.forEach((year, i) => {
    const fc = data.resultado.fluxoCaixa.find(f => f.ano === year);
    if (!fc) return;
    
    const barY = y + (i * 9);
    const barWidth = Math.max((Math.abs(fc.fluxoCaixaLivre) / maxFCL) * barMaxWidth, 10);
    const isPositive = fc.fluxoCaixaLivre >= 0;
    
    // Year label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
    doc.text(`Ano ${year}`, 15, barY + 5);
    
    // Bar
    doc.setFillColor(
      isPositive ? COESA_GREEN.r : 180,
      isPositive ? COESA_GREEN.g : 80,
      isPositive ? COESA_GREEN.b : 80
    );
    doc.roundedRect(35, barY, barWidth, 6, 1, 1, 'F');
    
    // Value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(formatCurrency(fc.fluxoCaixaLivre), 35 + barWidth + 3, barY + 5);
  });
  
  y += (keyYears.length * 9) + 8;
  
  // Cash flow table
  doc.setTextColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Projeção Detalhada - 25 Anos', 15, y);
  y += 2;
  
  const fluxoBody = data.resultado.fluxoCaixa.slice(0, 25).map((fc) => [
    String(fc.ano),
    `${formatNumber(fc.geracaoMwh, 0)}`,
    formatCurrency(fc.receitaBruta),
    formatCurrency(fc.ebitda),
    formatCurrency(fc.fluxoCaixaLivre),
    formatCurrency(fc.fluxoCaixaDescontado),
  ]);
  
  autoTable(doc, {
    startY: y,
    head: [['Ano', 'MWh', 'Receita Bruta', 'EBITDA', 'FCL', 'FCD']],
    body: fluxoBody,
    theme: 'striped',
    headStyles: {
      fillColor: [COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    styles: {
      fontSize: 6,
      cellPadding: 1.5,
    },
    columnStyles: {
      0: { fontStyle: 'bold', halign: 'center', cellWidth: 12 },
      1: { halign: 'right', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 32 },
      3: { halign: 'right', cellWidth: 32 },
      4: { halign: 'right', cellWidth: 32 },
      5: { halign: 'right', cellWidth: 32 },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });
  
  // Totals row summary
  y = (doc as any).lastAutoTable.finalY + 5;
  
  const totalReceita = data.resultado.fluxoCaixa.reduce((sum, fc) => sum + fc.receitaBruta, 0);
  const totalFCL = data.resultado.fluxoCaixa.reduce((sum, fc) => sum + fc.fluxoCaixaLivre, 0);
  
  doc.setFillColor(COESA_GREEN.r, COESA_GREEN.g, COESA_GREEN.b);
  doc.roundedRect(10, y, pageWidth - 20, 12, 2, 2, 'F');
  
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('TOTAL 25 ANOS:', 18, y + 8);
  doc.text(`Receita: ${formatCurrency(totalReceita)}`, 65, y + 8);
  doc.text(`FCL Acumulado: ${formatCurrency(totalFCL)}`, 130, y + 8);
  
  // Footer
  doc.setFillColor(COESA_DARK.r, COESA_DARK.g, COESA_DARK.b);
  doc.rect(0, pageHeight - 14, pageWidth, 14, 'F');
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('COESA Energia Inteligente | Soluções em Energia Renovável', 15, pageHeight - 5);
  doc.text('Página 3', pageWidth - 15, pageHeight - 5, { align: 'right' });
  
  // Save PDF
  const fileName = `Invest_Teaser_${data.projeto.nome.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
