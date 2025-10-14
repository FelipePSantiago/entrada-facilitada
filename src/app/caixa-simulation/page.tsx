// src/app/caixa-simulation/page.tsx

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getFunctions, httpsCallable } from "firebase/functions";
import app from "@/firebase/config"; // Firebase config
import { useAuthState } from "react-firebase-hooks/auth";
import { getAuth } from "firebase/auth";
import { FaSpinner } from "react-icons/fa"; // Loading icon

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

// This component contains the form for the automated Caixa simulation.
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

// Main page component, simplified to only show the Caixa simulation.
export default function CaixaSimulationPage() {
  const [user, loading] = useAuthState(getAuth(app));
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && !user) {
      toast({ variant: "destructive", title: "Acesso Restrito", description: "Você precisa estar logado para acessar esta página." });
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
    return null; // Redirect is handled by the useEffect hook
  }

  return (
    <div className="container mx-auto p-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Simulação Automatizada Caixa</h1>
      <CaixaSimulationForm />
    </div>
  );
}
