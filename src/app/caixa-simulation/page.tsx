"use client";

import { httpsCallable, type HttpsCallableResult } from "firebase/functions";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface SimulationResult {
  sucesso: boolean;
  dados?: {
    Prazo: string;
    Valor_Total_Financiado: string;
    Primeira_Prestacao: string;
    Juros_Efetivos: string;
  };
  message?: string;
}

// Helper to format currency values
const formatCurrency = (value: string): string => {
  const num = parseFloat(value.replace(/[^0-9,-]+/g, "").replace(",", "."));
  if (isNaN(num)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num);
};

const formatInputAsCurrency = (value: string): string => {
  const justNumbers = value.replace(/\D/g, "");
  if (justNumbers === "") return "";
  const num = parseInt(justNumbers, 10) / 100;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const ResultCard = ({ label, value, colorClass }: { label: string, value: string, colorClass: string }) => (
    <div className="border rounded-lg p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
        <p className="font-semibold text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
    </div>
);


function CaixaSimulationForm() {
  const { functions } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult["dados"] | null>(null);

  const [formData, setFormData] = useState({
    renda: "",
    dataNascimento: "",
    valorImovel: "",
    sistemaAmortizacao: "PRICE TR",
  });

  const [formattedValues, setFormattedValues] = useState({
    valorImovel: "",
    renda: "",
  });

  const handleMonetaryChange = (name: "valorImovel" | "renda", value: string) => {
    const formatted = formatInputAsCurrency(value);
    setFormattedValues((prev) => ({ ...prev, [name]: formatted }));
    setFormData((prev) => ({ ...prev, [name]: value.replace(/\D/g, "") }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "valorImovel" || name === "renda") {
      handleMonetaryChange(name as "valorImovel" | "renda", value);
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    if (!functions) {
      toast({ variant: "destructive", title: "Erro de Configuração", description: "Funções de backend não inicializadas." });
      setLoading(false);
      return;
    }

    try {
      const simularFinanciamento = httpsCallable<
        Record<string, string>,
        SimulationResult
      >(functions, "simularFinanciamentoCaixa");

      const dataToSend = {
        ...formData,
        dataNascimento: formData.dataNascimento.split("-").reverse().join("/"),
      };

      const response: HttpsCallableResult<SimulationResult> = await simularFinanciamento(dataToSend);
      const data = response.data;

      if (data.sucesso && data.dados) {
        setResult(data.dados);
        toast({ title: "Sucesso!", description: "Simulação realizada com sucesso." });
      } else {
        throw new Error(data.message || "Falha na simulação. Verifique os dados.");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Ocorreu um erro desconhecido.";
      toast({ variant: "destructive", title: "Erro na Simulação", description: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  return (
     <div className="w-full max-w-4xl p-4 md:p-8">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-foreground">Simulação Automatizada Caixa</h1>
        <p className="text-lg text-muted-foreground mt-2">
          Origem de recurso: SBPE
        </p>
      </div>
      <Card className="w-full shadow-lg">
        <CardContent className="pt-8">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="valorImovel">Valor de Avaliação do Imóvel</Label>
              <Input
                id="valorImovel"
                name="valorImovel"
                type="text"
                value={formattedValues.valorImovel}
                onChange={handleChange}
                placeholder="R$ 0,00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="renda">Renda Familiar Mensal Bruta</Label>
              <Input
                id="renda"
                name="renda"
                type="text"
                value={formattedValues.renda}
                onChange={handleChange}
                placeholder="R$ 0,00"
                required
              />
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="sistemaAmortizacao">Sistema de Amortização</Label>
              <Select
                value={formData.sistemaAmortizacao}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, sistemaAmortizacao: value }))
                }
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

            <Button type="submit" disabled={loading} className="w-full md:col-span-2" size="lg">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Simulando..." : "Simular Financiamento"}
            </Button>
          </form>
        </CardContent>
      </Card>

       {result && (
            <div className="mt-10">
                <Card className="w-full shadow-lg">
                    <CardHeader className="text-center">
                        <CardTitle className="text-3xl font-bold">Resultados da Simulação</CardTitle>
                        <CardDescription>Valores extraídos diretamente do portal da Caixa</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ResultCard label="Prazo" value={`${result.Prazo || 'N/A'} meses`} colorClass="text-foreground" />
                        <ResultCard label="Juros Efetivos" value={result.Juros_Efetivos ? `${result.Juros_Efetivos.replace('.',',')}` : 'N/A'} colorClass="text-purple-600" />
                        <ResultCard label="Primeira Prestação" value={formatCurrency(result.Primeira_Prestacao || '0')} colorClass="text-blue-600" />
                        <ResultCard label="Valor Total Financiado" value={formatCurrency(result.Valor_Total_Financiado || '0')} colorClass="text-green-600" />
                    </CardContent>
                </Card>
            </div>
        )}
    </div>
  );
}

export default function CaixaSimulationPage() {
  const { user, authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) {
      toast({
        variant: "destructive",
        title: "Acesso Restrito",
        description: "Você precisa estar logado para acessar esta página.",
      });
      router.push("/login");
    }
  }, [user, authLoading, router, toast]);

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return <CaixaSimulationForm />;
}
