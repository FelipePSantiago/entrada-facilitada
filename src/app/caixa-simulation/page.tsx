// src/app/caixa-simulation/page.tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getFunctions, httpsCallable, HttpsCallableResult } from "firebase/functions";
import { app } from "@/firebase/config";
import { useAuthState } from "react-firebase-hooks/auth";
import { getAuth } from "firebase/auth";
import { FaSpinner } from "react-icons/fa";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle } from "lucide-react";

// Interface para os dados do resultado da simulação
interface SimulationResult {
  sucesso: boolean;
  dados?: {
    Prazo: string;
    Valor_Total_Financiado: string;
    Primeira_Prestacao: string;
    Juros_Efetivos: string;
    valorImovel?: string;
    prazoMaximo?: string;
    sistemaAmortizacao?: string;
    cotaMaxima?: string;
    valorEntrada?: string;
    jurosNominais?: string;
    totalSeguros?: string;
    taxaAdm?: string;
  };
  message?: string;
}

// Função para formatar valor em centavos para exibição (59800000 → R$ 598.000,00)
const formatarCentavosParaReal = (centavos: string): string => {
  if (!centavos || centavos === '0') return 'R$ 0,00';
  const numero = parseFloat(centavos) / 100; // Divide por 100 para converter centavos para reais
  if (isNaN(numero)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numero);
};

// Função para corrigir formato de valores vindo do backend (inverte ponto por vírgula)
const corrigirFormatoValor = (valor: string): string => {
  if (!valor) return valor;
  
  // Se for uma taxa de juros (contém %)
  if (valor.includes('%')) {
    // Formato esperado: "10.7601%" → "10,7601%"
    return valor.replace('.', ',');
  }
  
  // Se for um valor monetário (contém R$)
  if (valor.includes('R$')) {
    // Formato esperado: "R$ 378,078.31" → "R$ 378.078,31"
    // Primeiro remove o "R$ " para processar apenas o número
    const valorNumerico = valor.replace('R$ ', '');
    
    // Divide em parte inteira e decimal
    const partes = valorNumerico.split('.');
    
    if (partes.length === 2) {
      // Se tem duas partes, assume que a primeira é a parte inteira com milhares
      // e a segunda é a parte decimal
      const parteInteira = partes[0].replace(',', '.'); // Converte vírgula de milhar para ponto
      const parteDecimal = partes[1];
      return `R$ ${parteInteira},${parteDecimal}`;
    } else if (partes.length === 1) {
      // Se só tem uma parte, pode ser que não tenha milhares ou não tenha decimais
      if (valorNumerico.includes(',')) {
        // Se tem vírgula, assume que é separador de milhares
        return `R$ ${valorNumerico.replace(',', '.')}`;
      } else {
        // Se não tem nem ponto nem vírgula, só retorna o valor
        return `R$ ${valorNumerico}`;
      }
    }
  }
  
  // Para outros casos, apenas retorna o valor original
  return valor;
};

// Função para remover formatação e obter apenas números
const removerFormatacao = (valorFormatado: string): string => {
  return valorFormatado.replace(/\D/g, '');
};

// Função para formatar durante a digitação (59800000 → R$ 598.000,00)
const formatarDuranteDigitacao = (valor: string): string => {
  // Remove tudo que não é número
  const apenasNumeros = removerFormatacao(valor);
  
  if (apenasNumeros === '') return '';
  
  // Converte centavos para reais e formata
  return formatarCentavosParaReal(apenasNumeros);
};

// Função para formatar data de YYYY-MM-DD para DD/MM/YYYY
const formatarDataParaBackend = (data: string): string => {
  if (!data) return '';
  
  if (data.includes('/')) return data;
  
  const partes = data.split('-');
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  
  return data;
};

