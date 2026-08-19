import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface GoalProgress {
  nome: string | null;
  propostas_atual: number;
  propostas_meta: number;
  propostas_percent: number;
  valor_atual: number;
  valor_meta: number;
  valor_percent: number;
  conversao_atual: number;
  conversao_meta: number;
  conversao_percent: number;
}

interface PerformanceData {
  month: string;
  total: number;
  aceitas: number;
  enviadas: number;
  recusadas: number;
  valor: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function exportGoalsToExcel(
  goals: GoalProgress[],
  month: number,
  year: number
): void {
  const monthName = format(new Date(year, month - 1, 1), 'MMMM', { locale: ptBR });
  
  const data = goals.map(goal => ({
    'Funcionário': goal.nome || 'Sem nome',
    'Propostas Atual': goal.propostas_atual,
    'Propostas Meta': goal.propostas_meta,
    'Propostas %': `${goal.propostas_percent.toFixed(0)}%`,
    'Valor Atual': formatCurrency(goal.valor_atual),
    'Valor Meta': formatCurrency(goal.valor_meta),
    'Valor %': `${goal.valor_percent.toFixed(0)}%`,
    'Conversão Atual': `${goal.conversao_atual.toFixed(1)}%`,
    'Conversão Meta': `${goal.conversao_meta}%`,
    'Conversão %': `${goal.conversao_percent.toFixed(0)}%`,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Metas');

  // Adjust column widths
  ws['!cols'] = [
    { wch: 25 },
    { wch: 15 },
    { wch: 15 },
    { wch: 12 },
    { wch: 15 },
    { wch: 15 },
    { wch: 10 },
    { wch: 15 },
    { wch: 15 },
    { wch: 12 },
  ];

  XLSX.writeFile(wb, `metas_${monthName}_${year}.xlsx`);
}

export function exportGoalsToPDF(
  goals: GoalProgress[],
  month: number,
  year: number
): void {
  const monthName = format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: ptBR });
  
  const doc = new jsPDF('landscape');
  
  // Title
  doc.setFontSize(18);
  doc.setTextColor(0, 100, 0);
  doc.text('COESA - Relatório de Metas', 14, 20);
  
  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text(`Período: ${monthName}`, 14, 28);
  doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, 35);

  // Table
  const tableData = goals.map(goal => {
    const overallPercent = (goal.propostas_percent + goal.valor_percent + goal.conversao_percent) / 3;
    return [
      goal.nome || 'Sem nome',
      `${goal.propostas_atual} / ${goal.propostas_meta}`,
      `${goal.propostas_percent.toFixed(0)}%`,
      `${formatCurrency(goal.valor_atual)} / ${formatCurrency(goal.valor_meta)}`,
      `${goal.valor_percent.toFixed(0)}%`,
      `${goal.conversao_atual.toFixed(1)}% / ${goal.conversao_meta}%`,
      `${goal.conversao_percent.toFixed(0)}%`,
      `${overallPercent.toFixed(0)}%`,
    ];
  });

  autoTable(doc, {
    startY: 45,
    head: [['Funcionário', 'Propostas', '%', 'Valor Fechado', '%', 'Conversão', '%', 'Geral']],
    body: tableData,
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [0, 100, 0],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles: {
      0: { cellWidth: 45 },
      2: { halign: 'center' },
      4: { halign: 'center' },
      6: { halign: 'center' },
      7: { halign: 'center', fontStyle: 'bold' },
    },
  });

  // Summary
  const finalY = (doc as any).lastAutoTable.finalY + 15;
  const totalPropostas = goals.reduce((sum, g) => sum + g.propostas_atual, 0);
  const totalValor = goals.reduce((sum, g) => sum + g.valor_atual, 0);
  const avgConversao = goals.length > 0 
    ? goals.reduce((sum, g) => sum + g.conversao_atual, 0) / goals.length 
    : 0;

  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text('Resumo Geral:', 14, finalY);
  doc.setFontSize(10);
  doc.text(`• Total de Propostas: ${totalPropostas}`, 20, finalY + 8);
  doc.text(`• Valor Total Fechado: ${formatCurrency(totalValor)}`, 20, finalY + 16);
  doc.text(`• Conversão Média: ${avgConversao.toFixed(1)}%`, 20, finalY + 24);

  doc.save(`metas_${monthName.replace(' ', '_')}.pdf`);
}

export function exportPerformanceToExcel(
  monthlyData: PerformanceData[],
  period: string
): void {
  const data = monthlyData.map(m => ({
    'Mês': m.month,
    'Total Propostas': m.total,
    'Aceitas': m.aceitas,
    'Enviadas': m.enviadas,
    'Recusadas': m.recusadas,
    'Valor Fechado': formatCurrency(m.valor),
    'Taxa Conversão': m.total > 0 ? `${((m.aceitas / m.total) * 100).toFixed(1)}%` : '0%',
  }));

  // Add totals row
  const totalPropostas = monthlyData.reduce((sum, m) => sum + m.total, 0);
  const totalAceitas = monthlyData.reduce((sum, m) => sum + m.aceitas, 0);
  const totalEnviadas = monthlyData.reduce((sum, m) => sum + m.enviadas, 0);
  const totalRecusadas = monthlyData.reduce((sum, m) => sum + m.recusadas, 0);
  const totalValor = monthlyData.reduce((sum, m) => sum + m.valor, 0);

  data.push({
    'Mês': 'TOTAL',
    'Total Propostas': totalPropostas,
    'Aceitas': totalAceitas,
    'Enviadas': totalEnviadas,
    'Recusadas': totalRecusadas,
    'Valor Fechado': formatCurrency(totalValor),
    'Taxa Conversão': totalPropostas > 0 ? `${((totalAceitas / totalPropostas) * 100).toFixed(1)}%` : '0%',
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Desempenho');

  ws['!cols'] = [
    { wch: 12 },
    { wch: 15 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 18 },
    { wch: 15 },
  ];

  XLSX.writeFile(wb, `desempenho_${period}_meses.xlsx`);
}

export function exportPerformanceToPDF(
  monthlyData: PerformanceData[],
  period: string
): void {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(18);
  doc.setTextColor(0, 100, 0);
  doc.text('COESA - Relatório de Desempenho', 14, 20);
  
  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text(`Período: Últimos ${period} meses`, 14, 28);
  doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, 35);

  // Table
  const tableData = monthlyData.map(m => [
    m.month,
    m.total.toString(),
    m.aceitas.toString(),
    m.enviadas.toString(),
    m.recusadas.toString(),
    formatCurrency(m.valor),
    m.total > 0 ? `${((m.aceitas / m.total) * 100).toFixed(1)}%` : '0%',
  ]);

  // Add totals
  const totalPropostas = monthlyData.reduce((sum, m) => sum + m.total, 0);
  const totalAceitas = monthlyData.reduce((sum, m) => sum + m.aceitas, 0);
  const totalEnviadas = monthlyData.reduce((sum, m) => sum + m.enviadas, 0);
  const totalRecusadas = monthlyData.reduce((sum, m) => sum + m.recusadas, 0);
  const totalValor = monthlyData.reduce((sum, m) => sum + m.valor, 0);

  tableData.push([
    'TOTAL',
    totalPropostas.toString(),
    totalAceitas.toString(),
    totalEnviadas.toString(),
    totalRecusadas.toString(),
    formatCurrency(totalValor),
    totalPropostas > 0 ? `${((totalAceitas / totalPropostas) * 100).toFixed(1)}%` : '0%',
  ]);

  autoTable(doc, {
    startY: 45,
    head: [['Mês', 'Total', 'Aceitas', 'Enviadas', 'Recusadas', 'Valor', 'Conversão']],
    body: tableData,
    styles: {
      fontSize: 10,
      cellPadding: 4,
    },
    headStyles: {
      fillColor: [0, 100, 0],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles: {
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'center' },
    },
    didParseCell: (data) => {
      // Style the total row
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [220, 220, 220];
      }
    },
  });

  // Summary box
  const finalY = (doc as any).lastAutoTable.finalY + 15;
  
  doc.setFillColor(240, 240, 240);
  doc.roundedRect(14, finalY, 180, 45, 3, 3, 'F');
  
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text('Resumo do Período:', 20, finalY + 12);
  
  doc.setFontSize(10);
  doc.text(`• Total de Propostas Criadas: ${totalPropostas}`, 25, finalY + 22);
  doc.text(`• Propostas Aceitas: ${totalAceitas} (${((totalAceitas/totalPropostas)*100 || 0).toFixed(1)}%)`, 25, finalY + 30);
  doc.text(`• Valor Total Fechado: ${formatCurrency(totalValor)}`, 25, finalY + 38);

  doc.save(`desempenho_${period}_meses.pdf`);
}
