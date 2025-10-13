// src/app/caixa-simulation/page.tsx

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getFunctions, httpsCallable } from "firebase/functions";
import app from "@/firebase/config"; // Seu config do Firebase
import { useAuthState } from "react-firebase-hooks/auth";
import { getAuth } from "firebase/auth";
import { FaSpinner } from "react-icons/fa"; // Ícone de carregamento

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { calculateEntry } from "@/utils/entryCalculator";
import { EntrySimulationData } from "@/types/entry";
import { formatCurrency } from "@/utils/formatters";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const simulationSchema = z.object({
  propertyValue: z.string().min(1, "O valor do imóvel é obrigatório"),
  entryValue: z.string().min(1, "O valor da entrada é obrigatório"),
  city: z.string().min(1, "A cidade é obrigatória"),
  financingTime: z.number().min(1, "O prazo é obrigatório"),
  interestRate: z.number().min(0, "A taxa de juros é obrigatória"),
  monthlyIncome: z.string().min(1, "A renda mensal é obrigatória"),
});

type SimulationFormData = z.infer<typeof simulationSchema>;

const SimulationResult = ({ data }: { data: EntrySimulationData }) => (
  <Card className="w-full max-w-md mx-auto">
    <CardHeader>
      <CardTitle className="text-center">Resultado da Simulação</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex justify-between">
        <span>Valor do Imóvel:</span>
        <span className="font-bold">{formatCurrency(data.propertyValue)}</span>
      </div>
      <div className="flex justify-between">
        <span>Valor da Entrada:</span>
        <span className="font-bold">{formatCurrency(data.entryValue)}</span>
      </div>
      <div className="flex justify-between">
        <span>Valor Financiado:</span>
        <span className="font-bold">{formatCurrency(data.financedValue)}</span>
      </div>
      <Separator />
      <div className="flex justify-between">
        <span>Prestação Mensal (Tabela Price):</span>
        <span className="font-bold text-green-600">{formatCurrency(data.monthlyPayment)}</span>
      </div>
      <div className="flex justify-between">
        <span>Percentual da Entrada:</span>
        <span className="font-bold">{data.entryPercentage.toFixed(2)}%</span>
      </div>
    </CardContent>
  </Card>
);