const CaixaSimulationForm = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState("");
  
  const [formData, setFormData] = useState({
    renda: "",
    dataNascimento: "",
    valorImovel: "",
    sistemaAmortizacao: "PRICE TR",
  });
  
  const [valoresFormatados, setValoresFormatados] = useState({
    valorImovel: "",
    renda: ""
  });

  // Manipula mudanças nos campos monetários
  const handleMonetaryChange = (name: 'valorImovel' | 'renda', value: string) => {
    console.log(`🔧 handleMonetaryChange - ${name}:`, value);
    
    // Se o valor estiver vazio, limpa ambos os estados
    if (value === '') {
      setValoresFormatados(prev => ({ ...prev, [name]: '' }));
      setFormData(prev => ({ ...prev, [name]: '' }));
      return;
    }
    
    // Remove qualquer formatação existente para obter apenas números
    const apenasNumeros = removerFormatacao(value);
    
    // Se não há números, retorna
    if (apenasNumeros === '') {
      setValoresFormatados(prev => ({ ...prev, [name]: '' }));
      setFormData(prev => ({ ...prev, [name]: '' }));
      return;
    }
    
    // Formata visualmente para o usuário (converte centavos para reais)
    const valorFormatado = formatarDuranteDigitacao(apenasNumeros);
    
    console.log(`📊 Conversão ${name}:`);
    console.log(' Valor bruto:', value);
    console.log(' Apenas números (centavos):', apenasNumeros);
    console.log(' Formatado (reais):', valorFormatado);
    
    // Atualiza ambos os estados
    setValoresFormatados(prev => ({ ...prev, [name]: valorFormatado }));
    setFormData(prev => ({ ...prev, [name]: apenasNumeros })); // Mantém os centavos
  };

  // Manipula mudanças em outros campos
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    console.log(`📝 handleChange - ${name}:`, value);
    
    if (name === 'valorImovel' || name === 'renda') {
      handleMonetaryChange(name, value);
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Função para lidar com foco nos campos monetários
  const handleMonetaryFocus = (name: 'valorImovel' | 'renda') => {
    console.log(`🎯 Foco no campo ${name}:`, valoresFormatados[name]);
    
    // Se o campo estiver vazio ou com R$ 0,00, limpa para facilitar a digitação
    if (!valoresFormatados[name] || valoresFormatados[name] === 'R$ 0,00') {
      setValoresFormatados(prev => ({ ...prev, [name]: '' }));
    }
  };

  // Função para lidar com perda de foco nos campos monetários
  const handleMonetaryBlur = (name: 'valorImovel' | 'renda') => {
    console.log(`👋 Blur no campo ${name}:`, valoresFormatados[name]);
    
    // Se o campo estiver vazio, formata como R$ 0,00
    if (!valoresFormatados[name] || valoresFormatados[name] === '') {
      setValoresFormatados(prev => ({ ...prev, [name]: 'R$ 0,00' }));
      setFormData(prev => ({ ...prev, [name]: '0' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError("");
    
    try {
      const functions = getFunctions(app);
      const simularFinanciamento = httpsCallable<Record<string, string>, SimulationResult>(
        functions, 
        'simularFinanciamentoCaixa'
      );
      
      console.log('🚀 DADOS ENVIADOS PARA BACKEND:');
      console.log(' Valor Imóvel:', { 
        digitado: valoresFormatados.valorImovel, 
        formatado: valoresFormatados.valorImovel, 
        enviado: formData.valorImovel 
      });
      console.log(' Renda:', { 
        digitado: valoresFormatados.renda, 
        formatado: valoresFormatados.renda, 
        enviado: formData.renda 
      });
      
      // Validação dos dados
      if (!formData.valorImovel || formData.valorImovel === '0') {
        throw new Error("Valor do imóvel é obrigatório");
      }
      
      if (!formData.renda || formData.renda === '0') {
        throw new Error("Renda familiar é obrigatória");
      }
      
      const dadosParaBackend = {
        ...formData,
        valorImovel: formData.valorImovel, // Já está em centavos
        renda: formData.renda, // Já está em centavos
        dataNascimento: formatarDataParaBackend(formData.dataNascimento),
      };
      
      const response: HttpsCallableResult<SimulationResult> = await simularFinanciamento(dadosParaBackend);
      const data = response.data;
      
      console.log('✅ RESPOSTA DO BACKEND:', data);
      
      if (data.sucesso && data.dados) {
        setResult(data);
        toast({
          title: "Sucesso!",
          description: "Simulação realizada com sucesso.",
        });
      } else if (data.message) {
        // If data.sucesso is false but there's a message, throw an error with the message
        throw new Error(data.message);
      } else {
        // If neither success nor a specific message, throw a generic error
        throw new Error("Falha na simulação.");
      }
    } catch (err: unknown) {
      console.error('Erro detalhado:', err);
      
      let errorMessage = "Ocorreu um erro desconhecido.";
      
      if (err instanceof Error) {
        // Handle standard JavaScript Errors
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null && 'details' in err) {
        // Handle errors with a 'details' property (common in some APIs)
        const errorWithDetails = err as { details?: unknown };
        if (typeof errorWithDetails.details === 'string') {
          errorMessage = errorWithDetails.details;
        }
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
      
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Erro na Simulação",
        description: errorMessage
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold mb-2">Simulação Caixa</h1>
          <p className="text-gray-600 dark:text-gray-400">Origem de recurso: SBPE</p>
        </div>

        <Card className="shadow-lg mb-6">
          <CardHeader>
            <CardTitle className="text-xl">Preencha os dados para simular o financiamento.</CardTitle>
            <CardDescription>
              Todos os campos são obrigatórios para realizar a simulação.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="valorImovel">Valor de Avaliação do Imóvel</Label>
                  <Input
                    id="valorImovel"
                    name="valorImovel"
                    value={valoresFormatados.valorImovel}
                    onChange={handleChange}
                    onFocus={() => handleMonetaryFocus('valorImovel')}
                    onBlur={() => handleMonetaryBlur('valorImovel')}
                    placeholder="R$ 0,00"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="renda">Renda Familiar Mensal Bruta</Label>
                  <Input
                    id="renda"
                    name="renda"
                    value={valoresFormatados.renda}
                    onChange={handleChange}
                    onFocus={() => handleMonetaryFocus('renda')}
                    onBlur={() => handleMonetaryBlur('renda')}
                    placeholder="R$ 0,00"
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="dataNascimento">Data de Nascimento</Label>
                  <Input
                    id="dataNascimento"
                    name="dataNascimento"
                    type="date"
                    value={formData.dataNascimento}
                    onChange={handleChange}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="sistemaAmortizacao">Sistema de Amortização</Label>
                  <Select value={formData.sistemaAmortizacao} onValueChange={(value) => setFormData(prev => ({ ...prev, sistemaAmortizacao: value }))}>
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
                type="submit" 
                className="w-full" 
                disabled={loading}
                size="lg"
              >
                {loading && <FaSpinner className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? "Simulando..." : "Simular Financiamento"}
              </Button>
            </form>
            
            {error && (
              <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-red-800 dark:text-red-400">Erro:</h4>
                  <p className="text-red-700 dark:text-red-300">{error}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        {result && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Resultados da Simulação Caixa
              </CardTitle>
              <CardDescription>
                Valores extraídos diretamente do portal da Caixa
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Prazo:</span>
                    <span className="font-medium">{result.dados.Prazo || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Valor Total Financiado:</span>
                    <span className="font-medium">{corrigirFormatoValor(result.dados.Valor_Total_Financiado || 'N/A')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Primeira Prestação:</span>
                    <span className="font-medium">{corrigirFormatoValor(result.dados.Primeira_Prestacao || 'N/A')}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Juros Efetivos:</span>
                    <span className="font-medium">{corrigirFormatoValor(result.dados.Juros_Efetivos || 'N/A')}</span>
                  </div>
                  {result.dados.valorImovel && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Valor do Imóvel:</span>
                      <span className="font-medium">{corrigirFormatoValor(result.dados.valorImovel)}</span>
                    </div>
                  )}
                  {result.dados.sistemaAmortizacao && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Sistema de Amortização:</span>
                      <span className="font-medium">{result.dados.sistemaAmortizacao}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default function CaixaSimulationPage() {
  const [user, loading] = useAuthState(getAuth(app));
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <FaSpinner className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Carregando...</p>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Acesso Restrito</CardTitle>
            <CardDescription>
              Você precisa estar logado para acessar esta página.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <a href="/login">Fazer Login</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return <CaixaSimulationForm />;
}