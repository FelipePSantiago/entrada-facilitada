
import type { Property, PdfFormValues, PdfResults, PaymentField, PDFPageData } from "../../types";
import { format, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { jsPDF } from 'jspdf';
import type { UserOptions, CellHookData } from 'jspdf-autotable';
import { formatPercentage } from "../business/formatters";

// --- Tipos e Constantes ---
interface PDFDocumentWithTables extends jsPDF {
    lastAutoTable?: { finalY: number };
    propertyData?: Property;
    autoTable: (options: UserOptions) => jsPDF;
}

const FONT_NORMAL = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

const COLOR_PRIMARY = '#1E40AF'; // Blue-800
const COLOR_SECONDARY_TEXT = '#4B5563'; // Gray-600
const COLOR_DARK_TEXT = '#111827'; // Gray-900
const COLOR_BACKGROUND_LIGHT = '#F9FAFB'; // Gray-50
const COLOR_BORDER = '#E5E7EB'; // Gray-200
const COLOR_WHITE = '#FFFFFF';

const PAGE_MARGIN = 15;

const paymentFieldLabels: { [key: string]: string } = {
  sinalAto: "Sinal no Ato",
  sinal1: "Sinal (30 dias)",
  sinal2: "Sinal (60 dias)",
  sinal3: "Sinal (90 dias)",
  proSoluto: "Início do Pró-Soluto",
  bonusAdimplencia: "Bônus Adimplência",
  desconto: "Desconto Comercial",
  bonusCampanha: "Bônus de Campanha",
  fgts: "Utilização do FGTS",
  financiamento: "Financiamento Bancário",
  seguroObras: "Seguro de Obras (1ª Parcela)",
};

// --- Funções de Carregamento de Scripts ---
const loadScript = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
    });
};

const loadPdfLibraries = async () => {
    // Carrega a jspdf antes da jspdf-autotable, pois a segunda é um plugin da primeira.
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
};


// --- Funções de Formatação ---
const formatCurrency = (value: number) => {
  if (isNaN(value) || value === null) return "R$ 0,00";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

const formatDate = (date: Date | string) => {
    try {
        const dateObj = typeof date === 'string' ? parseISO(date) : date;
        if (!isNaN(dateObj.getTime())) {
            return format(dateObj, "dd/MM/yyyy", { locale: ptBR });
        }
    } catch {
        // Fallback for invalid date strings
    }
    return "Data inválida";
};

// --- Funções Auxiliares de Desenho ---

const addHeader = (doc: PDFDocumentWithTables, property: Property) => {
    doc.setFont(FONT_BOLD);
    doc.setFontSize(18);
    doc.setTextColor(COLOR_PRIMARY);
    doc.text("Proposta de Fluxo de Pagamento", PAGE_MARGIN, 20);

    doc.setFont(FONT_NORMAL);
    doc.setFontSize(11);
    doc.setTextColor(COLOR_SECONDARY_TEXT);
    doc.text(property.enterpriseName, PAGE_MARGIN, 28);
    
    doc.setDrawColor(COLOR_BORDER);
    doc.line(PAGE_MARGIN, 35, doc.internal.pageSize.width - PAGE_MARGIN, 35);
};

const addFooter = (doc: PDFDocumentWithTables) => {
    const pageCount = (doc.internal.pages.length - 1).toString();
    for (let i = 1; i <= parseInt(pageCount, 10) + 1; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(COLOR_SECONDARY_TEXT);
        const text = `Página ${i} de ${parseInt(pageCount, 10) + 1}`;
        const textWidth = doc.getStringUnitWidth(text) * doc.getFontSize() / doc.internal.scaleFactor;
        doc.text(text, doc.internal.pageSize.width / 2 - textWidth / 2, doc.internal.pageSize.height - 10);
        doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, PAGE_MARGIN, doc.internal.pageSize.height - 10);
    }
};

