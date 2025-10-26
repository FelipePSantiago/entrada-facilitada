// src/components/business/caixa-simulation.tsx
"use client";
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  Building, 
  DollarSign, 
  Calendar, 
  Percent, 
  FileText, 
  Upload,
  Calculator,
  AlertCircle,
  CheckCircle,
  Info
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CaixaSimulationProps {
  onSimulationComplete?: (result: any) => void;
}

export function CaixaSimulation({ onSimulationComplete }: CaixaSimulationProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("manual");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [extractingData, setExtractingData] = useState(false);
  
  // Estado do formulário manual
  const [formData, setFormData] = useState({
    propertyValue: "",
    monthlyIncome: "",
    birthDate: "",
    amortizationSystem: "PRICE TR",
  });
  
  // Formata valores como moeda brasileira
  const formatCurrency = (value: string) => {
    if (!value) return "";
    
    // Remove todos os caracteres não numéricos
    const numericValue = value.replace(/\D/g, "");
    
    // Converte para número e formata como moeda
    const number = parseFloat(numericValue) / 100;
    
    if (isNaN(number)) return "";
    
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    }).format(number);
  };
  
  // Handle currency input change
  const handleCurrencyChange = (fieldName: string, value: string) => {
    // Remove todos os caracteres não numéricos
    const numericValue = value.replace(/\D/g, "");
    
    // Atualiza o valor no formulário (em centavos)
    setFormData(prev => ({
      ...prev,
      [fieldName]: numericValue
    }));
  };
  
  // Handle form input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === "propertyValue" || name === "monthlyIncome") {
      handleCurrencyChange(name, value);
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };
  
  // Handle select change
  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      setUploadProgress(0);
      setExtractingData(false);
    }
  };
  
  // Extract data from PDF
  const extractDataFromPDF = async () => {
    if (!file) return;
    
    setExtractingData(true);
    setUploadProgress(0);
    
    try {
      // Simulação de upload e extração de dados
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 10;
        });
      }, 200);
      
      // Aguarda o "upload" completar
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Simulação de extração de dados - substitua com sua lógica real
      const extractedData = {
        propertyValue: "50000000", // R$ 500.000,00 em centavos
        monthlyIncome: "1000000", // R$ 10.000,00 em centavos
        birthDate: "1985-05-15",
        amortizationSystem: "PRICE TR",
      };
      
      setFormData(extractedData);
      
      toast({
        title: "Dados extraídos com sucesso!",
        description: "Os dados foram preenchidos automaticamente. Verifique e ajuste se necessário.",
      });
    } catch (error) {
      console.error("Erro ao extrair dados do PDF:", error);
      toast({
        variant: "destructive",
        title: "Erro na extração de dados",
        description: "Não foi possível extrair os dados do PDF. Tente novamente ou preencha os dados manualmente.",
      });
    } finally {
      setExtractingData(false);
    }
  };
  
  // Simulate Caixa financing
  const simulateCaixaFinancing = async () => {
    setLoading(true);
    
    try {
      // Validação dos dados
      if (!formData.propertyValue || !formData.monthlyIncome || !formData.birthDate) {
        toast({
          variant: "destructive",
          title: "Dados incompletos",
          description: "Preencha todos os campos obrigatórios.",
        });
        setLoading(false);
        return;
      }
      
      // Simulação de chamada à API - substitua com sua lógica real
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Simulação de resultado - substitua com sua lógica real
      const simulationResult = {
        success: true,
        data: {
          term: "360 meses",
          totalFinanced: "R$ 400.000,00",
          firstInstallment: "R$ 3.850,50",
          effectiveInterest: "10,5% ao ano",
          propertyValue: "R$ 500.000,00",
          maxTerm: "360 meses",
          amortizationSystem: formData.amortizationSystem,
          maxQuota: "80%",
          entryValue: "R$ 100.000,00",
          nominalInterest: "10% ao ano",
          totalInsurance: "R$ 25.000,00",
          adminFee: "R$ 5.000,00",
        },
      };
      
      setResult(simulationResult);
      
      if (onSimulationComplete) {
        onSimulationComplete(simulationResult);
      }
      
      toast({
        title: "Simulação realizada com sucesso!",
        description: "Confira os resultados abaixo.",
      });
    } catch (error) {
      console.error("Erro na simulação:", error);
      toast({
        variant: "destructive",
        title: "Erro na simulação",
        description: "Ocorreu um erro ao realizar a simulação. Tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="w-full">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            Simulação Caixa
          </CardTitle>
          <CardDescription>
            Simule o financiamento imobiliário diretamente com as condições da Caixa Econômica Federal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual" className="flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Preencher Manualmente
              </TabsTrigger>
              <TabsTrigger value="upload" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Enviar PDF
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="manual" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="propertyValue">Valor de Avaliação do Imóvel</Label>
                  <Input
                    id="propertyValue"
                    name="propertyValue"
                    placeholder="R$ 0,00"
                    value={formatCurrency(formData.propertyValue)}
                    onChange={handleInputChange}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="monthlyIncome">Renda Familiar Mensal Bruta</Label>
                  <Input
                    id="monthlyIncome"
                    name="monthlyIncome"
                    placeholder="R$ 0,00"
                    value={formatCurrency(formData.monthlyIncome)}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="birthDate">Data de Nascimento</Label>
                  <Input
                    id="birthDate"
                    name="birthDate"
                    type="date"
                    value={formData.birthDate}
                    onChange={handleInputChange}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="amortizationSystem">Sistema de Amortização</Label>
                  <Select 
                    value={formData.amortizationSystem} 
                    onValueChange={(value) => handleSelectChange("amortizationSystem", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o sistema" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PRICE TR">PRICE TR</SelectItem>
                      <SelectItem value="SAC">SAC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <Button 
                onClick={simulateCaixaFinancing} 
                className="w-full" 
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Simulando...
                  </>
                ) : (
                  <>
                    <Calculator className="mr-2 h-4 w-4" />
                    Simular Financiamento
                  </>
                )}
              </Button>
            </TabsContent>
            
            <TabsContent value="upload" className="space-y-6 mt-6">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Envie um PDF da simulação da Caixa e nossa IA irá extrair os dados automaticamente para você.
                </AlertDescription>
              </Alert>
              
              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center">
                  <Upload className="h-10 w-10 mx-auto mb-4 text-gray-400" />
                  <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                    Clique para selecionar um arquivo PDF ou arraste e solte aqui
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Apenas arquivos PDF são aceitos
                  </p>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="pdf-upload"
                  />
                  <label htmlFor="pdf-upload">
                    <Button variant="outline" className="mt-4 cursor-pointer" asChild>
                      <span>Selecionar Arquivo</span>
                    </Button>
                  </label>
                </div>
                
                {file && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-blue-600" />
                        <span className="text-sm font-medium">{file.name}</span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                    
                    {uploadProgress > 0 && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Enviando arquivo...</span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <Progress value={uploadProgress} className="h-2" />
                      </div>
                    )}
                    
                    {uploadProgress === 100 && !extractingData && (
                      <Button onClick={extractDataFromPDF} className="w-full">
                        Extrair Dados do PDF
                      </Button>
                    )}
                    
                    {extractingData && (
                      <div className="flex items-center justify-center gap-2 py-4">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                        <span className="text-sm">Extraindo dados do PDF...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {formData.propertyValue && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Dados Extraídos</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="extractedPropertyValue">Valor de Avaliação do Imóvel</Label>
                      <Input
                        id="extractedPropertyValue"
                        name="propertyValue"
                        placeholder="R$ 0,00"
                        value={formatCurrency(formData.propertyValue)}
                        onChange={handleInputChange}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="extractedMonthlyIncome">Renda Familiar Mensal Bruta</Label>
                      <Input
                        id="extractedMonthlyIncome"
                        name="monthlyIncome"
                        placeholder="R$ 0,00"
                        value={formatCurrency(formData.monthlyIncome)}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="extractedBirthDate">Data de Nascimento</Label>
                      <Input
                        id="extractedBirthDate"
                        name="birthDate"
                        type="date"
                        value={formData.birthDate}
                        onChange={handleInputChange}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="extractedAmortizationSystem">Sistema de Amortização</Label>
                      <Select 
                        value={formData.amortizationSystem} 
                        onValueChange={(value) => handleSelectChange("amortizationSystem", value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o sistema" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PRICE TR">PRICE TR</SelectItem>
                          <SelectItem value="SAC">SAC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={simulateCaixaFinancing} 
                    className="w-full" 
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                        Simulando...
                      </>
                    ) : (
                      <>
                        <Calculator className="mr-2 h-4 w-4" />
                        Simular Financiamento
                      </>
                    )}
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
          
          {result && result.success && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <h3 className="text-lg font-semibold">Resultados da Simulação</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Prazo
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">{result.data.term}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Valor Total Financiado
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">{result.data.totalFinanced}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Primeira Prestação
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">{result.data.firstInstallment}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Juros Efetivos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">{result.data.effectiveInterest}</div>
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>Detalhes da Simulação</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Valor do Imóvel
                    </span>
                    <span className="font-medium">{result.data.propertyValue}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Valor de Entrada
                    </span>
                    <span className="font-medium">{result.data.entryValue}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Sistema de Amortização
                    </span>
                    <span className="font-medium">{result.data.amortizationSystem}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Prazo Máximo
                    </span>
                    <span className="font-medium">{result.data.maxTerm}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Cota Máxima
                    </span>
                    <span className="font-medium">{result.data.maxQuota}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Juros Nominais
                    </span>
                    <span className="font-medium">{result.data.nominalInterest}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Total de Seguros
                    </span>
                    <span className="font-medium">{result.data.totalInsurance}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Taxa Administrativa
                    </span>
                    <span className="font-medium">{result.data.adminFee}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {result && !result.success && (
            <Alert className="mt-6" variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Ocorreu um erro ao realizar a simulação. Verifique os dados e tente novamente.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}