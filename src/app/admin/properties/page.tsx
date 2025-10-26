"use client";

import React, { useRef, useState } from "react";
import { format } from 'date-fns';
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Building,
  FileBarChart2,
  FileSpreadsheet,
  Grid3X3,
  Loader2,
  Trash2,
  Upload,
  Calculator,
} from 'lucide-react';
import type { CombinedUnit, Property } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { centsToBrl, getValue } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Timestamp } from 'firebase/firestore';
import { Skeleton } from "@/components/ui/skeleton";
import { parseExcel } from "@/lib/parsers/excel-parser";
import { httpsCallable } from "firebase/functions"; // Moved isDateLocked here

const AvailabilityManager = dynamic(() => 
    import('@/components/admin/availability-manager').then(mod => mod.AvailabilityManager), 
    { 
        loading: () => <div className="p-4"><Skeleton className="h-40 w-full" /></div>,
        ssr: false 
    }
);


export default function AdminPropertiesPage() {
  const { properties, propertiesLoading, user, functions } = useAuth();
  const { toast } = useToast();

  const [activeAccordionItem, setActiveAccordionItem] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<Record<string, boolean>>({});
  
  const propertiesExcelInputRef = useRef<HTMLInputElement>(null);
  const pricingExcelInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  
  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isUploadingProperties, setIsUploadingProperties] = useState(false);
  
  const handlePropertiesUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user || !functions) {
        toast({ variant: 'destructive', title: 'Erro de Autenticação', description: 'Nenhum arquivo selecionado ou usuário não autenticado.' });
        return;
    }

    setIsUploadingProperties(true);
    
    try {
      const fileReader = new FileReader();
      fileReader.readAsBinaryString(file);

      const fileContent = await new Promise<string>((resolve, reject) => {
        fileReader.onload = (e) => {
          if (!e.target || typeof e.target.result !== 'string') {
            return reject(new Error('Não foi possível ler o arquivo.'));
          }
          resolve(e.target.result);
        };
        fileReader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      });
      
      const idToken = await user.getIdToken(true);
      if (!idToken) throw new Error("Usuário não autenticado");

      const batchCreateProperties = httpsCallable(functions, 'batchCreatePropertiesAction');
      const action = await batchCreateProperties({ fileContent, idToken });
      const { addedCount } = action.data as { addedCount: number };

      toast({
        title: "✅ Sucesso!",
        description: `${addedCount} novo(s) empreendimento(s) adicionado(s). Empreendimentos existentes foram ignorados.`
      });

    } catch (error: unknown) {
      const err = error as Error;
      toast({ variant: "destructive", title: "❌ Erro no Upload", description: err.message });
    } finally {
      setIsUploadingProperties(false);
      if (propertiesExcelInputRef.current) {
        propertiesExcelInputRef.current.value = "";
      }
    }
  };
  
   const processAndBatchUpdate = async (
      file: File,
      propertyId: string,
      fieldName: 'pricing',
      transformer: (item: Record<string, unknown>) => CombinedUnit,
      options: {
        setAnalyzing: (isAnalyzing: boolean) => void;
        toastTitle: string;
      }
  ) => {
      const { setAnalyzing, toastTitle } = options;
      if (!user || !functions) {
        toast({ variant: 'destructive', title: '❌ Erro de Autenticação', description: 'Por favor, faça login novamente.' });
        return;
      }
      
      const fileReader = new FileReader();
      
      fileReader.onload = async (event) => {
          if (!event.target || typeof event.target.result !== 'string') {
              toast({ variant: 'destructive', title: '❌ Erro de Leitura', description: 'Não foi possível ler o arquivo.' });
              return;
          }
          
          setAnalyzing(true);

          try {
              const fileContent = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = (e) => resolve(e.target?.result as string);
                  reader.onerror = reject;
                  reader.readAsBinaryString(file);
              });

              const parsedData = parseExcel(fileContent);
              
              if (!parsedData.length) {
                  throw new Error("Nenhum dado encontrado na planilha.");
              }

              const property = properties.find(p => p.id === propertyId);
              if (!property) throw new Error("Empreendimento não encontrado.");

              const transformedData = parsedData.map(item => transformer(item));

              if (fieldName === 'pricing') {
                  const idToken = await user.getIdToken(true);
                  if (!idToken) throw new Error("Usuário não autenticado");
                  const updatePropertyPricing = httpsCallable(functions, 'updatePropertyPricingAction');
                  await updatePropertyPricing({ propertyId, pricingData: transformedData, idToken });
              }

              toast({ title: `✅ ${toastTitle}`, description: `Dados de ${fieldName} atualizados para ${property.enterpriseName}.` });
          } catch (error: unknown) {
              const err = error as Error;
              toast({ variant: "destructive", title: "❌ Erro na Análise", description: err.message });
          } finally {
              setAnalyzing(false);
          }
      };
      
      fileReader.onerror = () => {
          toast({ variant: 'destructive', title: '❌ Erro', description: 'Falha ao ler o arquivo.' });
      };

      fileReader.readAsBinaryString(file);
  };

  const transformPricing = (item: Record<string, unknown>): CombinedUnit => {
    const toReais = (value: unknown) => {
      if (value === undefined || value === null || String(value).trim() === '') return 0;        
      const stringValue = String(value);
      const cleanedValue = stringValue.replace(/[R$\\.\\s]/g, '').replace(',', '.');
      const numberValue = parseFloat(cleanedValue);
      return isNaN(numberValue) ? 0 : numberValue;
    };
    
    // FUNÇÃO NOVA: Para converter área (metros quadrados)
    const toSquareMeters = (value: unknown) => {
      if (value === undefined || value === null || String(value).trim() === '') return 0;
      const stringValue = String(value);
      // Remove caracteres não numéricos exceto ponto e vírgula
      const cleanedValue = stringValue.replace(/[^\d,.]/g, '').replace(',', '.');
      const numberValue = parseFloat(cleanedValue);
      return isNaN(numberValue) ? 0 : Math.round(numberValue * 100) / 100; // Arredonda para 2 casas decimais
    };
    
    const fullUnitId = String(getValue(item, ['UNIDADE']) || '').trim();
    const fullBlock = String(getValue(item, ['BLOCO']) || '').trim();
    
    return {
        unitId: fullUnitId,
        block: fullBlock,
        unitNumber: String(getValue(item, ['UNIDADE']) || '').trim(),
        status: 'Disponível',
        floor: String(getValue(item, ['ANDAR']) || '').trim(),
        typology: String(getValue(item, ['TIPOLOGIA']) || ''),
        // NOVO: Extrai ÁREA PRIVATIVA da planilha
        privateArea: toSquareMeters(getValue(item, ['ÁREA PRIVATIVA'])),
        sunPosition: String(getValue(item, ['POSIÇÃO DO SOL'])),
        parkingSpaces: parseInt(String(getValue(item, ['VAGA']) || '0'), 10),
        totalArea: 0, // Mantém 0 por enquanto, pode ser adicionado depois
        appraisalValue: toReais(getValue(item, ['VALOR DE AVALIAÇÃO'])),
        complianceBonus: 0,
        saleValue: toReais(getValue(item, ['VALOR DE VENDA'])),
    };
};

  const handlePricingUpload = (e: React.ChangeEvent<HTMLInputElement>, property: Property) => {
      if (e.target.files?.[0]) {
          processAndBatchUpdate(
              e.target.files[0],
              property.id,
              'pricing',
              transformPricing,
              {
                  setAnalyzing: (isAnalyzing) => setIsAnalyzing(prev => ({ ...prev, [property.id]: isAnalyzing })),
                  toastTitle: 'Tabela de Preços Atualizada!',
              }
          );
      }
  };

  const handleDeletePricing = async (propertyId: string, propertyName: string) => {
    if (!user || !functions) {
        toast({ variant: 'destructive', title: '❌ Erro de Autenticação', description: 'Por favor, faça login novamente.' });
        return;
    }
    setIsDeleting(prev => ({...prev, [propertyId]: true}));
    try {
        const idToken = await user.getIdToken(true);
        if (!idToken) throw new Error("Usuário não autenticado");
        const deletePropertyPricing = httpsCallable(functions, 'deletePropertyPricingAction');
        await deletePropertyPricing({ propertyId, idToken });
        toast({
            title: "🗑️ Tabela de Preços Removida",
            description: `Os dados de preço para ${propertyName} foram excluídos.`,
        });
    } catch (error) {
        const err = error as Error;
        toast({
            variant: "destructive",
            title: "❌ Erro ao Excluir",
            description: err.message,
        });
    } finally {
        setIsDeleting(prev => ({...prev, [propertyId]: false}));
    }
  };
  
   const handleDeleteProperty = async (propertyId: string, propertyName: string) => {
    if (!user || !functions) {
        toast({ variant: 'destructive', title: '❌ Erro de Autenticação', description: 'Por favor, faça login novamente.' });
        return;
    }
    setIsDeleting(prev => ({ ...prev, [propertyId]: true }));
    try {
      const idToken = await user.getIdToken(true);
      if (!idToken) throw new Error("Usuário não autenticado");
      const deleteProperty = httpsCallable(functions, 'deletePropertyAction');
      await deleteProperty({ propertyId, idToken });
      toast({
        title: "🗑️ Empreendimento Removido",
        description: `O empreendimento "${propertyName}" foi excluído com sucesso.`
      });
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        variant: "destructive",
        title: "❌ Erro ao Excluir",
        description: err.message,
      });
    } finally {
      setIsDeleting(prev => ({ ...prev, [propertyId]: false }));
    }
  };

  const handleDeleteAllProperties = async () => {
    if (!user || !functions) {
        toast({ variant: 'destructive', title: '❌ Erro de Autenticação', description: 'Por favor, faça login novamente.' });
        return;
    }
    setIsDeletingAll(true);
    try {
        const idToken = await user.getIdToken(true);
        const deleteAllProperties = httpsCallable(functions, 'deleteAllPropertiesAction');
        const result = await deleteAllProperties({ idToken });
        const { deletedCount } = result.data as { deletedCount: number };
        toast({
            title: "🗑️ Operação Concluída",
            description: `${deletedCount} empreendimento(s) foram excluídos com sucesso.`,
        });
    } catch (error: unknown) {
        const err = error as Error;
        toast({
            variant: "destructive",
            title: "❌ Erro ao Excluir Todos",
            description: err.message,
        });
    } finally {
        setIsDeletingAll(false);
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <Card>
            <CardHeader>
                <CardTitle>Gerenciamento de Empreendimentos</CardTitle>
                <CardDescription>Adicione novos empreendimentos via planilha ou edite existentes.</CardDescription>
                <div className="pt-4 flex flex-col sm:flex-row gap-2">
                   <div>
                      <input
                        type="file"
                        accept=".xlsx"
                        ref={propertiesExcelInputRef}
                        onChange={handlePropertiesUpload}
                        className="hidden"
                      />
                      <Button onClick={() => propertiesExcelInputRef.current?.click()} disabled={isUploadingProperties}>
                          {isUploadingProperties ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                          {isUploadingProperties ? 'Enviando...' : 'Adicionar Novos (Planilha)'}
                      </Button>
                   </div>
                   <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" disabled={isDeletingAll || !properties || properties.length === 0}>
                                {isDeletingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                Excluir Todos
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar Exclusão Total</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Tem certeza que deseja excluir TODOS os empreendimentos? Esta ação é irreversível e removerá todos os dados de todos os empreendimentos permanentemente.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteAllProperties}>
                                    Sim, Excluir Todos
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <Button variant="outline" asChild>
                        <Link href="/simulator">
                            <Calculator className="mr-2 h-4 w-4" />
                            Ir para o Simulador
                        </Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/caixa-simulation">
                            <Calculator className="mr-2 h-4 w-4" />
                            Ir para Simulação Caixa
                        </Link>
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
               {propertiesLoading ? (
                   <div className="flex items-center justify-center p-8">
                       <Loader2 className="h-8 w-8 animate-spin" />
                   </div>
               ) : (
                    <Accordion
                        type="single"
                        collapsible
                        className="w-full"
                        value={activeAccordionItem ?? ""}
                        onValueChange={setActiveAccordionItem}
                    >
                        {properties.map((property) => {
                            const currentIsAnalyzing = isAnalyzing[property.id] || false;
                            const currentIsDeleting = isDeleting[property.id] || false;

                            return (
                                <AccordionItem value={property.id} key={property.id}>
                                   <div className="flex items-center w-full pr-4 hover:bg-muted/50 rounded-md">
                                        <AccordionTrigger className="flex-1 hover:no-underline px-4 py-2">
                                            <div className="flex items-center gap-2">
                                                <Building className="h-4 w-4" />
                                                <span>{property.enterpriseName}</span>
                                                {property.pricing && property.pricing.length > 0 && property.pricing.every(p => p.saleValue > 0) && ( // Check if pricing exists and has valid sale values
                                                    <div className="flex items-center gap-1 text-xs text-green-600">
                                                        <FileBarChart2 className="h-4 w-4" />
                                                        <span>Preços OK</span>
                                                    </div>
                                                )}
                                                 {property.availability?.towers && property.availability.towers.length > 0 && (
                                                    <div className="flex items-center gap-1 text-xs text-blue-600"> {/* Assuming Availability has a way to check if it's populated */}
                                                        <Grid3X3 className="h-4 w-4" />
                                                        <span>Disponibilidade OK</span>
                                                    </div>
                                                )}
                                            </div>
                                        </AccordionTrigger>
                                        <div className="flex items-center gap-2 pl-2">
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                     <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentIsDeleting}>
                                                        {currentIsDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive"/>}
                                                     </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Tem certeza que deseja excluir o empreendimento "{property.enterpriseName}"? Esta ação não pode ser desfeita e removerá todos os dados associados, incluindo preços e disponibilidade.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteProperty(property.id, property.enterpriseName)}>
                                                            Sim, Excluir
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </div>
                                    <AccordionContent>
                                        <Tabs defaultValue="pricing" className="p-2">
                                            <TabsList>
                                                <TabsTrigger value="pricing" disabled={currentIsAnalyzing}>Tabela de Preços</TabsTrigger> {/* Disable pricing tab if analyzing */}
                                                <TabsTrigger value="availability" disabled={!property.pricing || property.pricing.length === 0}>Disponibilidade</TabsTrigger> {/* Disable availability if no pricing data */}
                                            </TabsList>
                                            <TabsContent value="pricing" className="pt-4">
                                                {currentIsAnalyzing && <div className="mb-4">Analisando...</div>}
                                                
                                                {property.pricing && property.pricing.length > 0 ? (
                                                    <div className="p-4 bg-muted/50 rounded-lg">
                                                        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
                                                            <div className="flex-1">
                                                                <h3 className="font-semibold">Tabela de Preços Carregada</h3>
                                                                <p className="text-xs text-muted-foreground">
                                                                    Última atualização: {property.lastPriceUpdate instanceof Timestamp ? format(property.lastPriceUpdate.toDate(), 'dd/MM/yyyy HH:mm') : 'N/A'}
                                                                </p>
                                                            </div>
                                                            <div className="flex flex-col sm:flex-row gap-2">
                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <Button variant="destructive" size="sm" disabled={currentIsDeleting}>
                                                                            <Trash2 className="mr-2 h-4 w-4"/> Excluir Tabela
                                                                        </Button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                        <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                                                        <AlertDialogDescription>
                                                                            Tem certeza que deseja excluir a tabela de preços de "{property.enterpriseName}"? Esta ação não pode ser desfeita e também removerá os dados de disponibilidade.
                                                                        </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                        <AlertDialogAction onClick={() => handleDeletePricing(property.id, property.enterpriseName)}>
                                                                            Sim, Excluir
                                                                        </AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                            </div>
                                                        </div>
                                                        <div className="mt-4">
                                                            <h4 className="font-medium text-sm mb-2">Visualização dos Dados</h4>
                                                            <div className="max-h-60 overflow-y-auto border rounded-md">
                                                                <Table>
                                                                    <TableHeader>
                                                                        <TableRow>
                                                                            <TableHead>Unidade</TableHead>
                                                                            <TableHead>Bloco/Torre</TableHead>
                                                                            <TableHead className="text-right min-w-[150px]">Venda</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {property.pricing.map((p: CombinedUnit, index: number) => (
                                                                          <TableRow key={p.unitId || index}> {/* Use index as fallback key */}
                                                                                <TableCell>{p.unitNumber}</TableCell>
                                                                                <TableCell>{p.block}</TableCell> {/* Use block or tower */}
                                                                                <TableCell className="text-right">{centsToBrl(p.saleValue)}</TableCell> 
                                                                            </TableRow>
                                                                        ))}
                                                                    </TableBody>
                                                                </Table>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="p-4 border-2 border-dashed rounded-lg">
                                                        <div className="text-center">
                                                            <h3 className="font-semibold">Aguardando arquivo de preços</h3>
                                                            <p className="text-sm text-muted-foreground">Envie uma planilha Excel (.xlsx) com os dados.</p>
                                                        </div>
                                                        <div className="mt-4 flex flex-col sm:flex-row gap-2">
                                                            <input
                                                                type="file"
                                                                accept=".xlsx"
                                                                ref={(el) => {
                                                                    if (el) {
                                                                        pricingExcelInputRefs.current[property.id] = el;
                                                                    }
                                                                }}
                                                                onChange={(e) => handlePricingUpload(e, property)}
                                                                className="hidden"
                                                            />
                                                            <Button
                                                                size="lg"
                                                                onClick={() => pricingExcelInputRefs.current[property.id]?.click()}
                                                                disabled={currentIsAnalyzing}
                                                                className="flex-1"
                                                            >
                                                                {currentIsAnalyzing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <FileSpreadsheet className="mr-2 h-5 w-5" />}
                                                                {currentIsAnalyzing ? "Analisando..." : "Analisar Tabela (Excel)"}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </TabsContent>
                                            <TabsContent value="availability">
                                                <AvailabilityManager property={property} />
                                            </TabsContent>
                                        </Tabs>
                                    </AccordionContent>
                                </AccordionItem>
                            );
                       })}
                    </Accordion>
                )}
            </CardContent>
        </Card>
    </div>
 );
}