const checkPageBreak = (doc: PDFDocumentWithTables, currentY: number, requiredHeight: number): number => {
    if (currentY + requiredHeight > doc.internal.pageSize.height - 20) { // 20 for footer margin
        doc.addPage();
        if (doc.propertyData) {
            addHeader(doc, doc.propertyData);
        }
        return 45;
    }
    return currentY;
};

const addSectionTitle = (doc: PDFDocumentWithTables, title: string, y: number): number => {
    const newY = checkPageBreak(doc, y, 20);
    doc.setFont(FONT_BOLD);
    doc.setFontSize(14);
    doc.setTextColor(COLOR_PRIMARY);
    doc.text(title, PAGE_MARGIN, newY);
    return newY + 8;
};

const drawTimelineEvent = (doc: PDFDocumentWithTables, y: number, date: string, title: string, value: string, isLast: boolean): number => {
    const circleRadius = 3;
    const lineX = PAGE_MARGIN + circleRadius;
    const textX = lineX + 10;
    
    const newY = checkPageBreak(doc, y, 25);

    // Draw timeline circle and line
    doc.setFillColor(COLOR_PRIMARY);
    doc.circle(lineX, newY + circleRadius, circleRadius, 'F');
    if (!isLast) {
        doc.setDrawColor(COLOR_BORDER);
        doc.line(lineX, newY + (circleRadius * 2), lineX, newY + 40);
    }
    
    // Draw event content
    doc.setFont(FONT_BOLD);
    doc.setFontSize(11);
    doc.setTextColor(COLOR_DARK_TEXT);
    doc.text(title, textX, newY + 5);

    doc.setFont(FONT_NORMAL);
    doc.setFontSize(10);
    doc.setTextColor(COLOR_SECONDARY_TEXT);
    doc.text(date, textX, newY + 11);

    doc.setFont(FONT_BOLD);
    doc.setFontSize(12);
    doc.setTextColor(COLOR_PRIMARY);
    doc.text(value, doc.internal.pageSize.width - PAGE_MARGIN, newY + 8, { align: 'right' });
    
    return newY + 30;
};

// --- Função Principal de Geração ---

