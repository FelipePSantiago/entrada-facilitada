'use client';

import { useState, useEffect, useRef, useMemo, memo, useCallback } from "react";
import { useForm, useFieldArray, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { httpsCallable, getFunctions } from "firebase/functions";
import { getAuth } from "firebase/auth";
import { app } from "@/firebase/config";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormControl,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Dialog,
} from "@/components/ui/dialog";
import {
  Wallet,
  PlusCircle,
  XCircle,
  Building,
  DollarSign,
  ShieldCheck,
  Upload,
  Loader2,
  Download,
  Grid3X3,
  Ruler,
  Sun,
  Car,
  Calculator,
  TrendingUp,
  CreditCard,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { addMonths, differenceInMonths, format, lastDayOfMonth, startOfMonth, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import * as z from "zod";
import { getNotaryFee } from "@/lib/business/notary-fees";
import { DatePicker } from "@/components/ui/date-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PaymentTimeline } from "./payment-timeline";
import { centsToBrl } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { FaSpinner } from "react-icons/fa";

const formatPercentage = (value: number) => {
  return `${(value * 100).toFixed(2)}%`;
};

const formatDate = (date: Date): string => {
  return format(date, "dd/MM/yyyy", { locale: ptBR });
};

// Função para formatar valor monetário no padrão brasileiro
const formatCurrencyBRL = (value: number | string): string => {
  const numValue = typeof value === 'string' ? parseFloat(value.replace(/[^\d,-]/g, '').replace(',', '.')) : value;
  if (isNaN(numValue)) return 'R$ 0,00';
  
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numValue);
};

const generatePdf = async (pdfValues: ExtendedPdfFormValues, results: ExtendedResults, selectedProperty: Property) => {
  try {
    const { jsPDF } = await import('jspdf');
    
    // Inicializa o PDF em modo retrato, unidades em mm, formato A4
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Configurações iniciais
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    let yPosition = margin;
    let currentPage = 1;

    // Cores do tema (Apple-inspired)
    const primaryColor = [52, 120, 246]; // Azul primário #3478F6
    const grayDark = [102, 102, 102]; // Cinza escuro #666666
    const grayMedium = [153, 153, 153]; // Cinza médio #999999
    const grayLight = [238, 238, 238]; // Cinza claro #EEEEEE
    const greenColor = [40, 167, 69]; // Verde #28A745
    const orangeColor = [255, 193, 7]; // Laranja #FFC107
    const redColor = [220, 53, 69]; // Vermelho #DC3545

    // Carregar a logo da Quadraimob da URL
    let logoData: string | null = null;
    try {
      const logoResponse = await fetch('https://i.ibb.co/XqPsv3x/Quadraimob-logo.png');
      if (logoResponse.ok) {
        const blob = await logoResponse.blob();
        logoData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    } catch (error) {
      console.warn('Não foi possível carregar a logo da Quadraimob:', error);
    }

    // Função para adicionar rodapé em todas as páginas
    const addFooter = () => {
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        
        // Adicionar linha separadora no rodapé
        pdf.setDrawColor(grayLight[0], grayLight[1], grayLight[2]);
        pdf.setLineWidth(0.5);
        pdf.line(margin, pageHeight - 25, pageWidth - margin, pageHeight - 25);
        
        // Adicionar logo da Quadraimob (se disponível)
        if (logoData) {
          try {
            // Logo no canto esquerdo - ajustado para formato webp
            pdf.addImage(logoData, 'WEBP', margin, pageHeight - 20, 35, 8);
          } catch (error) {
            console.warn('Erro ao adicionar a logo no rodapé:', error);
            // Fallback: texto simples se a imagem não carregar
            pdf.setFont('Helvetica', 'bold');
            pdf.setFontSize(10);
            pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            pdf.text('Quadraimob', margin, pageHeight - 15);
          }
        } else {
          // Fallback: texto simples se não houver logo
          pdf.setFont('Helvetica', 'bold');
          pdf.setFontSize(10);
          pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
          pdf.text('Quadraimob', margin, pageHeight - 15);
        }
        
        // Paginação (canto inferior direito)
        pdf.setFont('Helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(grayMedium[0], grayMedium[1], grayMedium[2]);
        const paginationText = `Página ${i} de ${pageCount}`;
        const textWidth = pdf.getTextWidth(paginationText);
        pdf.text(paginationText, pageWidth - margin - textWidth, pageHeight - 15);
        
      }
    };

    // Função para verificar e adicionar nova página se necessário
    const checkNewPage = (spaceNeeded: number = 10) => {
      if (yPosition + spaceNeeded > pageHeight - margin - 30) { // Ajustado para considerar o rodapé
        pdf.addPage();
        yPosition = margin;
        currentPage++;
      }
    };

    // Função auxiliar para adicionar seção
    const addSection = (title: string, fontSize: number = 16) => {
      checkNewPage(15);
      pdf.setFont('Helvetica', 'bold');
      pdf.setFontSize(fontSize);
      pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      pdf.text(title, margin, yPosition);
      yPosition += 8;
      pdf.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      pdf.line(margin, yPosition, margin + 40, yPosition);
      yPosition += 12;
    };

    // Função para adicionar linha de informação
    const addInfoLine = (label: string, value: string | number, isBold: boolean = false, color?: number[], isCurrency: boolean = false) => {
      checkNewPage(6);
      pdf.setFont('Helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(grayDark[0], grayDark[1], grayDark[2]);
      pdf.text(label + ':', margin, yPosition);
      
      pdf.setFont('Helvetica', isBold ? 'bold' : 'normal');
      if (color) {
        pdf.setTextColor(color[0], color[1], color[2]);
      } else {
        pdf.setTextColor(0, 0, 0);
      }
      
      let valueText: string;
      if (typeof value === 'number') {
        if (isCurrency) {
          valueText = formatCurrencyBRL(value);
        } else {
          valueText = value.toString();
        }
      } else {
        valueText = value;
      }
      
      const valueWidth = pdf.getTextWidth(valueText);
      pdf.text(valueText, pageWidth - margin - valueWidth, yPosition);
      
      yPosition += 5;
    };

    // Função para adicionar linha destacada
    const addHighlightedLine = (label: string, value: number, bgColor: number[], textColor: number[], isCurrency: boolean = true) => {
      checkNewPage(10);
      
      // Adicionar fundo destacado
      pdf.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
      pdf.rect(margin, yPosition - 4, pageWidth - 2 * margin, 8, 'F');
      
      // Adicionar texto
      pdf.setFont('Helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
      pdf.text(label + ':', margin, yPosition);
      
      const valueText = isCurrency ? formatCurrencyBRL(value) : value.toString();
      const valueWidth = pdf.getTextWidth(valueText);
      pdf.text(valueText, pageWidth - margin - valueWidth, yPosition);
      
      yPosition += 8;
    };

    // ===== CABEÇALHO DO DOCUMENTO =====
    pdf.setFont('Helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.text('Proposta de Financiamento Imobiliário', pageWidth / 2, 20, { align: 'center' });

    pdf.setFont('Helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(grayDark[0], grayDark[1], grayDark[2]);
    pdf.text(`Data: ${formatDate(new Date())}`, pageWidth / 2, 28, { align: 'center' });

    yPosition = 45;

    // ===== DADOS INICIAIS =====
    addSection('Dados Iniciais', 16);

    addInfoLine('Nome do(a) corretor(a)', pdfValues.brokerName || 'Não informado');
    
    // Adicionar CRECI apenas se informado
    if (pdfValues.brokerCreci) {
      addInfoLine('CRECI', pdfValues.brokerCreci);
    }
    
    addInfoLine('Empreendimento', selectedProperty.enterpriseName || 'Não informado');
    
    // Obter data de entrega
    const deliveryDate = selectedProperty.deliveryDate ? 
      (typeof selectedProperty.deliveryDate === 'string' ? parseISO(selectedProperty.deliveryDate) : selectedProperty.deliveryDate) : 
      null;
    addInfoLine('Data de entrega', deliveryDate ? formatDate(deliveryDate) : 'Não informada');
    addInfoLine('Data da simulação', formatDate(new Date()));

    yPosition += 10;

    // ===== DADOS DO IMÓVEL =====
    addSection('Dados do Imóvel', 16);

    // Dados da unidade
    const unitData = selectedProperty.pricing?.[0] || selectedProperty.blocks?.[0]?.units?.[0];
    
    addInfoLine('Unidade escolhida', pdfValues.selectedUnit || 'Não informada');
    addInfoLine('Valor de avaliação', pdfValues.appraisalValue || 0, false, undefined, true);
    
    // Bônus da construtora - Destaque elegante
    const bonusAdimplenciaValue = results.bonusAdimplenciaValue || 
                                 pdfValues.payments?.find(p => p.type === 'bonusAdimplencia')?.value || 0;
    if (bonusAdimplenciaValue > 0) {
      addHighlightedLine(
        'Bônus da construtora', 
        bonusAdimplenciaValue, 
        [240, 248, 255], // Fundo azul muito claro
        [51, 102, 153],  // Azul escuro
        true
      );
    }
    
    // Desconto - Destaque elegante
    const descontoValue = pdfValues.payments?.find(p => p.type === 'desconto')?.value || 0;
    if (descontoValue > 0) {
      addHighlightedLine(
        'Desconto', 
        descontoValue, 
        [255, 248, 240], // Fundo laranja muito claro
        [204, 102, 0],   // Laranja escuro
        true
      );
    }
    
    addInfoLine('Valor de venda', pdfValues.saleValue || 0, false, undefined, true);
    
    // Valor final com desconto - Destaque elegante
    const effectiveSaleValue = (pdfValues.saleValue || 0) - descontoValue;
    if (effectiveSaleValue !== pdfValues.saleValue) {
      addHighlightedLine(
        'Valor final com desconto', 
        effectiveSaleValue, 
        [240, 255, 240], // Fundo verde muito claro
        [0, 102, 51],    // Verde escuro
        true
      );
    }

    yPosition += 10;

    // ===== SIMULAÇÃO DE FINANCIAMENTO CAIXA =====
    addSection('Simulação de Financiamento Caixa', 16);

    // Verificar se há dados da simulação da Caixa
    const caixaSimulation = results.caixaSimulation;
    if (caixaSimulation && caixaSimulation.sucesso && caixaSimulation.dados) {
      // CORREÇÃO: Usar o valor do financiamento do formulário (já convertido para número)
      const financiamentoPayment = pdfValues.payments?.find(p => p.type === 'financiamento');
      const financiamentoValue = financiamentoPayment?.value || 0;
      addInfoLine('Valor de financiamento', financiamentoValue, false, undefined, true);

      
      // Correção: Prazo total = prazo do financiamento da simulação automatizada
      addInfoLine('Prazo total', caixaSimulation.dados.Prazo || 'Não informado');
      
      // Correção: Juros efetivos = taxa da simulação automatizada (formato 0%-15%)
      const jurosEfetivos = caixaSimulation.dados.Juros_Efetivos || 'Não informado';
      // Garantir formato correto (0%-15%)
      const jurosFormatado = typeof jurosEfetivos === 'string' && jurosEfetivos.includes('%') 
        ? jurosEfetivos 
        : `${jurosEfetivos}%`;
      addInfoLine('Juros efetivos', jurosFormatado);
    } else {
      addInfoLine('Valor de financiamento', results.totalFinancedCost || 0, false, undefined, true);
      addInfoLine('Prazo total', `${pdfValues.installments || 0} meses`);
      addInfoLine('Juros efetivos', `${(results.averageInterestRate * 100).toFixed(2)}%`);
    }

    yPosition += 10;

    // ===== DADOS DE PARCELAMENTO DA CONSTRUTORA =====
    addSection('Dados de Parcelamento da Construtora', 16);

    // Correção: Total parcelado = valor do pró-soluto
    const proSolutoPayment = pdfValues.payments?.find(p => p.type === 'proSoluto');
    const proSolutoValue = proSolutoPayment?.value || 0;
    addInfoLine('Total parcelado', proSolutoValue, false, undefined, true);
    
    // Correção: Número de parcelas = número de parcelas do pró-soluto
    const proSolutoInstallments = pdfValues.installments || 0;
    addInfoLine('Número de parcelas', proSolutoInstallments);
    
    // Correção: Valor da parcela = Parcela Mensal do pró-soluto
    const proSolutoInstallmentValue = results.monthlyInstallment || 0;
    addInfoLine('Valor da parcela', proSolutoInstallmentValue, false, undefined, true);

    yPosition += 10;

    // ===== FLUXO DE PAGAMENTO =====
    addSection('Fluxo de Pagamento', 16);

    // Resumo de todos os pagamentos
    const paymentSummary = [
      // Correção: "Entrada" deve ser substituído por "Sinal Ato"
      { label: 'Sinal Ato', value: results.totalEntryCost || 0 },
      { label: 'Pró-Soluto', value: results.totalProSolutoCost || 0 },
      { label: 'Financiamento', value: results.totalFinancedCost || 0 },
      { label: 'Taxas Cartorárias', value: results.totalNotaryCost || 0 },
      { label: 'Seguro de Obras', value: results.totalInsuranceCost || 0 },
    ];

    paymentSummary.forEach(item => {
      addInfoLine(item.label, item.value, false, undefined, true);
    });

    // Linha separadora
    checkNewPage(10);
    pdf.setDrawColor(grayLight[0], grayLight[1], grayLight[2]);
    pdf.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 5;

    // Total geral
    pdf.setFont('Helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.text('Custo Total:', margin, yPosition);
    const totalText = formatCurrencyBRL(results.totalCost);
    const totalWidth = pdf.getTextWidth(totalText);
    pdf.text(totalText, pageWidth - margin - totalWidth, yPosition);
    yPosition += 10;

    yPosition += 10;

    // ===== TAXAS CARTORÁRIAS =====
    addSection('Taxas Cartorárias', 16);

    addInfoLine('Total', results.totalNotaryCost || 0, false, undefined, true);
    addInfoLine('Tipo de parcelamento', pdfValues.notaryPaymentMethod === 'creditCard' ? 'Cartão de Crédito' : 'Boleto');
    // Número de parcelas não é um campo monetário
    addInfoLine('Número de parcelas', pdfValues.notaryInstallments || 0);
    
    if (results.notaryInstallmentValue) {
      addInfoLine('Valor da parcela', results.notaryInstallmentValue, false, undefined, true);
    }

    yPosition += 10;

    // ===== CRONOGRAMA DE PAGAMENTOS =====
    pdf.addPage();
    yPosition = margin;

    addSection('Cronograma de Pagamentos', 18);

    // Preparar todos os eventos de pagamento
    const paymentEvents: Array<{
      type: string;
      date: Date;
      value: number;
      description?: string;
    }> = [];

    // Pagamentos do formulário
    if (pdfValues.payments && pdfValues.payments.length > 0) {
      pdfValues.payments.forEach(payment => {
        let typeLabel = '';
        switch (payment.type) {
          case 'sinalAto': typeLabel = 'Sinal no Ato'; break;
          case 'sinal1': typeLabel = 'Sinal 1'; break;
          case 'sinal2': typeLabel = 'Sinal 2'; break;
          case 'sinal3': typeLabel = 'Sinal 3'; break;
          case 'proSoluto': 
            // Adicionar parcelas do pró-soluto mês a mês
            if (deliveryDate && payment.value > 0 && pdfValues.installments) {
              for (let i = 1; i <= pdfValues.installments; i++) {
                const installmentDate = addMonths(new Date(), i);
                // Verificar se a parcela está dentro do período de construção
                if (installmentDate <= deliveryDate) {
                  paymentEvents.push({
                    type: `Pró-Soluto - Parcela ${i}`,
                    date: installmentDate,
                    value: results.monthlyInstallment || 0,
                  });
                }
              }
            }
            return; // Não adicionar o pró-soluto como valor total
          case 'bonusAdimplencia': typeLabel = 'Bônus Adimplência'; break;
          case 'desconto': typeLabel = 'Desconto'; break;
          case 'bonusCampanha': typeLabel = 'Bônus de Campanha'; break;
          case 'fgts': typeLabel = 'FGTS'; break;
          case 'financiamento': typeLabel = 'Financiamento'; break;
          default: typeLabel = payment.type;
        }
        
        // Adicionar outros pagamentos (exceto pró-soluto que já foi tratado)
        if (!["proSoluto"].includes(payment.type)) {
          paymentEvents.push({
            type: typeLabel,
            date: payment.date,
            value: payment.value,
          });
        }
      });
    }

    // Parcelas do seguro de obras
    if (results.monthlyInsuranceBreakdown && results.monthlyInsuranceBreakdown.length > 0) {
      results.monthlyInsuranceBreakdown.forEach(insurance => {
        if (insurance.isPayable) {
          paymentEvents.push({
            type: 'Seguro de Obras',
            date: insurance.date,
            value: insurance.value,
            description: `Progresso: ${(insurance.progressRate * 100).toFixed(1)}%`
          });
        }
      });
    }

    // Parcelas das taxas cartorárias
    if (results.notaryInstallmentValue && pdfValues.notaryInstallments) {
      for (let i = 0; i < pdfValues.notaryInstallments; i++) {
        const installmentDate = addMonths(new Date(), i + 1);
        paymentEvents.push({
          type: 'Taxas Cartorárias',
          date: installmentDate,
          value: results.notaryInstallmentValue,
        });
      }
    }

    // Ordenar por data
    paymentEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Cabeçalho da tabela
    checkNewPage(15);
    pdf.setFont('Helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(255, 255, 255);
    pdf.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.rect(margin, yPosition, pageWidth - 2 * margin, 8, 'F');
    
    pdf.text('Tipo de Pagamento', margin + 5, yPosition + 5);
    pdf.text('Data', pageWidth / 2 - 15, yPosition + 5);
    pdf.text('Valor', pageWidth - margin - 25, yPosition + 5);
    
    yPosition += 10;

    // Dados da tabela
    pdf.setFont('Helvetica', 'normal');
    pdf.setFontSize(9);
    
    paymentEvents.forEach((event, index) => {
      checkNewPage(8);
      
      // Fundo zebrado
      if (index % 2 === 0) {
        pdf.setFillColor(grayLight[0], grayLight[1], grayLight[2]);
        pdf.rect(margin, yPosition, pageWidth - 2 * margin, 6, 'F');
      }

      pdf.setTextColor(0, 0, 0);
      
      // Tipo de pagamento
      pdf.text(event.type, margin + 5, yPosition + 4);
      
      // Data
      const dateText = formatDate(event.date);
      pdf.text(dateText, pageWidth / 2 - 15, yPosition + 4);
      
      // Valor
      pdf.setFont('Helvetica', 'bold');
      const valueText = formatCurrencyBRL(event.value);
      const valueWidth = pdf.getTextWidth(valueText);
      pdf.text(valueText, pageWidth - margin - 5 - valueWidth, yPosition + 4);
      pdf.setFont('Helvetica', 'normal');
      
      // Descrição (se houver)
      if (event.description) {
        pdf.setFontSize(8);
        pdf.setTextColor(grayMedium[0], grayMedium[1], grayMedium[2]);
        pdf.text(event.description, margin + 5, yPosition + 8);
        yPosition += 3;
        pdf.setFontSize(9);
      }
      
      yPosition += 6;
    });

    yPosition += 10;

    // ===== OBSERVAÇÕES =====
    addSection('Observações', 16);

    const observations = [
      'O saldo devedor do financiamento com a Caixa não sofre correção durante o período de obras;',
      'O saldo devedor financiado com a Caixa Econômica Federal começará a ser pago somente após a emissão do habite-se;',
      'O seguro de obras é pago à Caixa Econômica Federal somente até a emissão do habite-se (que normalmente coincide com a entrega do empreendimento, podendo ser adiantada);',
      'As parcelas do seguro de obras possuem correção da taxa referencial (TR), o que pode fazer divergir do valor base apresentado na simulação;',
      'As parcelas do pró-soluto (parte da entrada parcelada com a construtora) podem ser amortizadas, podendo o cliente fazê-lo diretamente pelo aplicativo Pode Morar ou entrando em contato com a central de atendimento da Direcional;'
    ];

    pdf.setFont('Helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(grayDark[0], grayDark[1], grayDark[2]);

    observations.forEach(observation => {
      checkNewPage(8);
      
      // Adicionar marcador de lista
      pdf.setFont('Helvetica', 'bold');
      pdf.text('•', margin, yPosition + 3);
      
      // Adicionar texto da observação
      pdf.setFont('Helvetica', 'normal');
      const lines = pdf.splitTextToSize(observation, pageWidth - 2 * margin - 5);
      lines.forEach((line: string) => {
        pdf.text(line, margin + 5, yPosition + 3);
        yPosition += 5;
      });
      
      yPosition += 3;
    });

    // ===== FINALIZAR =====
    // Adicionar rodapé em todas as páginas
    addFooter();

    // Gerar o arquivo
    const fileName = `proposta-financiamento-${selectedProperty.enterpriseName.replace(/\s+/g, '-')}-${formatDate(new Date())}.pdf`;
    pdf.save(fileName);

    return Promise.resolve();
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    throw error;
  }
};

import type { 
  Property, 
  Unit, 
  CombinedUnit, 
  UnitStatus, 
  PaymentField, 
  Results, 
  MonthlyInsurance, 
  FormValues, 
  PdfFormValues, 
  PaymentFieldType, 
  Tower, 
  ExtractPricingOutput 
} from "@/types";
import React from 'react';

// Adicione isso após os imports
interface ExtractFinancialDataInput {
  fileDataUri: string;
}

interface CaixaSimulationResult {
  sucesso: boolean;
  dados?: {
    Prazo: string;
    Valor_Total_Financiado: string;
    Primeira_Prestacao: string;
    Juros_Efetivos: string;
  };
  message?: string;
}

// Adicionar funções de validação de arquivo
const validateMimeType = (file: File, allowedTypes: string[]): boolean => {
  return allowedTypes.includes(file.type);
};

const validateFileSize = (file: File, maxSize: number): boolean => {
  return file.size <= maxSize;
};

// Adicionar tipo para a função de extração
interface ExtractFinancialDataInput {
  fileDataUri: string;
}

const insuranceCache = new Map<string, { total: number; breakdown: MonthlyInsurance[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

const paymentFieldSchema = z.object({
  type: z.enum([
    "sinalAto",
    "sinal1",
    "sinal2",
    "sinal3",
    "proSoluto",
    "bonusAdimplencia",
    "desconto",
    "bonusCampanha",
    "fgts",
    "financiamento",
  ]),
  value: z.coerce.number().min(0, { message: "O valor deve ser positivo." }),
  date: z.date({ required_error: "A data é obrigatória." }),
});

const formSchema = z.object({
  propertyId: z.string().min(1, { message: "Selecione um imóvel." }),
  selectedUnit: z.string().optional(),
  brokerName: z.string().optional(),
  brokerCreci: z.string().optional(),
  appraisalValue: z.coerce.number().positive({ message: "O valor de avaliação é obrigatório."}),
  saleValue: z.coerce.number().positive({ message: "O valor de venda é obrigatório."}),
  grossIncome: z.coerce.number().positive({ message: "A renda bruta é obrigatória."}),
  simulationInstallmentValue: z.coerce.number().positive({ message: "O valor da parcela é obrigatório."}),
  financingParticipants: z.coerce.number().int().min(1, "Selecione o número de participantes.").max(4),
  payments: z.array(paymentFieldSchema),
  conditionType: z.enum(["padrao", "especial"]),
  installments: z.coerce
    .number()
    .int()
    .min(1, { message: "Mínimo de 1 parcela." })
    .optional(),
  notaryFees: z.coerce.number().optional(),
  notaryPaymentMethod: z.enum(["creditCard", "bankSlip"]),
  notaryInstallments: z.coerce.number().int().optional(),
}).refine(data => {
    if (data.notaryPaymentMethod === 'creditCard') {
        return !data.notaryInstallments || (data.notaryInstallments >= 1 && data.notaryInstallments <= 12);
    }
    return true;
}, {
    message: "Para cartão de crédito, o parcelamento é de 1 a 12 vezes.",
    path: ["notaryInstallments"],
}).refine(data => {
    if (data.notaryPaymentMethod === 'bankSlip') {
        return !data.notaryInstallments || [36, 40].includes(data.notaryInstallments);
    }
    return true;
}, {
    message: "Para boleto, o parcelamento é de 36 ou 40 vezes.",
    path: ["notaryInstallments"],
});

const paymentFieldOptions: { value: PaymentFieldType; label: string }[] = [
  { value: "sinalAto", label: "Sinal Ato" },
  { value: "sinal1", label: "Sinal 1" },
  { value: "sinal2", label: "Sinal 2" },
  { value: "sinal3", label: "Sinal 3" },
  { value: "proSoluto", label: "Pró-Soluto" },
  { value: "bonusAdimplencia", label: "Bônus Adimplência" },
  { value: "desconto", label: "Desconto" },
  { value: "bonusCampanha", label: "Bônus de Campanha" },
  { value: "fgts", label: "FGTS" },
  { value: "financiamento", label: "Financiamento" },
] as const;

interface ExtendedResults extends Omit<Results, 'totalEntryCost' | 'totalProSolutoCost' | 'totalFinancedCost' | 'totalNotaryCost' | 'totalInsuranceCost'> {
  paymentValidation?: {
    isValid: boolean;
    difference: number;
    expected: number;
    actual: number;
    businessLogicViolation?: string;
  };
  totalEntryCost: number;
  totalProSolutoCost: number;
  totalFinancedCost: number;
  totalNotaryCost: number;
  totalInsuranceCost: number;
  effectiveSaleValue?: number;
  priceInstallment?: number;
  notaryInstallment?: number;
  constructionInsurance?: {
    breakdown: MonthlyInsurance[];
  };
  totalCost: number;
  paymentFields?: PaymentField[];
  payments?: PaymentField[];
  appraisalValue?: number;
  saleValue?: number;
  grossIncome?: number;
  simulationInstallmentValue?: number;
  financingParticipants?: number;
  conditionType?: string;
  installments?: number;
  notaryFees?: number;
  notaryPaymentMethod?: string;
  notaryInstallments?: number;
  caixaSimulation?: CaixaSimulationResult;
}

interface ExtendedPdfFormValues extends PdfFormValues {
  property?: Property;
}

interface ExtractedDataType extends ExtractPricingOutput {
  grossIncome?: number;
  simulationInstallmentValue?: number;
}

const validatePaymentSumWithBusinessLogic = (
  payments: PaymentField[], 
  appraisalValue: number, 
  saleValue: number,
  isSinalCampaignActive: boolean,
  sinalCampaignLimitPercent?: number
): { 
  isValid: boolean; 
  difference: number; 
  expected: number; 
  actual: number;
  businessLogicViolation?: string;
} => {
  void sinalCampaignLimitPercent;

  const hasBonusAdimplencia = appraisalValue > saleValue;
  
  const totalPayments = payments.reduce((sum, payment) => {
    // Com bônus de adimplência: incluir TODOS os pagamentos
    if (hasBonusAdimplencia) {
      return sum + payment.value;
    } else {
      // Sem bônus: excluir apenas o desconto (lógica original)
      if (payment.type !== 'desconto') {
        return sum + payment.value;
      }
      return sum;
    }
  }, 0);

  const descontoPayment = payments.find(p => p.type === 'desconto');
  const descontoValue = descontoPayment?.value || 0;
  const valorFinalImovel = saleValue - descontoValue;
  
  // CORREÇÃO: Lógica corrigida para calculationTarget
  let calculationTarget: number;
  
  if (hasBonusAdimplencia) {
    // Quando há bônus de adimplência, o target é SEMPRE o valor de avaliação
    calculationTarget = appraisalValue;
  } else {
    // CASO ESPECÍFICO: avaliação < venda E valor final < avaliação
    if (appraisalValue < saleValue && valorFinalImovel < appraisalValue) {
      calculationTarget = valorFinalImovel;
    } else {
      // Caso geral: usar o maior entre avaliação e valor final
      calculationTarget = Math.max(appraisalValue, valorFinalImovel);
    }
  }
  
  const difference = Math.abs(totalPayments - calculationTarget);
  const isValid = difference < 0.01;
  
  let businessLogicViolation: string | undefined;
  
  const sinalAto = payments.find(p => p.type === 'sinalAto');
  if (sinalAto) {
    const sinalMinimo = 0.055 * valorFinalImovel;
    if (sinalAto.value < sinalMinimo) {
      businessLogicViolation = `O Sinal Ato (${centsToBrl(sinalAto.value * 100)}) é menor que o mínimo de 5,5% do valor final da unidade (${centsToBrl(sinalMinimo * 100)}).`;
    }
  }
  
  const campaignBonus = payments.find(p => p.type === 'bonusCampanha');
  
  if (campaignBonus && sinalAto && isSinalCampaignActive) {
    const sinalMinimo = 0.055 * valorFinalImovel;
    if (sinalAto.value <= sinalMinimo) {
      businessLogicViolation = "Bônus de campanha não pode existir quando o sinal ato é igual ou inferior ao mínimo (5%).";
    }
  }
  
  return {
    isValid,
    difference,
    expected: calculationTarget,
    actual: totalPayments,
    businessLogicViolation
  };
};

const calculatePriceInstallment = (
  principal: number,
  installments: number,
  deliveryDate: Date | null,
  payments: PaymentField[]
) => {
  if (principal <= 0 || installments <= 0 || !deliveryDate) return { installment: 0, total: 0 };
  
  const rateBeforeDelivery = 0.005; 
  const rateAfterDelivery = 0.015; 
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const deliveryMonth = startOfMonth(deliveryDate);
  
  let gracePeriodMonths = 1;
  if (payments.some((p) => p.type === "sinal1")) gracePeriodMonths++;
  if (payments.some((p) => p.type === "sinal2")) gracePeriodMonths++;
  if (payments.some((p) => p.type === "sinal3")) gracePeriodMonths++;

  if (deliveryDate < today) {
    gracePeriodMonths += differenceInMonths(today, deliveryDate);
  }
  
  let annuityFactor = 0;
  
  for (let i = 1; i <= installments; i++) {
    let discountFactor = 1;
    for (let j = 1; j <= i; j++) {
      const pastInstallmentDate = addMonths(today, j);
      const pastInstallmentMonth = startOfMonth(pastInstallmentDate);
      const pastRate = pastInstallmentMonth < deliveryMonth ? rateBeforeDelivery : rateAfterDelivery;
      discountFactor /= 1 + pastRate;
    }
    annuityFactor += discountFactor;
  }
  
  if (annuityFactor === 0) return { installment: 0, total: principal };
  
  const baseInstallment = principal / annuityFactor;
  
  let correctedInstallment = baseInstallment;
  for (let i = 0; i < gracePeriodMonths; i++) {
    const graceMonthDate = addMonths(today, i);
    const graceMonth = startOfMonth(graceMonthDate);
    const rate = graceMonth < deliveryMonth ? rateBeforeDelivery : rateAfterDelivery;
    correctedInstallment *= (1 + rate);
  }
  
  return { installment: correctedInstallment, total: correctedInstallment * installments };
};

const findMaxProSolutoByIncome = (
  maxAffordableInstallment: number,
  installments: number,
  deliveryDate: Date,
  payments: PaymentField[],
  calculatePriceInstallmentFn: (principal: number, installments: number, deliveryDate: Date | null, payments: PaymentField[]) => { installment: number; }
): number => {
  if (maxAffordableInstallment <= 0 || installments <= 0) {
    return 0;
  }

  let low = 0;
  let high = payments.reduce((sum, p) => sum + p.value, 0); 
  let result = 0;

  const precision = 0.01; 
  const maxIterations = 30;

  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const { installment } = calculatePriceInstallmentFn(mid, installments, deliveryDate, payments);

    if (installment <= maxAffordableInstallment) {
      result = mid; 
      low = mid;
    } else {
      high = mid; 
    }

    if (high - low < precision) {
      break;
    }
  }

  return result;
};

const calculateCorrectedProSoluto = (
  proSolutoValue: number,
  deliveryDate: Date | null,
  payments: PaymentField[]
): number => {
  if (proSolutoValue <= 0 || !deliveryDate) return proSolutoValue;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let currentGracePeriodMonths = 1;
  const hasSinal1 = payments.some(p => p.type === 'sinal1');
  const hasSinal2 = payments.some(p => p.type === 'sinal2');
  const hasSinal3 = payments.some(p => p.type === 'sinal3');
  if (hasSinal1) currentGracePeriodMonths++;
  if (hasSinal2) currentGracePeriodMonths++;
  if (hasSinal3) currentGracePeriodMonths++;

  if (deliveryDate < today) {
    currentGracePeriodMonths += differenceInMonths(today, deliveryDate);
  }

  let proSolutoCorrigido = proSolutoValue;
  for (let i = 0; i < currentGracePeriodMonths; i++) {
    const installmentDate = addMonths(today, i);
    const installmentMonth = startOfMonth(installmentDate);
    const deliveryMonth = startOfMonth(deliveryDate);
    const interestRate = installmentMonth < deliveryMonth ? 0.005 : 0.015;
    proSolutoCorrigido *= (1 + interestRate);
  }

  return proSolutoCorrigido;
};

const applyMinimumCondition = (
  payments: PaymentField[], 
  appraisalValue: number, 
  saleValue: number,
  isSinalCampaignActive: boolean,
  sinalCampaignLimitPercent: number | undefined,
  conditionType: 'padrao' | 'especial',
  propertyEnterpriseName: string,
  grossIncome: number,
  simulationInstallmentValue: number,
  installments: number,
  deliveryDate: Date | null
): PaymentField[] => {
  // Criar cópia dos pagamentos para não modificar o original
  const newPayments = [...payments];

  // Calcular valor final do imóvel (valor de venda - desconto)
  const descontoPayment = newPayments.find(p => p.type === 'desconto');
  const descontoValue = descontoPayment?.value || 0;
  const valorFinalImovel = saleValue - descontoValue;

  // Determinar se há bônus de adimplência
  const hasBonusAdimplencia = appraisalValue > saleValue;
  const bonusAdimplenciaValue = hasBonusAdimplencia ? appraisalValue - saleValue : 0;

  // CORREÇÃO CRÍTICA: Lógica para determinar o alvo de cálculo
  let calculationTarget: number;
  
  if (hasBonusAdimplencia) {
    // Quando há bônus de adimplência: target = valor de avaliação
    calculationTarget = appraisalValue;
  } else {
    // CORREÇÃO: Quando NÃO há bônus de adimplência
    if (appraisalValue < saleValue && valorFinalImovel < appraisalValue) {
      // CASO ESPECÍFICO: avaliação < venda E valor final < avaliação
      // Usar valor final como alvo (valor de venda - desconto)
      calculationTarget = valorFinalImovel;
    } else {
      // Caso geral: usar o maior entre avaliação e valor final
      calculationTarget = Math.max(appraisalValue, valorFinalImovel);
    }
  }

  // CORREÇÃO CRÍTICA: Somar apenas os pagamentos relevantes para o caso específico
  const sumOfOtherPayments = newPayments.reduce((acc, payment) => {
    // Para o caso específico (sem bônus de adimplência), excluir desconto
    if (!hasBonusAdimplencia) {
      if (!["sinalAto", "proSoluto", "bonusCampanha", "bonusAdimplencia", "desconto"].includes(payment.type)) {
        return acc + payment.value;
      }
    } else {
      // Para casos com bônus de adimplência, manter lógica original
      if (!["sinalAto", "proSoluto", "bonusCampanha", "bonusAdimplencia"].includes(payment.type)) {
        return acc + payment.value;
      }
    }
    return acc;
  }, 0);

  // CORREÇÃO: Calcular valor restante considerando bônus de adimplência
  let remainingAmount: number;
  
  if (hasBonusAdimplencia) {
    // Quando há bônus: target - (todos os pagamentos existentes) - bônus adimplência
    remainingAmount = calculationTarget - sumOfOtherPayments - bonusAdimplenciaValue;
  } else {
    // Quando não há bônus: target - (pagamentos existentes exceto desconto)
    remainingAmount = calculationTarget - sumOfOtherPayments;
  }

  // CORREÇÃO: Para o caso específico, garantir que estamos distribuindo o valor correto
  console.log(`Debug - Caso específico:
    appraisalValue: ${appraisalValue}
    saleValue: ${saleValue}
    valorFinalImovel: ${valorFinalImovel}
    calculationTarget: ${calculationTarget}
    sumOfOtherPayments: ${sumOfOtherPayments}
    remainingAmount: ${remainingAmount}
    hasBonusAdimplencia: ${hasBonusAdimplencia}`);

  // Se não há valor restante para distribuir, retornar pagamentos sem sinal ato e pró-soluto
  if (remainingAmount <= 0) {
    const finalPayments = newPayments.filter(p => !["sinalAto", "proSoluto", "bonusCampanha"].includes(p.type));
    
    // Adicionar bônus adimplência se necessário
    if (bonusAdimplenciaValue > 0) {
      const bonusAdimplenciaPayment = newPayments.find(p => p.type === 'bonusAdimplencia');
      if (!bonusAdimplenciaPayment) {
        finalPayments.push({
          type: 'bonusAdimplencia', 
          value: bonusAdimplenciaValue, 
          date: deliveryDate || new Date(),
        });
      }
    }
    
    return finalPayments;
  }

  // CORREÇÃO: Verificar se precisamos criar campos pró-soluto e sinal ato proativamente
  const hasProSoluto = newPayments.some(p => p.type === 'proSoluto');
  const hasSinalAto = newPayments.some(p => p.type === 'sinalAto');
  
  // Se não existem os campos e temos valor restante, criar proativamente
  if ((!hasProSoluto || !hasSinalAto) && remainingAmount > 0) {
    // Determinar limites do pró-soluto
    const isReservaParque = propertyEnterpriseName.includes('Reserva Parque Clube');
    const proSolutoLimitPercent = isReservaParque ? 0.1799 : (conditionType === 'especial' ? 0.1799 : 0.1499);
    
    // Calcular valor máximo do pró-soluto baseado no percentual
    const maxProSolutoByPercent = valorFinalImovel * proSolutoLimitPercent;

    // Calcular valor máximo do pró-soluto baseado na renda
    const maxAffordableInstallment = (grossIncome * 0.50) - simulationInstallmentValue;
    const maxProSolutoByIncome = findMaxProSolutoByIncome(
      maxAffordableInstallment,
      installments,
      deliveryDate || new Date(),
      newPayments,
      calculatePriceInstallment
    );

    // Função para encontrar o valor base máximo do pró-soluto que não exceda o limite quando corrigido
    const findMaxProSolutoBaseValue = (
      maxCorrectedValue: number,
      deliveryDate: Date | null,
      payments: PaymentField[]
    ): number => {
      if (maxCorrectedValue <= 0 || !deliveryDate) return 0;

      let low = 0;
      let high = remainingAmount;
      let result = 0;

      const precision = 0.01;
      const maxIterations = 30;

      for (let i = 0; i < maxIterations; i++) {
        const mid = (low + high) / 2;
        const correctedValue = calculateCorrectedProSoluto(mid, deliveryDate, payments);

        if (correctedValue <= maxCorrectedValue) {
          result = mid;
          low = mid;
        } else {
          high = mid;
        }

        if (high - low < precision) {
          break;
        }
      }

      return result;
    };

    // Encontrar valor base máximo do pró-soluto considerando correção
    const maxProSolutoBaseValue = findMaxProSolutoBaseValue(
      maxProSolutoByPercent,
      deliveryDate || new Date(),
      newPayments
    );

    // O valor do pró-soluto é o mínimo entre os limites
    let proSolutoValue = Math.min(
      maxProSolutoBaseValue,
      maxProSolutoByIncome,
      remainingAmount
    );
    
    // Garantir que não seja negativo
    proSolutoValue = Math.max(0, proSolutoValue);

    // Calcular sinal ato inicial (remainingAmount - pró-soluto)
    const sinalMinimo = 0.055 * valorFinalImovel;
    let sinalAtoValue = remainingAmount - proSolutoValue;
    
    // CORREÇÃO CRÍTICA: Garantir que sinal ato atenda ao mínimo
    if (sinalAtoValue < sinalMinimo) {
      const diferencaNecessaria = sinalMinimo - sinalAtoValue;
      
      // Se possível, reduzir pró-soluto para aumentar sinal ato
      if (proSolutoValue >= diferencaNecessaria) {
        proSolutoValue -= diferencaNecessaria;
        sinalAtoValue = sinalMinimo;
      } else {
        // Se não há pró-soluto suficiente, usar o máximo possível
        sinalAtoValue += proSolutoValue;
        proSolutoValue = 0;
        
        // Se ainda não atingiu o mínimo, usar o remainingAmount completo
        if (sinalAtoValue < sinalMinimo) {
          sinalAtoValue = Math.min(remainingAmount, sinalMinimo);
        }
      }
    }

    // CORREÇÃO CRÍTICA: Recalcular após ajuste do sinal mínimo
    // Garantir que a soma não exceda o remainingAmount
    const somaAtual = sinalAtoValue + proSolutoValue;
    if (somaAtual > remainingAmount) {
      const excesso = somaAtual - remainingAmount;
      // Reduzir do pró-soluto primeiro
      if (proSolutoValue >= excesso) {
        proSolutoValue -= excesso;
      } else {
        // Se não há pró-soluto suficiente, reduzir do sinal ato mantendo o mínimo
        const excessoRestante = excesso - proSolutoValue;
        proSolutoValue = 0;
        sinalAtoValue = Math.max(sinalMinimo, sinalAtoValue - excessoRestante);
      }
    } else if (somaAtual < remainingAmount) {
      // Se a soma é menor, distribuir a diferença
      const diferenca = remainingAmount - somaAtual;
      
      // Priorizar aumentar o sinal ato se estiver abaixo do mínimo
      if (sinalAtoValue < sinalMinimo) {
        const aumentoNecessario = Math.min(diferenca, sinalMinimo - sinalAtoValue);
        sinalAtoValue += aumentoNecessario;
        
        // Distribuir o restante no pró-soluto se possível
        const restante = diferenca - aumentoNecessario;
        if (restante > 0) {
          const novoProSoluto = proSolutoValue + restante;
          const proSolutoCorrigido = calculateCorrectedProSoluto(novoProSoluto, deliveryDate, newPayments);
          
          if (proSolutoCorrigido <= maxProSolutoByPercent) {
            proSolutoValue = novoProSoluto;
          } else {
            // Ajustar para não exceder o limite
            proSolutoValue = findMaxProSolutoBaseValue(maxProSolutoByPercent, deliveryDate, newPayments);
            sinalAtoValue += (novoProSoluto - proSolutoValue);
          }
        }
      } else {
        // Se sinal ato já está no mínimo, aumentar o pró-soluto
        const novoProSoluto = proSolutoValue + diferenca;
        const proSolutoCorrigido = calculateCorrectedProSoluto(novoProSoluto, deliveryDate, newPayments);
        
        if (proSolutoCorrigido <= maxProSolutoByPercent) {
          proSolutoValue = novoProSoluto;
        } else {
          // Ajustar para não exceder o limite
          proSolutoValue = findMaxProSolutoBaseValue(maxProSolutoByPercent, deliveryDate, newPayments);
          sinalAtoValue += (novoProSoluto - proSolutoValue);
        }
      }
    }

    // CORREÇÃO: Lógica do bônus de campanha
    let campaignBonusValue = 0;
    if (isSinalCampaignActive && sinalCampaignLimitPercent !== undefined) {
      if (sinalAtoValue > sinalMinimo) {
        const excedente = sinalAtoValue - sinalMinimo;
        const limiteMaximoBonus = valorFinalImovel * (sinalCampaignLimitPercent / 100);
        
        if (excedente <= limiteMaximoBonus) {
          campaignBonusValue = excedente;
          sinalAtoValue = sinalMinimo;
        } else {
          campaignBonusValue = limiteMaximoBonus;
          sinalAtoValue = sinalMinimo + limiteMaximoBonus;
        }
        
        // Recalcular pró-soluto considerando o bônus
        const novaSoma = sinalAtoValue + proSolutoValue + campaignBonusValue;
        if (novaSoma > remainingAmount) {
          const excesso = novaSoma - remainingAmount;
          proSolutoValue = Math.max(0, proSolutoValue - excesso);
        }
      }
    }

    // VALIDAÇÃO FINAL: Garantir que a soma esteja correta
    const somaFinal = sinalAtoValue + proSolutoValue + campaignBonusValue;
    const diferencaFinal = remainingAmount - somaFinal;
    
    if (Math.abs(diferencaFinal) > 0.01) {
      // Distribuir a diferença final
      if (diferencaFinal > 0) {
        // Adicionar ao sinal ato
        sinalAtoValue += diferencaFinal;
      } else {
        // Remover do pró-soluto primeiro
        const excesso = Math.abs(diferencaFinal);
        if (proSolutoValue >= excesso) {
          proSolutoValue -= excesso;
        } else {
          const excessoRestante = excesso - proSolutoValue;
          proSolutoValue = 0;
          sinalAtoValue = Math.max(sinalMinimo, sinalAtoValue - excessoRestante);
        }
      }
    }

    // Montar lista final de pagamentos
    const finalPayments = newPayments.filter(p => !["sinalAto", "proSoluto", "bonusCampanha", "bonusAdimplencia"].includes(p.type));

    // Adicionar sinal ato se for maior que zero
    if (sinalAtoValue > 0) {
      const sinalAtoPayment = newPayments.find(p => p.type === 'sinalAto');
      finalPayments.push({
        type: 'sinalAto', 
        value: sinalAtoValue, 
        date: sinalAtoPayment?.date || new Date(),
      });
    }

    // Adicionar pró-soluto se for maior que zero
    if (proSolutoValue > 0) {
      const proSolutoPayment = newPayments.find(p => p.type === 'proSoluto');
      const defaultProSolutoDate = proSolutoPayment?.date || (() => {
          const sinal1Payment = newPayments.find(p => p.type === 'sinal1');
          const baseDate = sinal1Payment?.date || new Date();
          return addMonths(baseDate, 1);
      })();
      
      finalPayments.push({
        type: 'proSoluto', 
        value: proSolutoValue, 
        date: defaultProSolutoDate,
      });
    }

    // Adicionar bônus de campanha se for maior que zero
    if (campaignBonusValue > 0) {
      const campaignBonusPayment = newPayments.find(p => p.type === 'bonusCampanha');
      finalPayments.push({
        type: 'bonusCampanha', 
        value: campaignBonusValue, 
        date: campaignBonusPayment?.date || new Date(),
      });
    }

    // Adicionar bônus de adimplência se for maior que zero
    if (bonusAdimplenciaValue > 0) {
      const bonusAdimplenciaPayment = newPayments.find(p => p.type === 'bonusAdimplencia');
      finalPayments.push({
        type: 'bonusAdimplencia', 
        value: bonusAdimplenciaValue, 
        date: bonusAdimplenciaPayment?.date || new Date(),
      });
    }

    return finalPayments;
  }

  // Se já existem os campos, manter a lógica original
  return newPayments;
};

const calculateConstructionInsuranceLocal = (
  constructionStartDate: Date | null,
  deliveryDate: Date | null,
  caixaInstallmentValue: number
): { total: number; breakdown: MonthlyInsurance[] } => {
    if (!constructionStartDate || !deliveryDate || !isValid(constructionStartDate) || !isValid(deliveryDate) || constructionStartDate > deliveryDate || caixaInstallmentValue <= 0) {
        return { total: 0, breakdown: [] };
    }

    const cacheKey = `${constructionStartDate.getTime()}-${deliveryDate.getTime()}-${caixaInstallmentValue}`;
    const cached = insuranceCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL && cached.breakdown.length > 0) {
      return { total: cached.total, breakdown: cached.breakdown };
    }
    
    const totalMonths = differenceInMonths(deliveryDate, constructionStartDate) + 1;
    if (totalMonths <= 1) return { total: 0, breakdown: [] };

    let totalPayable = 0;
    const breakdown: MonthlyInsurance[] = [];
    const today = new Date();
    
    for (let i = 0; i < totalMonths; i++) {
        const monthDate = addMonths(constructionStartDate, i);
        
        const progressRate = i / (totalMonths - 1);
        const insuranceValue = progressRate * caixaInstallmentValue;

        if (monthDate >= today) {
            totalPayable += insuranceValue;
        }

        breakdown.push({
            month: format(monthDate, "MMMM/yyyy", { locale: ptBR }),
            value: insuranceValue,
            date: monthDate,
            isPayable: monthDate >= today,
            progressRate,
        });
    }

    const result = { total: totalPayable, breakdown, timestamp: Date.now() };
    insuranceCache.set(cacheKey, result);
    return result;
};

const calculateNotaryInstallment = (
  total: number,
  installments: number,
  method: 'creditCard' | 'bankSlip'
): number => {
  if (!total || !installments) return 0;

  if (method === 'creditCard') {
    return total / installments;
  } else { 
    const monthlyRate = 0.015;
    if (monthlyRate <= 0) return total / installments;
    const installmentValue = (total * monthlyRate * Math.pow(1 + monthlyRate, installments)) / (Math.pow(1 + monthlyRate, installments) - 1);
    return installmentValue;
  }
};

const isDateLocked = (type: PaymentFieldType) => {
  return ["bonusAdimplencia", "financiamento", "bonusCampanha", "fgts", "desconto"].includes(type);
};

const getStatusBadgeClass = (status: UnitStatus) => {
  switch (status) {
    case 'Disponível':
      return 'border-blue-600/20 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-400/30 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/70 transition-all duration-200';
    case 'Vendido':
      return 'border-gray-400/20 bg-gray-50 text-gray-600 opacity-60 cursor-not-allowed dark:border-gray-600/30 dark:bg-gray-800/50 dark:text-gray-400';
    case 'Reservado':
      return 'border-amber-600/20 bg-amber-50 text-amber-700 opacity-80 cursor-not-allowed dark:border-amber-400/30 dark:bg-amber-950/50 dark:text-amber-300';
    case 'Indisponível':
      return 'border-gray-400/20 bg-gray-50 text-gray-600 opacity-60 cursor-not-allowed dark:border-gray-600/30 dark:bg-gray-800/50 dark:text-gray-400';
    default:
      return 'border-gray-400/20 bg-gray-50 text-gray-600 dark:border-gray-600/30 dark:bg-gray-800/50 dark:text-gray-400';
  }
};

const formatarCentavosParaReal = (centavos: string): string => {
  if (!centavos || centavos === '0') return 'R$ 0,00';
  
  const numero = parseFloat(centavos) / 100;
  
  if (isNaN(numero)) return 'R$ 0,00';
  
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numero);
};

const removerFormatacao = (valorFormatado: string): string => {
  return valorFormatado.replace(/\D/g, '');
};

const formatarDuranteDigitacao = (valor: string): string => {
  const apenasNumeros = removerFormatacao(valor);
  
  if (apenasNumeros === '') return '';
  
  return formatarCentavosParaReal(apenasNumeros);
};

const formatarDataParaBackend = (data: string): string => {
  if (!data) return '';
  
  if (data.includes('/')) return data;
  
  const partes = data.split('-');
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  
  return data;
};

const corrigirFormatoValor = (valor: string): string => {
  if (!valor) return valor;
  
  if (valor.includes('%')) {
    return valor.replace('.', ',');
  }
  
  if (valor.includes('R$')) {
    const valorNumerico = valor.replace('R$ ', '');
    const partes = valorNumerico.split('.');
    
    if (partes.length === 2) {
      const parteInteira = partes[0].replace(',', '.');
      const parteDecimal = partes[1];
      
      return `R$ ${parteInteira},${parteDecimal}`;
    } else if (partes.length === 1) {
      if (valorNumerico.includes(',')) {
        return `R$ ${valorNumerico.replace(',', '.')}`;
      } else {
        return `R$ ${valorNumerico}`;
      }
    }
  }
  
  return valor;
};

const converterValorMonetarioParaNumero = (valorFormatado: string): number => {
  if (!valorFormatado) return 0;
  
  let valorLimpo = valorFormatado.replace('R$', '').trim();
  
  if (valorLimpo.includes('.') && valorLimpo.includes(',')) {
    valorLimpo = valorLimpo.replace(/\./g, '');
    valorLimpo = valorLimpo.replace(',', '.');
  } else if (valorLimpo.includes(',')) {
    valorLimpo = valorLimpo.replace(',', '.');
  }
  
  const valorNumerico = parseFloat(valorLimpo);
  
  return isNaN(valorNumerico) ? 0 : valorNumerico;
};

interface UnitCardProps {
    unit: CombinedUnit;
    isReservaParque: boolean;
    onUnitSelect: (unit: CombinedUnit) => void;
    style?: React.CSSProperties;
}

const UnitCard = memo(({ unit, isReservaParque, onUnitSelect, style }: UnitCardProps) => {
  const unitDisplay = useMemo(() => 
    isReservaParque ? `Torre ${unit.block}` : `Bloco ${unit.block}`,
    [isReservaParque, unit.block]
  );
  
  const handleClick = useCallback(() => {
      if (unit.status === 'Disponível') {
          onUnitSelect(unit);
      }
  }, [unit, onUnitSelect]);
  
  return (
      <div style={style} className="transform transition-all duration-300 hover:scale-105">
          <Card 
              className={cn(
                  "cursor-pointer transition-all duration-300 shadow-md hover:shadow-xl border-2 rounded-xl overflow-hidden group h-full flex flex-col",
                  getStatusBadgeClass(unit.status),
                  unit.status === 'Disponível' && 'hover:border-blue-400 hover:shadow-blue-100 dark:hover:border-blue-500 dark:hover:shadow-blue-900/20'
              )}
              onClick={handleClick}
          >
              <CardHeader className="p-4 pb-2 flex-row justify-between items-start bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
                  <div>
                      <p className="font-bold text-base text-gray-900 dark:text-gray-100">{unitDisplay}</p>
                      <p className="font-semibold text-sm text-blue-700 dark:text-blue-400">Unidade {unit.unitNumber}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{unit.floor}</p>
                  </div>
                  <div className={cn("text-xs font-bold px-3 py-1 rounded-full transition-all duration-200", getStatusBadgeClass(unit.status).replace(/hover:[a-z-]+/g, ''))}>
                  {unit.status}
                  </div>
              </CardHeader>
              <CardContent className="p-4 pt-2 text-xs space-y-2 flex-grow bg-white dark:bg-gray-800">
                  <div className="flex justify-between items-baseline pt-2 border-b border-gray-100 dark:border-gray-700">
                      <span className="font-semibold text-sm text-gray-600 dark:text-gray-400">Venda:</span>
                      <span className="font-bold text-lg text-blue-700 dark:text-blue-400 break-words">{centsToBrl(unit.saleValue)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-gray-700 dark:text-gray-300">
                      <div className="flex items-center gap-1">
                          <Grid3X3 className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                          <span className="text-xs"><strong>Tipologia:</strong> {unit.typology}</span>
                      </div>
                      <div className="flex items-center gap-1">
                          <Ruler className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                          <span className="text-xs"><strong>Área:</strong> {(unit.privateArea).toFixed(1)}m²</span>
                      </div>
                      <div className="flex items-center gap-1">
                          <Sun className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                          <span className="text-xs"><strong>Sol:</strong> {unit.sunPosition}</span>
                      </div>
                      <div className="flex items-center gap-1">
                          <Car className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                          <span className="text-xs"><strong>Vagas:</strong> {unit.parkingSpaces}</span>
                      </div>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-gray-700">
                      <span className="text-xs text-gray-600 dark:text-gray-400">Avaliação:</span>
                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{centsToBrl(unit.appraisalValue)}</span>
                  </div>
              </CardContent>
          </Card>
      </div>
  );
});
UnitCard.displayName = 'UnitCard';

const CurrencyFormField = memo(({ name, label, control, readOnly = false, placeholder = "R$ 0,00", id }: { 
  name: keyof FormValues, 
  label: string, 
  control: Control<FormValues>; readOnly?: boolean; placeholder?: string; 
  id?: string 
}) => {
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</FormLabel>
                    <FormControl>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                            <CurrencyInput
                                value={(field.value as number) * 100}
                                onValueChange={(cents) => field.onChange(cents === null ? 0 : cents / 100)}
                                className="pl-10 h-11 border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200 text-sm"
                                readOnly={readOnly}
                                placeholder={placeholder}
                            />
                        </div>
                    </FormControl>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
});
CurrencyFormField.displayName = 'CurrencyFormField';

interface PaymentFlowCalculatorProps {
    properties: Property[];
    isSinalCampaignActive: boolean;
    sinalCampaignLimitPercent?: number;
    isTutorialOpen: boolean;
    setIsTutorialOpen: (isOpen: boolean) => void;
}

export function PaymentFlowCalculator({ properties, isSinalCampaignActive, sinalCampaignLimitPercent, isTutorialOpen, setIsTutorialOpen }: PaymentFlowCalculatorProps) {
  const { toast } = useToast();
  const [results, setResults] = useState<ExtendedResults | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [brokerData, setBrokerData] = useState({ name: '', creci: '' });
  const [showInsuranceDetails, setShowInsuranceDetails] = useState(false);
  const [allUnits, setAllUnits] = useState<CombinedUnit[]>([]);
  const [statusFilter, setStatusFilter] = useState<UnitStatus | "Todos">("Disponível");
  const [floorFilter, setFloorFilter] = useState<string>("Todos");
  const [typologyFilter, setTypologyFilter] = useState<string>("Todos");
  const [sunPositionFilter, setSunPositionFilter] = useState<string>("Todos");
  const [isSaleValueLocked, setIsSaleValueLocked] = useState(false);
  const [isUnitSelectorOpen, setIsUnitSelectorOpen] = useState(false);
  const [isAutomatedSimulationEnabled, setIsAutomatedSimulationEnabled] = useState(false);
  const [isSimulatingCaixa, setIsSimulatingCaixa] = useState(false);
  const [customerData, setCustomerData] = useState({
    renda: "",
    dataNascimento: "",
    sistemaAmortizacao: "PRICE TR",
  });
  const [valoresFormatados, setValoresFormatados] = useState({
    renda: ""
  });
  const [caixaSimulationResult, setCaixaSimulationResult] = useState<CaixaSimulationResult['dados'] | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      propertyId: "",
      selectedUnit: "",
      brokerName: "",
      brokerCreci: "",  
      payments: [],
      appraisalValue: 0,
      saleValue: 0,
      grossIncome: 0,
      simulationInstallmentValue: 0,
      financingParticipants: 1,
      conditionType: "padrao" as const,
      installments: undefined,
      notaryFees: undefined,
      notaryPaymentMethod: 'creditCard',
      notaryInstallments: undefined,
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "payments",
  });
  
  const watchedPayments = form.watch('payments');
  const watchedAppraisalValue = form.watch('appraisalValue');
  const watchedSaleValue = form.watch('saleValue');
  const watchedFinancingParticipants = form.watch('financingParticipants');
  const watchedNotaryPaymentMethod = form.watch('notaryPaymentMethod');

  // CORREÇÃO: Adicionar watchedPropertyId e selectedProperty dentro do componente
  const watchedPropertyId = form.watch('propertyId');

  const selectedProperty = useMemo(() => {
    return properties.find(p => p.id === watchedPropertyId) || null;
  }, [watchedPropertyId, properties]);

  // CORREÇÃO: Mover deliveryDateObj para depois da declaração de selectedProperty
  const deliveryDateObj = useMemo(() => {
    if (!selectedProperty?.deliveryDate) return null;
    const date = parseISO(selectedProperty.deliveryDate);
    return isValid(date) ? date : null;
  }, [selectedProperty]);

  const getInitialDateForPaymentType = useCallback((type: PaymentFieldType): Date => {
    if (isDateLocked(type) && deliveryDateObj) {
      return deliveryDateObj;
    }
    return new Date();
  }, [deliveryDateObj]);

  // CORREÇÃO: Adicionar constructionStartDateObj após deliveryDateObj
  const constructionStartDateObj = useMemo(() => {
    if (!selectedProperty?.constructionStartDate) return null;
    const date = parseISO(selectedProperty.constructionStartDate);
    return isValid(date) ? date : null;
  }, [selectedProperty]);

  const { setValue, trigger, getValues, setError, clearErrors } = form;
  
  const hasSinal1 = watchedPayments.some(p => p.type === 'sinal1');

  const calculateRate = useCallback((nper: number, pmt: number, pv: number): number => {
    if (nper <= 0 || pmt <= 0 || pv <= 0) return 0;

    const maxIterations = 200; 
    const precision = 1e-10; 
    let initialRate = 0.01; 

    for (let i = 0; i < maxIterations; i++) {
      try {
        const g = Math.pow(1 + initialRate, nper);
        const g_deriv = nper * Math.pow(1 + initialRate, nper - 1);

        if (!isFinite(g) || !isFinite(g_deriv)) {
          initialRate /= 2;
          continue;
        }

        const f = pv * g - pmt * (g - 1) / initialRate;
        const f_deriv = pv * g_deriv - pmt * (g_deriv * initialRate - (g - 1)) / (initialRate * initialRate);
        
        if (Math.abs(f_deriv) < 1e-12) { 
          break;
        }

        const newRate = initialRate - f / f_deriv;

        if (Math.abs(newRate - initialRate) < precision) {
          return newRate;
        }
        initialRate = newRate;

      } catch {
        break;
      }
    }
    
    return initialRate; 
  }, []);

  const hasSinal2 = watchedPayments.some(p => p.type === 'sinal2');
  
  const availablePaymentFields = useMemo(() => {
    return paymentFieldOptions.filter(opt => {
      if (["bonusAdimplencia", "bonusCampanha"].includes(opt.value)) return false;

      const isAlreadyAdded = watchedPayments.some(p => p.type === opt.value);
      if (isAlreadyAdded) return false;

      if (opt.value === 'sinal2' && !hasSinal1) return false;
      if (opt.value === 'sinal3' && (!hasSinal1 || !hasSinal2)) return false;
      return true;
    });
  }, [watchedPayments, hasSinal1, hasSinal2]);
  
  const filteredProperties = (properties || []).filter(p => p.brand === 'Riva');

  const filterOptions = useMemo(() => {
    const floors = [...new Set(allUnits.map(u => u.floor))].sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0');
      const numB = parseInt(b.match(/\d+/)?.[0] || '0');
      return numA - numB;
    });
    const typologies = [...new Set(allUnits.map(u => u.typology))].sort();
    const sunPositions = [...new Set(allUnits.map(u => u.sunPosition))].sort();
    return { floors, typologies, sunPositions };
  }, [allUnits]);

  const filteredUnits = useMemo(() => {
    return (allUnits || []).filter(unit => {
      const statusMatch = statusFilter === 'Todos' || unit.status === statusFilter;
      const floorMatch = floorFilter === 'Todos' || unit.floor === floorFilter;
      const typologyMatch = typologyFilter === 'Todos' || unit.typology === typologyFilter;
      const sunPositionMatch = sunPositionFilter === 'Todos' || unit.sunPosition === sunPositionFilter;
      return statusMatch && floorMatch && typologyMatch && sunPositionMatch;
    });
  }, [allUnits, statusFilter, floorFilter, typologyFilter, sunPositionFilter]);

  const sinalAtoDate = useMemo(() => {
    const sinal = watchedPayments.find(p => p.type === 'sinalAto');
    return sinal ? startOfMonth(sinal.date) : startOfMonth(new Date());
  }, [watchedPayments]);

  const filteredInsuranceBreakdown = useMemo(() => {
    if (!results?.monthlyInsuranceBreakdown) return [];
    return results.monthlyInsuranceBreakdown.filter(item => {
      const itemDate = startOfMonth(item.date);
      return itemDate > sinalAtoDate;
    });
  }, [results?.monthlyInsuranceBreakdown, sinalAtoDate]);

  const bonusAdimplenciaValue = useMemo(() => {
    const hasFinancing = watchedPayments.some(p => p.type === 'financiamento');
    const appraisalValue = watchedAppraisalValue || 0;
    const saleValue = watchedSaleValue || 0;
    
    if (hasFinancing && saleValue > 0 && appraisalValue > saleValue) {
      return Math.max(0, appraisalValue - saleValue);
    }
    return 0;
  }, [watchedPayments, watchedAppraisalValue, watchedSaleValue]);

  const installmentsPlaceholder = useMemo(() => {
    if (!selectedProperty) return "Número de parcelas";
    
    const isReservaParque = selectedProperty.enterpriseName.includes('Reserva Parque Clube');
    const isEspecial = form.watch('conditionType') === 'especial';
    
    if (isEspecial) {
      return `Máximo: 66 parcelas`;
    } else if (isReservaParque) {
      return `Máximo: 60 parcelas`;
    } else {
      return `Máximo: 52 parcelas`;
    }
  }, [selectedProperty, form]);

  const adjustPaymentsToMatchTarget = useCallback((
    payments: PaymentField[],
    target: number,
    actual: number,
    appraisalValue: number,
    saleValue: number
  ): PaymentField[] => {
    const difference = target - actual;
    const newPayments = [...payments];
    
    const descontoPayment = newPayments.find(p => p.type === 'desconto');
    const descontoValue = descontoPayment?.value || 0;
    const valorFinalImovel = saleValue - descontoValue;
    
    const proSolutoIndex = newPayments.findIndex(p => p.type === 'proSoluto');
    const sinalAtoIndex = newPayments.findIndex(p => p.type === 'sinalAto');
    
    if (proSolutoIndex !== -1) {
      newPayments[proSolutoIndex].value += difference;
      
      const isReservaParque = selectedProperty?.enterpriseName.includes('Reserva Parque Clube');
      const conditionType = form.getValues('conditionType') as 'padrao' | 'especial';
      const proSolutoLimitPercent = isReservaParque ? 0.1799 : (conditionType === 'especial' ? 0.1799 : 0.1499);
      const maxProSolutoValue = saleValue * proSolutoLimitPercent;
      
      if (newPayments[proSolutoIndex].value > maxProSolutoValue) {
        newPayments[proSolutoIndex].value = maxProSolutoValue;
        
        const remainingDifference = maxProSolutoValue - newPayments[proSolutoIndex].value;
        if (sinalAtoIndex !== -1) {
          newPayments[sinalAtoIndex].value += remainingDifference;
        }
      }
    } else if (sinalAtoIndex !== -1) {
      newPayments[sinalAtoIndex].value += difference;
      
      const sinalMinimo = 0.055 * valorFinalImovel;
      if (newPayments[sinalAtoIndex].value < sinalMinimo) {
        newPayments[sinalAtoIndex].value = sinalMinimo;
        
        const remainingDifference = sinalMinimo - newPayments[sinalAtoIndex].value;
        if (proSolutoIndex !== -1) {
          newPayments[proSolutoIndex].value += remainingDifference;
          
          const isReservaParque = selectedProperty?.enterpriseName.includes('Reserva Parque Clube');
          const conditionType = form.getValues('conditionType') as 'padrao' | 'especial';
          const proSolutoLimitPercent = isReservaParque ? 0.1799 : (conditionType === 'especial' ? 0.1799 : 0.1499);
          const maxProSolutoValue = saleValue * proSolutoLimitPercent;
          
          if (newPayments[proSolutoIndex].value > maxProSolutoValue) {
            newPayments[proSolutoIndex].value = maxProSolutoValue;
            
            const remainingDifference = maxProSolutoValue - newPayments[proSolutoIndex].value;
            if (sinalAtoIndex !== -1) {
              newPayments[sinalAtoIndex].value += remainingDifference;
            }
          }
        }
      }
    }
    
    return newPayments;
  }, [selectedProperty, form]);

  const ensureCorrectDates = useCallback((payments: PaymentField[]): PaymentField[] => {
    if (!deliveryDateObj) return payments;
    
    return payments.map(payment => {
      if (isDateLocked(payment.type)) {
        return {
          ...payment,
          date: deliveryDateObj
        };
      }
      return payment;
    });
  }, [deliveryDateObj]);

  // CORREÇÃO: Função handlePropertyChange atualizada
  const handlePropertyChange = useCallback((
    id: string, 
    form: ReturnType<typeof useForm<FormValues>>, 
    setResults: React.Dispatch<React.SetStateAction<ExtendedResults | null>>,
    setIsSaleValueLocked: React.Dispatch<React.SetStateAction<boolean>>,
    setAllUnits: React.Dispatch<React.SetStateAction<CombinedUnit[]>>,
    toast: ReturnType<typeof useToast>['toast']
  ) => {
    if (!id) return;
    
    form.reset({ 
      ...form.getValues(), 
      propertyId: id, 
      payments: [], 
      appraisalValue: 0, 
      saleValue: 0, 
      grossIncome: 0, 
      simulationInstallmentValue: 0, 
      financingParticipants: 1, 
      conditionType: 'padrao', 
      installments: undefined, 
      notaryPaymentMethod: 'creditCard', 
      notaryInstallments: undefined, 
      selectedUnit: "" 
    });
    setResults(null);
    setIsSaleValueLocked(false);

    setStatusFilter("Disponível");
    setFloorFilter("Todos");
    setTypologyFilter("Todos");
    setSunPositionFilter("Todos");

    // CORREÇÃO: Usar a prop 'properties' que é passada para o componente
    const propertyDetails = properties.find((p: Property) => p.id === id);

    if (propertyDetails?.availability && propertyDetails?.pricing?.length) {
      const availabilityMap = new Map<string, { status: UnitStatus; floor: string; tower: string }>();
      propertyDetails.availability.towers.forEach((tower: Tower) => {
        tower.floors.forEach((floor: { units: Unit[] } & { floor: string }) => {
          floor.units.forEach((unit: Unit) => {
            availabilityMap.set(unit.unitId, { status: unit.status, floor: floor.floor, tower: tower.tower });
          });
        });
      });

      const combinedUnits: CombinedUnit[] = propertyDetails.pricing.map((p) => {
        const availabilityInfo = availabilityMap.get(p.unitId);
        const normalizedUnitNumber = parseInt(String(p.unitNumber), 10).toString();
        return {
          ...p, 
          unitNumber: normalizedUnitNumber,
          status: availabilityInfo ? availabilityInfo.status : 'Indisponível',
          floor: availabilityInfo ? availabilityInfo.floor : 'N/A',
          block: availabilityInfo ? availabilityInfo.tower : 'N/A',
          sunPosition: p.sunPosition || 'N/A',
          parkingSpaces: p.parkingSpaces || 0,
          typology: p.typology || 'N/A',
          privateArea: p.privateArea || 0,
          appraisalValue: p.appraisalValue || 0,
          saleValue: p.saleValue || 0,
          complianceBonus: p.complianceBonus || 0,
        };
      });

      setAllUnits(combinedUnits);
    } else {
      setAllUnits([]);
      toast({
        title: "Aviso",
        description: "Nenhum dado de espelho de vendas encontrado para este empreendimento. Prossiga com a inserção manual.",
      });
    }
  }, [properties]); // CORREÇÃO: Adicione properties como dependência

  const handleCaixaMonetaryChange = (name: 'renda', value: string) => {
    if (value === '') {
      setValoresFormatados(prev => ({ ...prev, [name]: '' }));
      setCustomerData(prev => ({ ...prev, [name]: '' }));
      return;
    }
    
    const apenasNumeros = removerFormatacao(value);
    
    if (apenasNumeros === '') {
      setValoresFormatados(prev => ({ ...prev, [name]: '' }));
      setCustomerData(prev => ({ ...prev, [name]: '' }));
      return;
    }
    
    const valorFormatado = formatarDuranteDigitacao(apenasNumeros);
    
    setValoresFormatados(prev => ({ ...prev, [name]: valorFormatado }));
    setCustomerData(prev => ({ ...prev, [name]: apenasNumeros }));
  };

  const handleCaixaDataChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'renda') {
      handleCaixaMonetaryChange(name, value);
    } else {
      setCustomerData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleCaixaMonetaryFocus = (name: 'renda') => {
    if (!valoresFormatados[name] || valoresFormatados[name] === 'R$ 0,00') {
      setValoresFormatados(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleCaixaMonetaryBlur = (name: 'renda') => {
    if (!valoresFormatados[name] || valoresFormatados[name] === '') {
      setValoresFormatados(prev => ({ ...prev, [name]: 'R$ 0,00' }));
      setCustomerData(prev => ({ ...prev, [name]: '0' }));
    }
  };

  const handleSimulateCaixaFinancing = async () => {
    if (!selectedProperty || !watchedAppraisalValue) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Selecione um imóvel antes de simular o financiamento.",
      });
      return;
    }

    if (!customerData.renda || customerData.renda === '0' || !customerData.dataNascimento) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Preencha todos os dados do cliente antes de simular.",
      });
      return;
    }

    setIsSimulatingCaixa(true);
    setCaixaSimulationResult(null);

    try {
      const functions = getFunctions(app);
      const simularFinanciamento = httpsCallable<Record<string, string>, CaixaSimulationResult>(
        functions, 
        'simularFinanciamentoCaixa'
      );
      
      const dadosParaBackend = {
        valorImovel: (watchedAppraisalValue * 100).toString(),
        renda: customerData.renda,
        dataNascimento: formatarDataParaBackend(customerData.dataNascimento),
        sistemaAmortizacao: customerData.sistemaAmortizacao,
      };
      
      const response = await simularFinanciamento(dadosParaBackend);
      const data = response.data;

      if (data.sucesso && data.dados) {
        setCaixaSimulationResult(data.dados);
        
        setValue('grossIncome', parseFloat(customerData.renda) / 100, { shouldValidate: true });
        
        const parcelaFormatada = corrigirFormatoValor(data.dados.Primeira_Prestacao || '0');
        const parcelaSimulada = converterValorMonetarioParaNumero(parcelaFormatada);
        setValue('simulationInstallmentValue', parcelaSimulada, { shouldValidate: true });
        
        const financiamentoFormatado = corrigirFormatoValor(data.dados.Valor_Total_Financiado || '0');
        const valorFinanciado = converterValorMonetarioParaNumero(financiamentoFormatado);
        
        const financingPayment: PaymentField = {
          type: "financiamento",
          value: valorFinanciado,
          date: deliveryDateObj || new Date(),
        };
        
        const financingIndex = watchedPayments.findIndex(p => p.type === 'financiamento');
        if (financingIndex > -1) {
          const newPayments = [...watchedPayments];
          newPayments[financingIndex] = financingPayment;
          replace(newPayments);
        } else {
          append(financingPayment);
        }
        
        toast({ 
          title: "Simulação Realizada com Sucesso!", 
          description: "Os dados foram preenchidos automaticamente." 
        });
      } else if (data.message) {
        throw new Error(data.message);
      } else {
        throw new Error("Falha na simulação.");
      }
    } catch (err: unknown) {
      console.error('Erro na simulação:', err);
      
      let errorMessage = "Ocorreu um erro desconhecido.";
      
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null && 'code' in err) {
        const errorWithCode = err as { code?: string };
        if (typeof errorWithCode.code === 'string') {
          switch (errorWithCode.code) {
            case 'internal':
              errorMessage = "Erro interno no servidor. Tente novamente.";
              break;
            case 'invalid-argument':
              errorMessage = "Dados inválidos fornecidos. Verifique os campos.";
              break;
            case 'unauthenticated':
              errorMessage = "Você precisa estar logado para realizar a simulação.";
              break;
            default:
              errorMessage = `Erro: ${errorWithCode.code}`;
          }
        }
      }
      
      toast({ 
        variant: "destructive", 
        title: "Erro na Simulação", 
        description: errorMessage 
      });
    } finally {
      setIsSimulatingCaixa(false);
    }
  };

  useEffect(() => {
    if (!selectedProperty || !deliveryDateObj) return;
    
    const hasFinancing = watchedPayments.some(p => p.type === 'financiamento');
    
    // CORREÇÃO: Aplicar ensureCorrectDates a todos os pagamentos existentes
    const correctedPayments = ensureCorrectDates(watchedPayments);
    if (JSON.stringify(correctedPayments) !== JSON.stringify(watchedPayments)) {
      replace(correctedPayments);
    }
    
    const fieldsToAdd = [
      { 
        type: 'financiamento' as PaymentFieldType, 
        condition: hasFinancing && !watchedPayments.some(p => p.type === 'financiamento') 
      },
      { 
        type: 'bonusAdimplencia' as PaymentFieldType, 
        condition: hasFinancing && bonusAdimplenciaValue > 0 && !watchedPayments.some(p => p.type === 'bonusAdimplencia') 
      }
    ];
  
    fieldsToAdd.forEach(({ type, condition }) => {
      if (condition) {
        const fieldToAdd: PaymentField = {
          type,
          value: type === 'bonusAdimplencia' ? bonusAdimplenciaValue : 0,
          date: deliveryDateObj, // ← GARANTIDO usar deliveryDateObj
        };
        
        append(fieldToAdd);
      }
    });
  
    if (!hasFinancing || bonusAdimplenciaValue <= 0) {
      const bonusIndex = watchedPayments.findIndex((p: PaymentField) => p.type === 'bonusAdimplencia');
      if (bonusIndex > -1) {
        remove(bonusIndex);
      }
    }
  }, [bonusAdimplenciaValue, watchedPayments, selectedProperty, deliveryDateObj, append, remove, ensureCorrectDates, replace]);
  
  // CORREÇÃO: useEffect para garantir que campos com data travada usem sempre deliveryDateObj
  useEffect(() => {
    if (!deliveryDateObj || watchedPayments.length === 0) return;
    
    const needsCorrection = watchedPayments.some(payment => 
      isDateLocked(payment.type) && payment.date.getTime() !== deliveryDateObj.getTime()
    );
    
    if (needsCorrection) {
      const correctedPayments = watchedPayments.map(payment => {
        if (isDateLocked(payment.type)) {
          return {
            ...payment,
            date: deliveryDateObj
          };
        }
        return payment;
      });
      
      replace(correctedPayments);
    }
  }, [watchedPayments, deliveryDateObj, replace]);

  useEffect(() => {
    if (!selectedProperty) return;
    const baseFee = getNotaryFee(watchedAppraisalValue);
    const participants = watchedFinancingParticipants || 0;
    const additionalFee = participants > 1 ? (participants - 1) * 110 : 0;
    const totalFee = baseFee > 0 ? baseFee + additionalFee : 0;
    setValue('notaryFees', totalFee, { shouldValidate: true });
  }, [watchedAppraisalValue, watchedFinancingParticipants, setValue, selectedProperty]);
  
  useEffect(() => {
    setValue('notaryInstallments', undefined, { shouldValidate: true });
  }, [watchedNotaryPaymentMethod, setValue]);

  const handleUnitSelect = useCallback((unit: CombinedUnit) => {
    if (!selectedProperty) return;

    const isReservaParque = selectedProperty.enterpriseName.includes('Reserva Parque Clube');
    const unitDisplay = isReservaParque ? `Torre ${unit.block} - Unidade ${unit.unitNumber}` : `Bloco ${unit.block} - Unidade ${unit.unitNumber}`;

    setValue('selectedUnit', unitDisplay);
    setValue('appraisalValue', unit.appraisalValue / 100);
    setValue('saleValue', unit.saleValue / 100);
    setIsSaleValueLocked(true);
    setIsUnitSelectorOpen(false);
    toast({
      title: "Unidade Selecionada!",
      description: `Os valores para a unidade ${unit.unitNumber} (Torre ${unit.block}) foram preenchidos.`
    });
  }, [selectedProperty, setValue, toast]);

  const handleClearUnitSelection = useCallback(() => {
    setValue('selectedUnit', '');
    setValue('appraisalValue', 0);
    setValue('saleValue', 0);
    setIsSaleValueLocked(false);
    toast({
      title: "Seleção de unidade limpa",
      description: "Você pode agora inserir valores manualmente ou selecionar outra unidade.",
    });
  }, [setValue, toast]);

  const validateBusinessRulesAfterMinimumCondition = useCallback((
    payments: PaymentField[],
    appraisalValue: number,
    saleValue: number,
    grossIncome: number,
    simulationInstallmentValue: number,
    installments: number,
    deliveryDate: Date | null,
    constructionStartDate: Date | null,
    propertyEnterpriseName: string,
    conditionType: 'padrao' | 'especial'
  ): { isValid: boolean; violation?: string } => {
    const proSolutoPayment = payments.find(p => p.type === 'proSoluto');
    let proSolutoValue = 0;
    if (proSolutoPayment) {
      proSolutoValue = proSolutoPayment.value;
    }
  
    const { installment: priceInstallmentValue } = calculatePriceInstallment(
      proSolutoValue,
      installments,
      deliveryDate,
      payments
    );
  
    const { breakdown: insuranceBreakdown } = calculateConstructionInsuranceLocal(
      constructionStartDate,
      deliveryDate,
      simulationInstallmentValue
    );
  
    let maxIncomeCommitmentPercentage = 0;
  
    if (grossIncome > 0 && insuranceBreakdown.length > 0) {
      insuranceBreakdown.forEach(month => {
        if (month.isPayable) {
          const monthlyCommitment = ((month.value + priceInstallmentValue) / grossIncome) * 100;
          maxIncomeCommitmentPercentage = Math.max(maxIncomeCommitmentPercentage, monthlyCommitment);
        }
      });
    } else if (grossIncome > 0) {
      maxIncomeCommitmentPercentage = (priceInstallmentValue / grossIncome) * 100;
    }
  
    if (maxIncomeCommitmentPercentage > 50) {
      return {
        isValid: false,
        violation: `O comprometimento de renda (${maxIncomeCommitmentPercentage.toFixed(2)}%) excede o limite de 50%.`
      };
    }
  
    const proSolutoCorrigido = calculateCorrectedProSoluto(
      proSolutoValue,
      deliveryDate,
      payments
    );
  
    const proSolutoCommitmentPercentage = saleValue > 0
      ? (proSolutoCorrigido / saleValue) * 100
      : 0;
  
    if (proSolutoCommitmentPercentage > 100) {
      return {
        isValid: false,
        violation: `O comprometimento do pró-soluto (${proSolutoCommitmentPercentage.toFixed(2)}%) excede 100% do valor de venda.`
      };
    }
  
    const sinalAto = payments.find(p => p.type === 'sinalAto');
    if (sinalAto) {
      const descontoPayment = payments.find(p => p.type === 'desconto');
      const descontoValue = descontoPayment?.value || 0;
      const valorFinalImovel = saleValue - descontoValue;
      const sinalMinimo = 0.055 * valorFinalImovel;
      
      if (sinalAto.value < sinalMinimo) {
        return {
          isValid: false,
          violation: `O Sinal Ato (${centsToBrl(sinalAto.value * 100)}) é menor que o mínimo de 5,5% do valor final da unidade (${centsToBrl(sinalMinimo * 100)}).`
        };
      }
    }
  
    const isReservaParque = propertyEnterpriseName.includes('Reserva Parque Clube');
    const expectedLimitPercent = isReservaParque ? 0.1799 : (conditionType === 'especial' ? 0.1799 : 0.1499);
    
    if (proSolutoCorrigido > saleValue * expectedLimitPercent) {
      return {
        isValid: false,
        violation: `O valor do pró-soluto corrigido (${centsToBrl(proSolutoCorrigido * 100)}) excede o limite de ${(expectedLimitPercent * 100).toFixed(2)}% do valor de venda do imóvel.`
      };
    }
  
    if (installments > 0) {
      let maxInstallments;
      if (isReservaParque) {
        maxInstallments = conditionType === 'especial' ? 66 : 60;
      } else {
        maxInstallments = conditionType === 'especial' ? 66 : 52;
      }
      
      if (installments > maxInstallments) {
        return {
          isValid: false,
          violation: `O número de parcelas (${installments}) excede o limite de ${maxInstallments} para a condição selecionada.`
        };
      }
    }
  
    const validation = validatePaymentSumWithBusinessLogic(
      payments,
      appraisalValue,
      saleValue,
      false,
      undefined
    );
  
    if (!validation.isValid) {
      return {
        isValid: false,
        violation: validation.businessLogicViolation || `A soma dos pagamentos (${centsToBrl(validation.actual * 100)}) não corresponde ao valor necessário (${centsToBrl(validation.expected * 100)}).`
      };
    }
  
    const actualLimitPercent = isReservaParque ? 0.18 : (conditionType === 'especial' ? 0.18 : 0.15);
    if (Math.abs(actualLimitPercent - expectedLimitPercent) > 0.0001) {
      return {
        isValid: false,
        violation: `O limite do pró-soluto configurado (${(actualLimitPercent * 100).toFixed(2)}%) não corresponde ao esperado para esta condição (${(expectedLimitPercent * 100).toFixed(2)}%).`
      };
    }
  
    return { isValid: true };
  }, [calculatePriceInstallment, calculateConstructionInsuranceLocal, calculateCorrectedProSoluto]);

  const onSubmit = useCallback((values: FormValues) => {
    clearErrors();
  
    if (!selectedProperty || !deliveryDateObj || !constructionStartDateObj) {
      setError("propertyId", { message: "Selecione um imóvel para continuar." });
      return;
    }
  
    const correctedPayments = ensureCorrectDates(values.payments);
    
    // VALIDAÇÃO INICIAL - DETECTAR SE PRECISA DE CORREÇÃO
    const initialValidation = validatePaymentSumWithBusinessLogic(
      correctedPayments,
      values.appraisalValue,
      values.saleValue,
      isSinalCampaignActive,
      sinalCampaignLimitPercent
    );
  
    let finalPayments = [...correctedPayments];
    const correctionMessages: string[] = [];
  
    // VERIFICAR SE PRECISA DE CORREÇÃO AUTOMÁTICA
    const needsAutoCorrection = !initialValidation.isValid || initialValidation.businessLogicViolation;
  
    // DETECTAR VIOLAÇÕES ESPECÍFICAS
    const sinalAto = finalPayments.find(p => p.type === 'sinalAto');
    const descontoPayment = finalPayments.find(p => p.type === 'desconto');
    const descontoValue = descontoPayment?.value || 0;
    const valorFinalImovel = values.saleValue - descontoValue;
    const sinalMinimo = 0.055 * valorFinalImovel;
  
    if (sinalAto && sinalAto.value < sinalMinimo) {
      correctionMessages.push(`Sinal Ato (${centsToBrl(sinalAto.value * 100)}) abaixo do mínimo de 5,5% (${centsToBrl(sinalMinimo * 100)})`);
    }
  
    if (!initialValidation.isValid) {
      correctionMessages.push(`Soma dos pagamentos (${centsToBrl(initialValidation.actual * 100)}) não corresponde ao valor necessário (${centsToBrl(initialValidation.expected * 100)})`);
    }
  
    if (initialValidation.businessLogicViolation) {
      correctionMessages.push(initialValidation.businessLogicViolation);
    }
  
    // APLICAR CORREÇÃO AUTOMÁTICA SE NECESSÁRIO
    if (needsAutoCorrection || correctionMessages.length > 0) {
      // ETAPA 1: APLICAR CONDIÇÃO MÍNIMA COMPLETA
      let autoCorrectedPayments = applyMinimumCondition(
        finalPayments,
        values.appraisalValue,
        values.saleValue,
        isSinalCampaignActive,
        sinalCampaignLimitPercent,
        values.conditionType,
        selectedProperty.enterpriseName,
        values.grossIncome,
        values.simulationInstallmentValue,
        values.installments || 0,
        deliveryDateObj
      );
  
      // ETAPA 2: VALIDAR E CORRIGIR ITERAÇÃO
      let iterationCount = 0;
      const maxIterations = 10;
      let isFullyValid = false;
  
      while (iterationCount < maxIterations && !isFullyValid) {
        iterationCount++;
        
        const validationAfterCorrection = validatePaymentSumWithBusinessLogic(
          autoCorrectedPayments,
          values.appraisalValue,
          values.saleValue,
          isSinalCampaignActive,
          sinalCampaignLimitPercent
        );
  
        const sinalAtoAfter = autoCorrectedPayments.find(p => p.type === 'sinalAto');
        const proSolutoAfter = autoCorrectedPayments.find(p => p.type === 'proSoluto');
        
        // CORREÇÃO ESPECÍFICA PARA SINAL ATO AINDA BAIXO
        if (sinalAtoAfter && sinalAtoAfter.value < sinalMinimo && proSolutoAfter) {
          const diferencaNecessaria = sinalMinimo - sinalAtoAfter.value;
          
          if (proSolutoAfter.value >= diferencaNecessaria) {
            proSolutoAfter.value -= diferencaNecessaria;
            sinalAtoAfter.value = sinalMinimo;
            correctionMessages.push(`Sinal Ato ajustado para o mínimo de 5,5% (${centsToBrl(sinalMinimo * 100)})`);
          } else {
            sinalAtoAfter.value += proSolutoAfter.value;
            proSolutoAfter.value = 0;
            correctionMessages.push(`Sinal Ato aumentado com Pró-Soluto disponível`);
          }
        }
  
        // CORREÇÃO PARA SOMA TOTAL AINDA INCORRETA
        if (!validationAfterCorrection.isValid) {
          const totalAtual = autoCorrectedPayments.reduce((sum, payment) => {
            if (payment.type !== 'desconto') return sum + payment.value;
            return sum;
          }, 0);
  
          const diferencaTotal = validationAfterCorrection.expected - totalAtual;
          
          if (Math.abs(diferencaTotal) > 0.01) {
            const sinalAtoFinal = autoCorrectedPayments.find(p => p.type === 'sinalAto');
            const proSolutoFinal = autoCorrectedPayments.find(p => p.type === 'proSoluto');
            
            if (diferencaTotal > 0) {
              // PRECISA AUMENTAR - PRIORIZAR SINAL ATO
              if (sinalAtoFinal) {
                sinalAtoFinal.value += diferencaTotal;
              } else if (proSolutoFinal) {
                proSolutoFinal.value += diferencaTotal;
              }
            } else {
              // PRECISA DIMINUIR - PRIORIZAR PRÓ-SOLUTO
              const excesso = Math.abs(diferencaTotal);
              if (proSolutoFinal && proSolutoFinal.value >= excesso) {
                proSolutoFinal.value -= excesso;
              } else if (proSolutoFinal) {
                const resto = excesso - proSolutoFinal.value;
                proSolutoFinal.value = 0;
                if (sinalAtoFinal) {
                  sinalAtoFinal.value = Math.max(sinalMinimo, sinalAtoFinal.value - resto);
                }
              } else if (sinalAtoFinal) {
                sinalAtoFinal.value = Math.max(sinalMinimo, sinalAtoFinal.value - excesso);
              }
            }
            
            correctionMessages.push(`Ajuste de diferença: ${centsToBrl(Math.abs(diferencaTotal) * 100)}`);
          }
        }
  
        // VALIDAÇÃO FINAL DA ITERAÇÃO
        const finalIterationValidation = validatePaymentSumWithBusinessLogic(
          autoCorrectedPayments,
          values.appraisalValue,
          values.saleValue,
          isSinalCampaignActive,
          sinalCampaignLimitPercent
        );
  
        isFullyValid = finalIterationValidation.isValid && !finalIterationValidation.businessLogicViolation;
        
        if (!isFullyValid && iterationCount < maxIterations) {
          // SE AINDA NÃO ESTÁ VÁLIDO, REAPLICAR CONDIÇÃO MÍNIMA
          autoCorrectedPayments = applyMinimumCondition(
            autoCorrectedPayments,
            values.appraisalValue,
            values.saleValue,
            isSinalCampaignActive,
            sinalCampaignLimitPercent,
            values.conditionType,
            selectedProperty.enterpriseName,
            values.grossIncome,
            values.simulationInstallmentValue,
            values.installments || 0,
            deliveryDateObj
          );
        }
      }
  
      finalPayments = autoCorrectedPayments;
  
      // ATUALIZAR OS PAGAMENTOS NO FORMULÁRIO
      replace(finalPayments);
  
      // VALIDAÇÃO FINAL APÓS TODAS AS CORREÇÕES
      const finalValidation = validatePaymentSumWithBusinessLogic(
        finalPayments,
        values.appraisalValue,
        values.saleValue,
        isSinalCampaignActive,
        sinalCampaignLimitPercent
      );
  
      // FEEDBACK AO USUÁRIO
      if (correctionMessages.length > 0) {
        toast({
          title: "Correções Automáticas Aplicadas",
          description: correctionMessages.slice(0, 3).join('; ') + (correctionMessages.length > 3 ? `... e mais ${correctionMessages.length - 3} correções` : ''),
          variant: finalValidation.isValid ? "default" : "warning",
        });
      }
  
      // SE AINDA NÃO ESTÁ VÁLIDO APÓS TODAS AS CORREÇÕES
      if (!finalValidation.isValid) {
        toast({
          variant: "destructive",
          title: "Não foi possível corrigir automaticamente",
          description: finalValidation.businessLogicViolation || "Por favor, use o botão 'Condição Mínima' ou ajuste manualmente os valores.",
        });
        return;
      }
    }
  
    // VALIDAÇÕES ADICIONAIS DE REGRAS DE NEGÓCIO
    const proSolutoPayment = finalPayments.find(p => p.type === 'proSoluto');
    const hasProSoluto = !!proSolutoPayment;
  
    if (hasProSoluto && values.installments !== undefined && values.installments > 0) {
      const isReservaParque = selectedProperty.enterpriseName.includes('Reserva Parque Clube');
      let maxInstallments;
      if (isReservaParque) {
        maxInstallments = values.conditionType === 'especial' ? 66 : 60;
      } else {
        maxInstallments = values.conditionType === 'especial' ? 66 : 52;
      }
      if (values.installments > maxInstallments) {
        setError("installments", { message: `Número de parcelas excede o limite de ${maxInstallments} para a condição selecionada.` });
        return;
      }
    }
  
    // VALIDAÇÃO DE VIABILIDADE FINANCEIRA
    const businessRulesValidation = validateBusinessRulesAfterMinimumCondition(
      finalPayments,
      values.appraisalValue,
      values.saleValue,
      values.grossIncome,
      values.simulationInstallmentValue,
      values.installments || 0,
      deliveryDateObj,
      constructionStartDateObj,
      selectedProperty.enterpriseName,
      values.conditionType
    );
  
    if (!businessRulesValidation.isValid) {
      toast({
        variant: "destructive",
        title: "Problema de Viabilidade",
        description: businessRulesValidation.violation,
      });
      return;
    }
  
    // CÁLCULO DOS RESULTADOS COM OS PAGAMENTOS FINAIS
    let proSolutoValue = 0;
    if (hasProSoluto) {
      proSolutoValue = proSolutoPayment.value;
    }
  
    const { installment: priceInstallmentValue } = calculatePriceInstallment(
      proSolutoValue,
      values.installments || 0,
      deliveryDateObj,
      finalPayments
    );
  
    const notaryInstallmentValue = calculateNotaryInstallment(
      values.notaryFees || 0,
      values.notaryInstallments || 1,
      values.notaryPaymentMethod as 'creditCard' | 'bankSlip'
    );
  
    const { total: insuranceTotal, breakdown: insuranceBreakdown } = calculateConstructionInsuranceLocal(
      constructionStartDateObj,
      deliveryDateObj,
      values.simulationInstallmentValue
    );
  
    // CORREÇÃO: Calcular o valor do Sinal Ato
    const sinalAtoPayment = finalPayments.find(p => p.type === 'sinalAto');
    const sinalAtoValue = sinalAtoPayment ? sinalAtoPayment.value : 0;
    
    const totalEntryCost = finalPayments
      .filter(p => ['sinalAto', 'sinal1', 'sinal2', 'sinal3', 'desconto', 'bonusCampanha'].includes(p.type))
      .reduce((sum, p) => sum + p.value, 0);
  
    const totalProSolutoCost = proSolutoValue;
      
    const totalFinancedCost = finalPayments
      .filter(p => ['financiamento', 'fgts'].includes(p.type))
      .reduce((sum, p) => sum + p.value, 0);
  
    const totalNotaryCost = values.notaryFees || 0;
    const totalInsuranceCost = insuranceTotal;
    const totalCost = totalEntryCost + totalProSolutoCost + totalFinancedCost + totalNotaryCost + totalInsuranceCost;
  
    let maxIncomeCommitmentPercentage = 0;
  
    if (values.grossIncome > 0 && insuranceBreakdown.length > 0) {
      insuranceBreakdown.forEach(month => {
        if (month.isPayable) {
          const monthlyCommitment = ((month.value + priceInstallmentValue) / values.grossIncome) * 100;
          maxIncomeCommitmentPercentage = Math.max(maxIncomeCommitmentPercentage, monthlyCommitment);
        }
      });
    } else if (values.grossIncome > 0) {
      maxIncomeCommitmentPercentage = (priceInstallmentValue / values.grossIncome) * 100;
    }
  
    const incomeCommitmentPercentage = maxIncomeCommitmentPercentage;
  
    const proSolutoCorrigido = calculateCorrectedProSoluto(
      proSolutoValue,
      deliveryDateObj,
      finalPayments
    );
  
    const proSolutoCommitmentPercentage = values.saleValue > 0
      ? (proSolutoCorrigido / values.saleValue) * 100
      : 0;
  
    const averageInterestRate = calculateRate(
      values.installments || 0,
      priceInstallmentValue,
      proSolutoValue
    ) * 100;
  
    const newResults: ExtendedResults = {
      ...results,
      summary: {
        remaining: 0,
        okTotal: true,
      },
      financedAmount: proSolutoValue,
      monthlyInstallment: priceInstallmentValue,
      totalWithInterest: priceInstallmentValue * (values.installments || 0),
      totalConstructionInsurance: insuranceTotal,
      monthlyInsuranceBreakdown: insuranceBreakdown,
      incomeCommitmentPercentage,
      proSolutoCommitmentPercentage,
      averageInterestRate,
      notaryInstallmentValue,
      incomeError: incomeCommitmentPercentage > 50 ? "Comprometimento de renda excede 50%." : undefined,
      proSolutoError: proSolutoCommitmentPercentage > 100 ? "Parcela do Pró-Soluto excede o valor da parcela simulada." : undefined,
      paymentValidation: initialValidation,
      totalEntryCost,
      totalProSolutoCost,
      totalFinancedCost,
      totalNotaryCost,
      totalInsuranceCost,
      totalCost,
      effectiveSaleValue: values.saleValue,
      paymentFields: finalPayments,
      appraisalValue: values.appraisalValue,
      saleValue: values.saleValue,
      grossIncome: values.grossIncome,
      simulationInstallmentValue: values.simulationInstallmentValue,
      financingParticipants: values.financingParticipants,
      conditionType: values.conditionType,
      installments: values.installments,
      notaryFees: values.notaryFees,
      notaryPaymentMethod: values.notaryPaymentMethod,
      notaryInstallments: values.notaryInstallments,
      caixaSimulation: caixaSimulationResult ? { sucesso: true, dados: caixaSimulationResult } : undefined,
    };
      
    setResults(newResults);
    resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [
    clearErrors, 
    selectedProperty, 
    deliveryDateObj, 
    constructionStartDateObj, 
    setError, 
    toast, 
    isSinalCampaignActive, 
    sinalCampaignLimitPercent, 
    validatePaymentSumWithBusinessLogic, 
    validateBusinessRulesAfterMinimumCondition,
    calculatePriceInstallment, 
    calculateNotaryInstallment, 
    calculateConstructionInsuranceLocal, 
    calculateCorrectedProSoluto, 
    calculateRate, 
    results, 
    ensureCorrectDates,
    replace,
    applyMinimumCondition,
    caixaSimulationResult
  ]);

  const handleApplyMinimumCondition = useCallback(() => {
    const values = form.getValues();

    if (!selectedProperty || !deliveryDateObj) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Selecione um imóvel para aplicar a condição mínima.",
      });
      return;
    }

    if (!values.saleValue || values.saleValue <= 0) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Informe o valor de venda para aplicar a condição mínima.",
      });
      return;
    }

    const newPayments = applyMinimumCondition(
      values.payments,
      values.appraisalValue,
      values.saleValue,
      isSinalCampaignActive,
      sinalCampaignLimitPercent,
      values.conditionType,
      selectedProperty.enterpriseName,
      values.grossIncome,
      values.simulationInstallmentValue,
      values.installments || 0,
      deliveryDateObj
    );

    const businessRulesValidation = validateBusinessRulesAfterMinimumCondition(
      newPayments,
      values.appraisalValue,
      values.saleValue,
      values.grossIncome,
      values.simulationInstallmentValue,
      values.installments || 0,
      deliveryDateObj,
      constructionStartDateObj,
      selectedProperty.enterpriseName,
      values.conditionType
    );

    if (!businessRulesValidation.isValid) {
      toast({
        variant: "destructive",
        title: "Regra de Negócio Violada",
        description: businessRulesValidation.violation,
      });
      return;
    }

    const validation = validatePaymentSumWithBusinessLogic(
      newPayments,
      values.appraisalValue,
      values.saleValue,
      isSinalCampaignActive,
      sinalCampaignLimitPercent
    );

    let finalPayments = [...newPayments];
    
    if (!validation.isValid) {
      const adjustedPayments = adjustPaymentsToMatchTarget(
        newPayments,
        validation.expected,
        validation.actual,
        values.appraisalValue,
        values.saleValue
      );
      
      finalPayments = adjustedPayments;
      
      toast({
        title: "Condição Mínima Aplicada com Ajustes",
        description: "Os pagamentos foram ajustados para corresponder ao valor necessário.",
      });
    } else {
      finalPayments = newPayments;
      
      toast({
        title: "Condição Mínima Aplicada",
        description: "Os pagamentos foram ajustados. Calculando resultados...",
      });
    }

    replace(finalPayments);

    trigger().then(isValid => {
        if (isValid) {
            onSubmit(getValues());
        } else {
            toast({
                variant: "destructive",
                title: "Erro de Validação",
                description: "Por favor, verifique os campos do formulário após aplicar a condição.",
            });
        }
    });
  }, [form, selectedProperty, deliveryDateObj, toast, replace, isSinalCampaignActive, sinalCampaignLimitPercent, trigger, getValues, onSubmit, validateBusinessRulesAfterMinimumCondition, constructionStartDateObj, adjustPaymentsToMatchTarget]);

  const handleClearAll = useCallback(() => {
    form.reset({
      propertyId: "",
      selectedUnit: "",
      payments: [],
      appraisalValue: 0,
      saleValue: 0,
      grossIncome: 0,
      simulationInstallmentValue: 0,
      financingParticipants: 1,
      conditionType: "padrao",
      installments: undefined,
      notaryFees: undefined,
      notaryPaymentMethod: 'creditCard',
      notaryInstallments: undefined,
    });
    
    setResults(null);
    setIsSaleValueLocked(false);
    setAllUnits([]);
    setStatusFilter("Disponível");
    setFloorFilter("Todos");
    setTypologyFilter("Todos");
    setSunPositionFilter("Todos");
    
    setCustomerData({
      renda: "",
      dataNascimento: "",
      sistemaAmortizacao: "PRICE TR",
    });
    setValoresFormatados({
      renda: ""
    });
    setCaixaSimulationResult(null);
    
    toast({
      title: "Formulário Limpo",
      description: "Todos os campos foram limpos. Você pode começar uma nova simulação.",
    });
  }, [form, toast]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
  
    if (!validateMimeType(file, ['application/pdf'])) {
      toast({
        variant: "destructive",
        title: "Arquivo inválido",
        description: "Por favor, selecione um arquivo PDF.",
      });
      return;
    }
  
    if (!validateFileSize(file, 10 * 1024 * 1024)) {
      toast({
        variant: "destructive",
        title: "Arquivo muito grande",
        description: "O arquivo deve ter no máximo 10MB.",
      });
      return;
    }
  
    setIsExtracting(true);
    try {
      const fileDataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
  
      const functions = getFunctions();
      const extractFinancialData = httpsCallable<ExtractFinancialDataInput, ExtractPricingOutput>(functions, 'extractFinancialData');
      const result = await extractFinancialData({ fileDataUri });
  
      if (result.data) {
        const { appraisalValue, grossIncome, simulationInstallmentValue, financingValue } = result.data;
        
        if (appraisalValue) setValue('appraisalValue', appraisalValue, { shouldValidate: true });
        if (grossIncome) setValue('grossIncome', grossIncome, { shouldValidate: true });
        if (simulationInstallmentValue) setValue('simulationInstallmentValue', simulationInstallmentValue, { shouldValidate: true });
        
        const formValues = form.getValues();
        const existingFinancing = formValues.payments.find((p: PaymentField) => p.type === 'financiamento');
        if (existingFinancing) {
          const updatedPayments = formValues.payments.map((p: PaymentField) => 
            p.type === 'financiamento' ? { ...p, value: financingValue || 0 } : p
          );
          replace(updatedPayments);
        } else if (financingValue) {
          append({
            type: 'financiamento',
            value: financingValue,
            date: deliveryDateObj || new Date(),
          });
        }
  
        toast({
          title: "✅ Dados Extraídos",
          description: "Os dados financeiros foram preenchidos automaticamente.",
        });
      }
    } catch (error) {
      console.error('Erro ao extrair dados do PDF:', error);
      toast({
        variant: "destructive",
        title: "Erro ao Processar PDF",
        description: "Não foi possível extrair os dados do arquivo. Tente novamente.",
      });
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [setValue, append, replace, toast, form, deliveryDateObj]);

  const processExtractedData = useCallback(async (extractedData: ExtractedDataType) => {
    try {
      if (extractedData.grossIncome) {
        setValue('grossIncome', extractedData.grossIncome, { shouldValidate: true });
      }
      
      if (extractedData.simulationInstallmentValue) {
        setValue('simulationInstallmentValue', extractedData.simulationInstallmentValue, { shouldValidate: true });
      }
      
      if (extractedData.appraisalValue && !isSaleValueLocked) {
        setValue('appraisalValue', extractedData.appraisalValue, { shouldValidate: true });
      }
      
      if (extractedData.financingValue) {
        const financingPayment: PaymentField = {
          type: "financiamento",
          value: extractedData.financingValue,
          date: deliveryDateObj || new Date(),
        };
        
        const financingIndex = watchedPayments.findIndex(p => p.type === 'financiamento');
        if (financingIndex > -1) {
          const newPayments = [...watchedPayments];
          newPayments[financingIndex] = financingPayment;
          replace(newPayments);
        } else {
          append(financingPayment);
        }
      }
      
      toast({ 
        title: '✅ Dados Extraídos com Sucesso!', 
        description: 'Os campos de renda e parcela foram preenchidos. Informe o Valor de Venda para completar a simulação.' 
      });
      
    } catch (error) {
      console.error('❌ Erro ao processar dados:', error);
      throw error;
    }
  }, [setValue, isSaleValueLocked, deliveryDateObj, watchedPayments, replace, append, toast]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    const file = event.target.files[0];
    
    if (!getValues('selectedUnit') && (!getValues('saleValue') || getValues('saleValue') <= 0)) {
        toast({
            variant: "destructive",
            title: "❌ Valor de Venda Obrigatório",
            description: "Para fazer upload do PDF, primeiro informe o Valor de Venda manualmente."
        });
        
        const saleValueInput = document.getElementById('sale-value-input') as HTMLInputElement | null;
        if (saleValueInput) {
            saleValueInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            saleValueInput.focus();
        }
        
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
        return;
    }
  
    setIsExtracting(true);
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
        const fileAsDataURL = reader.result as string;

        try {
          const functionsWithRegion = getFunctions(undefined, 'us-central1');
          const extractPdfFunction = httpsCallable(functionsWithRegion, 'extractPricing');
          
          const fileData = {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            dataUrl: fileAsDataURL,
            idToken: await getAuth().currentUser?.getIdToken()
          };
          
          const response = await extractPdfFunction(fileData);
          
          if (response.data) {
            await processExtractedData(response.data as ExtractedDataType);
          } else {
            throw new Error('Nenhum dado retornado pela função');
          }

        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
          console.error('💥 Erro detalhado:', error);
          
          if (errorMessage.includes('permission-denied') || errorMessage.includes('unauthenticated')) {
            toast({ 
              variant: "destructive", 
              title: "❌ Permissão Negada", 
              description: "Faça login novamente para usar esta função." 
            });
          } else if (errorMessage.includes('not-found')) {
            toast({ 
              variant: "destructive", 
              title: "❌ Função Não Encontrada", 
              description: "A função de extração não está disponível no servidor." 
            });
          } else if (errorMessage.includes('invalid-argument')) {
            toast({ 
              variant: "destructive", 
              title: "❌ Arquivo Inválido", 
              description: "O arquivo PDF não pôde ser processado. Verifique o formato." 
            });
          } else {
            toast({ 
              variant: "destructive", 
              title: "❌ Erro no Servidor", 
              description: errorMessage || "Tente novamente em alguns instantes." 
            });
          }
        } finally {
          setIsExtracting(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
    };
    reader.onerror = () => {
      setIsExtracting(false);
      toast({ variant: 'destructive', title: '❌ Erro ao ler arquivo' });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };
  }, [getValues, toast, processExtractedData]);
  
  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    const items = event.clipboardData?.items;
    if (!items || !selectedProperty) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          toast({
            title: "Arquivo colado!",
            description: "Iniciando a extração dos dados.",
          });
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          const syntheticFileList = dataTransfer.files;
          
          const syntheticEvent = {
            target: { files: syntheticFileList }
          } as unknown as React.ChangeEvent<HTMLInputElement>;
          
          handleFileChange(syntheticEvent);
        }
        break; 
      }
    }
  }, [selectedProperty, toast, handleFileChange]);

  const handleGeneratePdf = useCallback(async () => {
    if (!results || !selectedProperty) {
      toast({
        title: "Erro",
        description: "Não há resultados para gerar o PDF.",
        variant: "destructive",
      });
      return;
    }

    // Verificar se o nome do corretor foi informado
    if (!brokerData.name) {
      toast({
        title: "Campo Obrigatório",
        description: "Por favor, informe o nome do(a) corretor(a) antes de gerar o PDF.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const pdfValues: ExtendedPdfFormValues = {
        ...form.getValues(),
        property: selectedProperty,
        brokerName: brokerData.name,
        brokerCreci: brokerData.creci,
      };

      const selectedPropertyForPdf = properties.find(p => p.id === form.getValues('propertyId'));
      if (!selectedPropertyForPdf) {
        throw new Error('Selecione uma unidade antes');
      }
      await generatePdf(pdfValues, results, selectedPropertyForPdf);

      toast({
        title: "PDF Gerado",
        description: "O PDF foi gerado com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao gerar o PDF.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [results, selectedProperty, toast, form, brokerData, properties]);

  return (
    <div className="space-y-8" onPaste={handlePaste}>
      <Card className="relative">
        <CardHeader className="pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Calculator className="h-6 w-6" />
                Simulador de Fluxo de Pagamento
              </CardTitle>
              <CardDescription className="text-sm">
                Preencha os dados abaixo para simular as condições de pagamento do imóvel.
              </CardDescription>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="automated-simulation"
                checked={isAutomatedSimulationEnabled}
                onCheckedChange={setIsAutomatedSimulationEnabled}
              />
              <Label htmlFor="automated-simulation" className="text-sm font-medium">
                Simulação Automatizada
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {isAutomatedSimulationEnabled && (
                <Card className="border-blue-200 dark:border-blue-800">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-blue-600" />
                      Dados do Cliente
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Preencha os dados para simular o financiamento com a Caixa.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="caixa-renda">Renda Bruta Mensal</Label>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                          <Input 
                            id="caixa-renda" 
                            name="renda" 
                            type="text"
                            value={valoresFormatados.renda}
                            onChange={handleCaixaDataChange}
                            onFocus={() => handleCaixaMonetaryFocus('renda')}
                            onBlur={() => handleCaixaMonetaryBlur('renda')}
                            placeholder="R$ 0,00"
                            className="pl-10 h-11"
                            required 
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="caixa-data-nascimento">Data de Nascimento</Label>
                        <Input 
                          id="caixa-data-nascimento" 
                          name="dataNascimento" 
                          type="date" 
                          value={customerData.dataNascimento} 
                          onChange={handleCaixaDataChange} 
                          className="h-11"
                          required 
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="caixa-sistema-amortizacao">Sistema de Amortização</Label>
                      <Select 
                        value={customerData.sistemaAmortizacao} 
                        onValueChange={(value) => setCustomerData(prev => ({ ...prev, sistemaAmortizacao: value }))}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Selecione o sistema" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PRICE TR">PRICE</SelectItem>
                          <SelectItem value="SAC TR">SAC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <Button 
                      type="button" 
                      onClick={handleSimulateCaixaFinancing}
                      disabled={isSimulatingCaixa || !selectedProperty || !watchedAppraisalValue}
                      className="w-full h-11"
                    >
                      {isSimulatingCaixa && <FaSpinner className="mr-2 h-4 w-4 animate-spin" />}
                      {isSimulatingCaixa ? "Simulando..." : "Simular Financiamento"}
                    </Button>
                    
                    {caixaSimulationResult && (
                      <Card className="mt-4">
                        <CardHeader className="pb-4">
                          <CardTitle className="text-base">Resultados da Simulação Caixa</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="border rounded-lg p-3">
                              <p className="font-semibold text-sm text-muted-foreground">Prazo:</p>
                              <p className="text-lg font-bold">{caixaSimulationResult.Prazo || 'N/A'}</p>
                            </div>
                            <div className="border rounded-lg p-3">
                              <p className="font-semibold text-sm text-muted-foreground">Valor Total Financiado:</p>
                              <p className="text-lg font-bold text-green-600">
                                {corrigirFormatoValor(caixaSimulationResult.Valor_Total_Financiado || 'N/A')}
                              </p>
                            </div>
                            <div className="border rounded-lg p-3">
                              <p className="font-semibold text-sm text-muted-foreground">Primeira Prestação:</p>
                              <p className="text-lg font-bold text-blue-600">
                                {corrigirFormatoValor(caixaSimulationResult.Primeira_Prestacao || 'N/A')}
                              </p>
                            </div>
                            <div className="border rounded-lg p-3">
                              <p className="font-semibold text-sm text-muted-foreground">Juros Efetivos:</p>
                              <p className="text-lg font-bold text-purple-600">
                                {corrigirFormatoValor(caixaSimulationResult.Juros_Efetivos || 'N/A')}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">1. Empreendimento e Unidade</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="propertyId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Empreendimento</FormLabel>
                          <Select 
                            value={field.value || ""}
                            onValueChange={(value) => {
                              field.onChange(value);
                              // CORREÇÃO: Chamada atualizada sem o parâmetro properties
                              handlePropertyChange(value, form, setResults, setIsSaleValueLocked, setAllUnits, toast);
                            }}
                          >
                            <FormControl>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="Selecione um empreendimento" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {filteredProperties.map((property) => (
                                <SelectItem key={property.id} value={property.id}>
                                  {property.enterpriseName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="selectedUnit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Unidade Selecionada</FormLabel>
                          <div className="flex gap-2">
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="Selecione uma unidade"
                                readOnly
                                className={cn(
                                  "h-11 border transition-all duration-200 text-sm",
                                  isSaleValueLocked 
                                    ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100 font-medium" 
                                    : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                                )}
                              />
                            </FormControl>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setIsUnitSelectorOpen(true)}
                              disabled={!selectedProperty}
                              className="h-11 px-3"
                            >
                              <Building className="h-4 w-4" />
                            </Button>
                            {isSaleValueLocked && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleClearUnitSelection}
                                className="h-11 px-3"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">2. Valores e Renda</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <CurrencyFormField
                      name="appraisalValue"
                      label="Valor de Avaliação"
                      control={form.control}
                      id="appraisal-value-input"
                    />
                    <CurrencyFormField
                      name="saleValue"
                      label="Valor de Venda"
                      control={form.control}
                      readOnly={isSaleValueLocked}
                      id="sale-value-input"
                    />
                    <CurrencyFormField
                      name="grossIncome"
                      label="Renda Bruta Mensal"
                      control={form.control}
                      readOnly={isAutomatedSimulationEnabled && caixaSimulationResult !== null}
                    />
                    <CurrencyFormField
                      name="simulationInstallmentValue"
                      label="Valor da Parcela Simulação"
                      control={form.control}
                      readOnly={isAutomatedSimulationEnabled && caixaSimulationResult !== null}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-4">
                  <div className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg">3. Pagamentos</CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const availableField = availablePaymentFields[0];
                        if (availableField) {
                          append({
                            type: availableField.value,
                            value: 0,
                            date: getInitialDateForPaymentType(availableField.value), // ← AGORA USA A FUNÇÃO DENTRO DO COMPONENTE
                          });
                        }
                      }}
                      disabled={availablePaymentFields.length === 0}
                      className="h-11 w-auto"
                    >
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Adicionar Pagamento
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {fields.map((field, index) => (
                      <div key={field.id} className="grid grid-cols-1 md:grid-cols-[2fr,2fr,2fr,auto] gap-3 items-end p-3 border rounded-lg">
                        <FormField
                          control={form.control}
                          name={`payments.${index}.type`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm">Tipo</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-11">
                                    <SelectValue placeholder="Selecione o tipo" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {paymentFieldOptions.map((option) => {
                                    if (["bonusAdimplencia", "bonusCampanha"].includes(option.value) && option.value !== field.value) {
                                      return null;
                                    }
                                    return (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`payments.${index}.value`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm">Valor</FormLabel>
                              <FormControl>
                                <CurrencyInput
                                    value={field.value * 100}
                                    onValueChange={(cents) => field.onChange(cents === null ? 0 : cents / 100)}
                                    className="h-11"
                                    readOnly={isAutomatedSimulationEnabled && watchedPayments[index]?.type === 'financiamento' && caixaSimulationResult !== null}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`payments.${index}.date`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm">Data</FormLabel>
                              <FormControl>
                                <DatePicker
                                    value={field.value?.toISOString()}
                                    onChange={field.onChange}
                                    disabled={isDateLocked(watchedPayments[index]?.type)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          className="h-11 w-11"
                          disabled={isAutomatedSimulationEnabled && watchedPayments[index]?.type === 'financiamento' && caixaSimulationResult !== null}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">4. Configuração do Financiamento</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField
                      control={form.control}
                      name="conditionType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Condição</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="Selecione a condição" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="padrao">Padrão (Limite Pró-Soluto: 14,99%)</SelectItem>
                              <SelectItem value="especial">Especial (Limite Pró-Soluto: 17,99%)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="installments"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Número de Parcelas</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              value={field.value || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                field.onChange(value === '' ? undefined : Number(value));
                              }}
                              className="h-11"
                              placeholder={installmentsPlaceholder}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="financingParticipants"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Participantes no Financiamento</FormLabel>
                          <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value.toString()}>
                            <FormControl>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="Selecione o número" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {[1, 2, 3, 4].map((num) => (
                                <SelectItem key={num} value={num.toString()}>
                                  {num}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">5. Taxas de Cartório</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <CurrencyFormField
                      name="notaryFees"
                      label="Taxas Cartorárias"
                      control={form.control}
                      readOnly
                    />

                    <FormField
                      control={form.control}
                      name="notaryPaymentMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Método de Pagamento Cartório</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="Selecione o método" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="creditCard">Cartão de Crédito</SelectItem>
                              <SelectItem value="bankSlip">Boleto</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="notaryInstallments"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Parcelas Cartório</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              value={field.value || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                field.onChange(value === '' ? undefined : Number(value));
                              }}
                              className="h-11"
                              placeholder={watchedNotaryPaymentMethod === 'creditCard' ? '1-12' : '36 ou 40'}
                              />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">6. Dados do Corretor</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="brokerName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Nome do(a) Corretor(a)</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Informe o nome do(a) corretor(a)"
                              className="h-11"
                              value={brokerData.name}
                              onChange={(e) => setBrokerData(prev => ({ ...prev, name: e.target.value }))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="brokerCreci"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">CRECI</FormLabel>
                          <FormControl>
                            <Input 
                              {...field}
                              placeholder="Número do CRECI" 
                              value={brokerData.creci}
                              onChange={(e) => setBrokerData(prev => ({ ...prev, creci: e.target.value }))}
                              className="h-11"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button type="submit" className="w-full sm:flex-1 h-11">
                  <Calculator className="h-4 w-4 mr-2" />
                  Calcular
                </Button>
                
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleApplyMinimumCondition}
                  disabled={!selectedProperty || !deliveryDateObj || !form.getValues('saleValue')}
                  className="w-full sm:w-auto h-11"
                >
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Condição Mínima</span>
                  <span className="sm:hidden">Mínima</span>
                </Button>
                
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isExtracting}
                  className="w-full sm:w-auto h-11"
                >
                  {isExtracting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  <span className="hidden sm:inline">Upload PDF</span>
                  <span className="sm:hidden">Upload</span>
                </Button>
                
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleClearAll}
                  className="w-full sm:w-auto h-11"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Limpar</span>
                  <span className="sm:hidden">Limpar</span>
                </Button>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {results && (
        <Card ref={resultsRef} className="w-full">
          <CardHeader className="pb-6">
            <CardTitle className="flex items-center gap-2 text-xl">
              <TrendingUp className="h-6 w-6" />
              Resultados da Simulação
            </CardTitle>
            <CardDescription className="text-sm">
              Confira abaixo os detalhes da simulação realizada.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-blue-600" />
                      {/* CORREÇÃO: Substituir "Valor Financiado" por "Pró-Soluto" */}
                      <span className="text-sm font-medium">Pró-Soluto</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-600 break-words">
                      {centsToBrl((results.financedAmount || 0) * 100)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">Parcela Mensal</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600 break-words">
                      {centsToBrl((results.monthlyInstallment || 0) * 100)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-purple-600" />
                      <span className="text-sm font-medium">Taxa de Juros</span>
                    </div>
                    <p className="text-2xl font-bold text-purple-600 break-words">
                      {formatPercentage((results.averageInterestRate || 0) / 100)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-orange-600" />
                      <span className="text-sm font-medium">Seguro Obra</span>
                    </div>
                    <p className="text-2xl font-bold text-orange-600 break-words">
                      {centsToBrl((results.totalConstructionInsurance || 0) * 100)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Resumo de Custos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {/* CORREÇÃO: Substituir "Entrada" por "Sinal Ato" */}
                      <div className="flex justify-between text-sm">
                        <span>Sinal Ato</span>
                        <span className="font-medium">
                          {centsToBrl((results.paymentFields?.find(p => p.type === 'sinalAto')?.value || 0) * 100)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Pró-Soluto</span>
                        <span className="font-medium">{centsToBrl((results.totalProSolutoCost || 0) * 100)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Financiamento</span>
                        <span className="font-medium">{centsToBrl((results.totalFinancedCost || 0) * 100)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Taxas Cartorárias</span>
                        <span className="font-medium">{centsToBrl((results.totalNotaryCost || 0) * 100)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Seguro Obra</span>
                        <span className="font-medium">{centsToBrl((results.totalInsuranceCost || 0) * 100)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold text-sm">
                        <span>Total</span>
                        <span>{centsToBrl((results.totalCost || 0) * 100)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Análise de Renda</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-2 text-sm">
                          <span className="text-sm">Comprometimento de Renda</span>
                          <span className="text-sm font-medium">{(results.incomeCommitmentPercentage || 0).toFixed(2)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${
                              results.incomeCommitmentPercentage > 50 
                                ? 'bg-red-500' 
                                : results.incomeCommitmentPercentage > 30 
                                  ? 'bg-yellow-500' 
                                  : 'bg-green-500'
                            }`} 
                            style={{ width: `${Math.min(results.incomeCommitmentPercentage || 0, 100)}%` }} 
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-2 text-sm">
                          <span className="text-sm">Percentual Pró-Soluto</span>
                          <span className="text-sm font-medium">{(results.proSolutoCommitmentPercentage || 0).toFixed(2)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${
                              results.proSolutoCommitmentPercentage > 100 
                                ? 'bg-red-500' 
                                : results.proSolutoCommitmentPercentage > 50 
                                  ? 'bg-red-500' 
                                  : results.proSolutoCommitmentPercentage > 50 
                                    ? 'bg-yellow-500' 
                                    : 'bg-green-500'
                            }`} 
                            style={{ width: `${Math.min(results.proSolutoCommitmentPercentage || 0, 100)}%` }} 
                          />
                        </div>
                      </div>
                      {results.incomeError && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Atenção</AlertTitle>
                          <AlertDescription>{results.incomeError}</AlertDescription>
                        </Alert>
                      )}
                      {results.proSolutoError && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Atenção</AlertTitle>
                          <AlertDescription>{results.proSolutoError}</AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Cronograma de Pagamentos</h3>
                <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0 scrollbar-thin scrollbar-thumb-gray-300">
                  <div className="min-w-full">
                    <PaymentTimeline results={results as Results} formValues={form.getValues()} />
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <h3 className="text-lg font-semibold">Detalhamento do Seguro de Obras</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowInsuranceDetails(!showInsuranceDetails)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 h-11"
                  >
                    {showInsuranceDetails ? (
                      <>
                        <ChevronUp className="h-4 w-4" />
                        <span className="hidden sm:inline">Ocultar Detalhes</span>
                        <span className="sm:hidden">Ocultar</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4" />
                        <span className="hidden sm:inline">Exibir Detalhes</span>
                        <span className="sm:hidden">Exibir</span>
                      </>
                    )}
                  </Button>
                </div>
                
                {showInsuranceDetails && (
                  <Card>
                    <CardContent className="p-4">
                      <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0 scrollbar-thin scrollbar-thumb-gray-300">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-sm">Mês</TableHead>
                              <TableHead className="text-sm">Valor</TableHead>
                              <TableHead className="text-sm">Progresso</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredInsuranceBreakdown.map((item, index) => (
                              <TableRow key={index}>
                                <TableCell className="text-sm">{item.month}</TableCell>
                                <TableCell className="text-sm">{centsToBrl(item.value * 100)}</TableCell>
                                <TableCell className="text-sm">{(item.progressRate * 100).toFixed(1)}%</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Button onClick={handleGeneratePdf} disabled={isGeneratingPdf} className="w-full sm:flex-1 h-11">
                  {isGeneratingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  Gerar PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={isUnitSelectorOpen} onOpenChange={setIsUnitSelectorOpen}>
        <DialogContent className="max-w-[95vw] md:max-w-4xl lg:max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Selecione uma Unidade do Empreendimento {selectedProperty?.enterpriseName || ''}
            </DialogTitle>
            <DialogDescription className="text-base">
              Escolha uma unidade disponível no empreendimento selecionado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label className="text-sm">Status</Label>
                <Select value={statusFilter} onValueChange={(value: UnitStatus | "Todos") => setStatusFilter(value)}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todos</SelectItem>
                    <SelectItem value="Disponível">Disponível</SelectItem>
                    <SelectItem value="Vendido">Vendido</SelectItem>
                    <SelectItem value="Reservado">Reservado</SelectItem>
                    <SelectItem value="Indisponível">Indisponível</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm">Andar</Label>
                <Select value={floorFilter} onValueChange={setFloorFilter}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todos</SelectItem>
                    {filterOptions.floors.map((floor) => (
                      <SelectItem key={floor} value={floor}>
                        {floor}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm">Tipologia</Label>
                <Select value={typologyFilter} onValueChange={setTypologyFilter}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todos</SelectItem>
                    {filterOptions.typologies.map((typology) => (
                      <SelectItem key={typology} value={typology}>
                        {typology}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm">Posição Solar</Label>
                <Select value={sunPositionFilter} onValueChange={setSunPositionFilter}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todos</SelectItem>
                    {filterOptions.sunPositions.map((position) => (
                      <SelectItem key={position} value={position}>
                        {position}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredUnits.map((unit) => (
                <UnitCard
                  key={unit.unitId}
                  unit={unit}
                  isReservaParque={selectedProperty?.enterpriseName.includes('Reserva Parque Clube') || false}
                  onUnitSelect={handleUnitSelect}
                />
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}