const CaixaSimulationForm = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    renda: "",
    dataNascimento: "",
    valorImovel: "",
    sistemaAmortizacao: "PRICE TR",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError("");

    try {
      const functions = getFunctions(app);
      const simularFinanciamento = httpsCallable(functions, 'simularFinanciamentoCaixa');
      
      const response = await simularFinanciamento(formData);
      const data = response.data as any;

      if (data.sucesso) {
        setResult(data.dados);
        toast({ title: "Sucesso!", description: "Simulação realizada com sucesso." });
      } else {
        throw new Error(data.message || "Falha na simulação.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Ocorreu um erro desconhecido.");
      toast({ variant: "destructive", title: "Erro na Simulação", description: err.message });
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
            <Input id="valorImovel" name="valorImovel" type="number" value={formData.valorImovel} onChange={handleChange} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="renda">Renda Familiar Mensal Bruta</Label>
            <Input id="renda" name="renda" type="number" value={formData.renda} onChange={handleChange} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dataNascimento">Data de Nascimento</Label>
            <Input id="dataNascimento" name="dataNascimento" type="date" value={formData.dataNascimento} onChange={handleChange} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sistemaAmortizacao">Sistema de Amortização</Label>
            <Select value={formData.sistemaAmortizacao} onValueChange={(value) => setFormData(prev => ({ ...prev, sistemaAmortizacao: value }))}>
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
            </CardHeader>
            <CardContent className="space-y-2">
              <p><strong>Prazo:</strong> {result.prazo}</p>
              <p><strong>Valor Total Financiado:</strong> {result.valorFinanciamento}</p>
              <p><strong>Primeira Prestação:</strong> {result.primeiraPrestacao}</p>
              <p><strong>Juros Efetivos:</strong> {result.jurosEfetivos}</p>
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

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SimulationFormData>({
    resolver: zodResolver(simulationSchema),
    defaultValues: {
      financingTime: 360,
      interestRate: 12,
    },
  });

  const watchedValues = watch();
  const [simulationResult, setSimulationResult] = useState<EntrySimulationData | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      toast({ variant: "destructive", title: "Acesso Restrito", description: "Você precisa estar logado para acessar esta página." });
      router.push("/login");
    }
  }, [user, loading, router, toast]);

  const propertyValue = parseFloat(watchedValues.propertyValue) || 0;
  const entryValue = parseFloat(watchedValues.entryValue) || 0;
  const entryPercentage = propertyValue > 0 ? (entryValue / propertyValue) * 100 : 0;

  const onSliderChange = (value: number[]) => {
    setValue("entryValue", String(value[0]));
  };

  const onFormSubmit = (data: SimulationFormData) => {
    try {
      const result = calculateEntry(data);
      setSimulationResult(result);
      toast({ title: "Simulação Concluída!", description: "Os resultados foram calculados com base nos dados informados." });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Ocorreu um erro inesperado.";
      toast({ variant: "destructive", title: "Erro na Simulação", description: errorMessage });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <FaSpinner className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null; // Redirecionamento será feito pelo useEffect
  }

  return (
    <div className="container mx-auto p-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Simulações de Financiamento</h1>
      
      <Tabs defaultValue="entrada-facilitada" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="entrada-facilitada">Entrada Facilitada</TabsTrigger>
          <TabsTrigger value="caixa">Simulação Caixa</TabsTrigger>
        </TabsList>
        
        <TabsContent value="entrada-facilitada" className="space-y-6">
          <Card className="w-full max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle>Simulador de Entrada Facilitada</CardTitle>
              <CardDescription>
                Preencha os dados do imóvel e do financiamento para calcular o valor da entrada e das parcelas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="propertyValue">Valor do Imóvel</Label>
                    <Input id="propertyValue" {...register("propertyValue")} placeholder="R$ 500.000,00" />
                    {errors.propertyValue && <p className="text-red-500 text-sm">{errors.propertyValue.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="monthlyIncome">Renda Mensal Familiar</Label>
                    <Input id="monthlyIncome" {...register("monthlyIncome")} placeholder="R$ 10.000,00" />
                    {errors.monthlyIncome && <p className="text-red-500 text-sm">{errors.monthlyIncome.message}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input id="city" {...register("city")} placeholder="São Paulo, SP" />
                  {errors.city && <p className="text-red-500 text-sm">{errors.city.message}</p>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Prazo do Financiamento (meses): {watchedValues.financingTime}</Label>
                    <Slider
                      min={60} // CORRIGIDO
                      max={420} // CORRIGIDO
                      step={6} // CORRIGIDO
                      value={[watchedValues.financingTime]}
                      onValueChange={(value) => setValue("financingTime", value[0])}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Taxa de Juros Anual (%): {watchedValues.interestRate}</Label>
                    <Slider
                      min={4} // CORRIGIDO
                      max={20} // CORRIGIDO
                      step={0.1} // CORRIGIDO
                      value={[watchedValues.interestRate]}
                      onValueChange={(value) => setValue("interestRate", value[0])}
                      className="w-full"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Valor da Entrada: {formatCurrency(entryValue)} ({entryPercentage.toFixed(2)}%)</Label>
                  <Slider
                    min={0} // CORRIGIDO
                    max={propertyValue} // CORRIGIDO
                    step={1000} // CORRIGIDO
                    value={[entryValue]}
                    onValueChange={onSliderChange}
                    className="w-full"
                  />
                </div>
                <Button type="submit" className="w-full">Calcular Financiamento</Button>
              </form>
            </CardContent>
          </Card>
          {simulationResult && <SimulationResult data={simulationResult} />}
        </TabsContent>

        <TabsContent value="caixa" className="mt-6">
          <CaixaSimulationForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}