export async function generatePdf(
    formValues: PdfFormValues,
    results: PdfResults,
    selectedProperty: Property
) {
    await loadPdfLibraries();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsPDFWithAutoTable = (window as any).jspdf.jsPDF;

    const doc: PDFDocumentWithTables = new jsPDFWithAutoTable();
    doc.propertyData = selectedProperty;
    
    let currentY = 0;
 
    addHeader(doc, selectedProperty);
    currentY = 45;
    
    const unitInfo = selectedProperty.pricing?.find(p => {
        const normalizedFormUnit = formValues.selectedUnit?.match(/\d+/)?.['0'];
        return String(p.unitNumber) === normalizedFormUnit;
    });

    // --- Seção Detalhes da Unidade ---
    if (unitInfo) {
        currentY = addSectionTitle(doc, "Detalhes da Unidade", currentY);
        doc.autoTable({
            startY: currentY,
            body: [
                ['Unidade', unitInfo.unitNumber, 'Área Privativa', `${unitInfo.privateArea.toFixed(2)} m²`],
                ['Bloco/Torre', unitInfo.block, 'Posição Solar', unitInfo.sunPosition],
                ['Tipologia', unitInfo.typology, 'Vagas', unitInfo.parkingSpaces],
            ],
            theme: 'plain',
            styles: {
                font: FONT_NORMAL,
                fontSize: 10,
                cellPadding: 2,
            },
            columnStyles: {
                0: { fontStyle: 'bold', textColor: COLOR_DARK_TEXT },
                2: { fontStyle: 'bold', textColor: COLOR_DARK_TEXT },
            },
        });
        currentY = (doc.lastAutoTable?.finalY ?? currentY) + 10;
    }

    // --- Seção Resumo da Negociação ---
    currentY = addSectionTitle(doc, "Resumo da Negociação", currentY);
    const totalDiscount = (formValues.payments.find(p => p.type === 'desconto')?.value || 0) + (formValues.payments.find(p => p.type === 'bonusCampanha')?.value || 0);
    const finalSaleValue = formValues.saleValue - totalDiscount;

    doc.autoTable({
        startY: currentY,
        body: [
            ["Valor de Venda (Tabela)", formatCurrency(formValues.saleValue)],
            ["Descontos e Bônus", formatCurrency(totalDiscount)],
            ["Valor Final da Negociação", formatCurrency(finalSaleValue)],
        ],
        theme: 'striped',
        styles: { fontSize: 10, cellPadding: 3 },
        headStyles: { fillColor: COLOR_WHITE, textColor: COLOR_DARK_TEXT },
        bodyStyles: { fillColor: COLOR_BACKGROUND_LIGHT },
        alternateRowStyles: { fillColor: COLOR_WHITE },
        footStyles: { fillColor: COLOR_WHITE, textColor: COLOR_DARK_TEXT, fontStyle: 'bold' },
        columnStyles: { 0: { fontStyle: 'bold' } },
        didParseCell: (data: CellHookData) => {
             if (data.row.index === 2 && data.column.index === 0) { // Final value row
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = COLOR_PRIMARY;
            }
            if (data.row.index === 2 && data.column.index === 1) { // Final value row
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = COLOR_PRIMARY;
            }
        }
    });
    currentY = (doc.lastAutoTable?.finalY ?? currentY) + 15;


    // --- Seção Estrutura de Pagamento ---
    currentY = addSectionTitle(doc, "Estrutura de Pagamento", currentY);
    const financiamentoValue = formValues.payments.find(p => p.type === 'financiamento')?.value || 0;
    const fgtsValue = formValues.payments.find(p => p.type === 'fgts')?.value || 0;
    
    doc.autoTable({
        startY: currentY,
        body: [
            ["Financiamento Bancário", formatCurrency(financiamentoValue)],
            ["Recursos (FGTS)", formatCurrency(fgtsValue)],
            ["Saldo a Financiar (Construtora)", formatCurrency(results.financedAmount)],
        ],
        theme: 'striped',
        styles: { fontSize: 10, cellPadding: 3 },
        headStyles: { fillColor: COLOR_WHITE, textColor: COLOR_DARK_TEXT },
        bodyStyles: { fillColor: COLOR_BACKGROUND_LIGHT },
        alternateRowStyles: { fillColor: COLOR_WHITE },
        columnStyles: { 0: { fontStyle: 'bold' } },
         didParseCell: (data: CellHookData) => {
             if (data.row.index === 2 && data.column.index === 0) { 
                data.cell.styles.fontStyle = 'bold';
            }
             if (data.row.index === 2 && data.column.index === 1) { 
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });
    currentY = (doc.lastAutoTable?.finalY ?? currentY) + 15;

    // --- Seção Linha do Tempo do Pagamento ---
    currentY = addSectionTitle(doc, "Linha do Tempo do Pagamento", currentY);

    const paymentEvents: PaymentField[] = [...formValues.payments];
    const sortedEvents = paymentEvents
        .filter(p => p.type !== 'bonusAdimplencia' && p.value > 0)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedEvents.forEach((event, index) => {
        const label = paymentFieldLabels[event.type] || event.type;
        let valueStr = formatCurrency(event.value);
        
        if (event.type === 'proSoluto') {
            if(results.monthlyInstallment && formValues.installments) {
                valueStr = `${formValues.installments}x de ${formatCurrency(results.monthlyInstallment)}`;
            } else if (results.steppedInstallments && results.steppedInstallments.length > 0) {
                valueStr = `Início do plano escalonado (${formValues.installments}x)`;
            }
        }

        currentY = drawTimelineEvent(doc, currentY, formatDate(event.date), label, valueStr, index === sortedEvents.length - 1);
    });
    currentY += 10;
    
    // --- Seção Detalhes do Pró-Soluto ---
    if (results.financedAmount > 0) {
        currentY = addSectionTitle(doc, "Detalhes do Financiamento com a Construtora", currentY);
        let proSolutoData: (string|number)[][] = [];

        if (results.steppedInstallments && results.steppedInstallments.length > 0 && results.periodLengths) {
            proSolutoData = results.steppedInstallments
                .map((inst, index) => {
                    if ((results.periodLengths?.[index] ?? 0) > 0) {
                        return [`${results.periodLengths?.[index] ?? 0} parcelas`, formatCurrency(inst)];
                    }
                    return null;
                })
                .filter((item): item is string[] => item !== null) as (string|number)[][];
        } else if (results.monthlyInstallment) {
            proSolutoData.push([`${formValues.installments ?? 0} parcelas`, formatCurrency(results.monthlyInstallment)]);
        }
        
        proSolutoData.push(["Comprometimento de Renda (Pico)", formatPercentage(results.incomeCommitmentPercentage)]);

        doc.autoTable({
            startY: currentY,
            head: [['Plano de Pagamento', 'Valor da Parcela']],
            body: proSolutoData,
            theme: 'grid',
            headStyles: { fillColor: COLOR_PRIMARY, textColor: COLOR_WHITE },
        });
        currentY = (doc.lastAutoTable?.finalY ?? currentY) + 10;
    }
    
    // --- Seção Detalhamento do Seguro de Obras ---
    const sinalAtoPayment = formValues.payments.find(p => p.type === 'sinalAto');
    const sinalAtoDate = sinalAtoPayment ? startOfMonth(new Date(sinalAtoPayment.date)) : startOfMonth(new Date());

    const filteredInsuranceBreakdown = results.monthlyInsuranceBreakdown.filter(item => {
        const itemDate = startOfMonth(item.date);
        return itemDate > sinalAtoDate;
    });

    if (filteredInsuranceBreakdown.length > 0) {
        currentY = addSectionTitle(doc, "Detalhamento do Seguro de Obras", currentY);
        const insuranceData = filteredInsuranceBreakdown.map(item => [
            format(item.date, "MMMM/yyyy", { locale: ptBR }),
            formatCurrency(item.value)
        ]);

        doc.autoTable({
            startY: currentY,
            head: [['Mês', 'Valor Aproximado']],
            body: insuranceData,
            theme: 'grid',
            headStyles: { fillColor: COLOR_PRIMARY, textColor: COLOR_WHITE },
            didDrawPage: (data: PDFPageData) => {
                currentY = data.cursor?.y ?? currentY;
            }
        });
        currentY = (doc.lastAutoTable?.finalY ?? currentY) + 10;
    }

    // --- Seção Corretor Responsável ---
    if (formValues.brokerName || formValues.brokerCreci) {
        currentY = addSectionTitle(doc, "Corretor Responsável", currentY);
        doc.setFont(FONT_NORMAL);
        doc.setFontSize(10);
        doc.setTextColor(COLOR_DARK_TEXT);
        if(formValues.brokerName) {
            doc.text(`Nome: ${formValues.brokerName}`, PAGE_MARGIN, currentY);
            currentY += 7;
        }
        if(formValues.brokerCreci) {
            doc.text(`CRECI: ${formValues.brokerCreci}`, PAGE_MARGIN, currentY);
            currentY += 7;
        }
    }

    // --- Adiciona o footer em todas as páginas ---
    addFooter(doc);

    // --- Salva o PDF ---
    const safeUnitName = (formValues.selectedUnit || "Unidade").replace(/[^a-z0-9]/gi, '_');
    doc.save(`Proposta-${selectedProperty.enterpriseName.replace(/\s/g, '_')}-${safeUnitName}.pdf`);
}
