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

// Interface for the simulation result data
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
  const [result, setResult] = useState<SimulationResult['dados'] | null>(null);
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
    console.log('  Valor bruto:', value);
    console.log('  Apenas números (centavos):', apenasNumeros);
    console.log('  Formatado (reais):', valorFormatado);
    
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
      console.log('  Valor Imóvel:', {
        digitado: formData.valorImovel,
        formatado: valoresFormatados.valorImovel,
        enviado: formData.valorImovel
      });
      console.log('  Renda:', {
        digitado: formData.renda,
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
        setResult(data.dados);
        toast({ 
          title: "Sucesso!", 
          description: "Simulação realizada com sucesso." 
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
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Simulador de Financiamento Caixa</CardTitle>
        <CardDescription>
          Preencha os dados para simular o financiamento no portal da Caixa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="valorImovel">Valor de Avaliação do Imóvel</Label>
            <Input 
              id="valorImovel" 
              name="valorImovel" 
              type="text"
              value={valoresFormatados.valorImovel}
              onChange={handleChange}
              onFocus={() => handleMonetaryFocus('valorImovel')}
              onBlur={() => handleMonetaryBlur('valorImovel')}
              placeholder="Digite o valor em centavos"
              required 
            />
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                💡 <strong>Como preencher (digite em centavos):</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                • Para <strong>R$ 598.000,00</strong> digite: <strong>59800000</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                • Para <strong>R$ 250.000,00</strong> digite: <strong>25000000</strong>
              </p>
              <p className="text-xs text-blue-600 font-semibold mt-1">
                O valor será formatado automaticamente em reais
              </p>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="renda">Renda Familiar Mensal Bruta</Label>
            <Input 
              id="renda" 
              name="renda" 
              type="text"
              value={valoresFormatados.renda}
              onChange={handleChange}
              onFocus={() => handleMonetaryFocus('renda')}
              onBlur={() => handleMonetaryBlur('renda')}
              placeholder="Digite o valor em centavos"
              required 
            />
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                💡 <strong>Como preencher (digite em centavos):</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                • Para <strong>R$ 14.000,00</strong> digite: <strong>1400000</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                • Para <strong>R$ 8.500,00</strong> digite: <strong>850000</strong>
              </p>
              <p className="text-xs text-blue-600 font-semibold mt-1">
                O valor será formatado automaticamente em reais
              </p>
            </div>
          </div>
          
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
            <p className="text-xs text-muted-foreground">
              Será convertida para o formato DD/MM/YYYY automaticamente
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="sistemaAmortizacao">Sistema de Amortização</Label>
            <Select 
              value={formData.sistemaAmortizacao} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, sistemaAmortizacao: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o sistema" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRICE TR">PRICE TR</SelectItem>
                <SelectItem value="SAC TR">SAC TR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Button type="submit" disabled={loading} className="w-full md:col-span-2">
            {loading && <FaSpinner className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? "Simulando..." : "Simular Financiamento"}
          </Button>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            <strong>Erro:</strong> {error}
          </div>
        )}

        {result && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Resultados da Simulação Caixa</CardTitle>
              <CardDescription>
                Valores extraídos diretamente do portal da Caixa
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded-lg p-4">
                  <p className="font-semibold text-sm text-muted-foreground">Prazo:</p>
                  <p className="text-lg font-bold">{result.Prazo || 'N/A'}</p>
                </div>
                <div className="border rounded-lg p-4">
                  <p className="font-semibold text-sm text-muted-foreground">Valor Total Financiado:</p>
                  <p className="text-lg font-bold text-green-600">
                    {result.Valor_Total_Financiado || 'N/A'}
                  </p>
                </div>
                <div className="border rounded-lg p-4">
                  <p className="font-semibold text-sm text-muted-foreground">Primeira Prestação:</p>
                  <p className="text-lg font-bold text-blue-600">
                    {result.Primeira_Prestacao || 'N/A'}
                  </p>
                </div>
                <div className="border rounded-lg p-4">
                  <p className="font-semibold text-sm text-muted-foreground">Juros Efetivos:</p>
                  <p className="text-lg font-bold text-purple-600">
                    {result.Juros_Efetivos || 'N/A'}
                  </p>
                </div>
              </div>
              
              {/* DEBUG: Mostrar valores brutos para verificação */}
              <div className="mt-4 p-3 bg-gray-100 rounded-lg">
                <p className="text-sm font-semibold mb-2">Valores brutos (DEBUG):</p>
                <pre className="text-xs">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
};

export default function CaixaSimulationPage() {
  const [user, loading] = useAuthState(getAuth(app));
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && !user) {
      toast({ 
        variant: "destructive", 
        title: "Acesso Restrito", 
        description: "Você precisa estar logado para acessar esta página." 
      });
      router.push("/login");
    }
  }, [user, loading, router, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <FaSpinner className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto p-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Simulação Automatizada Caixa</h1>
      <CaixaSimulationForm />
    </div>
  );
}