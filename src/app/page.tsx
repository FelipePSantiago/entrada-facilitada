"use client";

import { BotMessageSquare, FileText, Zap } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

const FeatureCard = ({
  description,
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <Card className="text-center shadow-md hover:shadow-lg transition-shadow bg-card">
    <CardHeader className="items-center">
      <div className="p-4 bg-primary/10 rounded-full mb-2">{icon}</div>
      <CardTitle className="text-foreground">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground">{description}</p>
    </CardContent>
  </Card>
);

export default function RootPage() {
  const router = useRouter();
  const { setIsPageLoading } = useAuth();

  const handleNavigate = (path: string) => {
    setIsPageLoading(true);
    router.push(path);
  };

  return (
    <div className="w-full bg-background text-foreground">
      {/* Hero Section */}
      <section className="text-center py-24 md:py-32">
        <div className="container mx-auto px-4">
          <h1 className="text-5xl md:text-6xl font-bold text-primary mb-4">
            Entrada Facilitada
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            A ferramenta definitiva para corretores. Crie fluxos de pagamento
            personalizados, extraia dados com IA e gere propostas em PDF em
            segundos.
          </p>
          <div className="flex justify-center gap-4">
            <Button size="lg" onClick={() => handleNavigate("/login")}>
              Fazer Login
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => handleNavigate("/plans")}
            >
              Ver Planos
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 md:py-32 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-16 text-foreground">
            Funcionalidades Poderosas
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Zap className="h-8 w-8 text-primary" />}
              title="Simulação Rápida e Flexível"
              description="Calcule fluxos de pagamento lineares ou escalonados, ajuste parcelas e condições em tempo real."
            />
            <FeatureCard
              icon={<BotMessageSquare className="h-8 w-8 text-primary" />}
              title="Extração de Dados com IA"
              description="Envie um PDF da simulação Caixa e nossa IA preenche os campos para você."
            />
            <FeatureCard
              icon={<FileText className="h-8 w-8 text-primary" />}
              title="Geração de PDF Profissional"
              description="Crie propostas de pagamento claras e com visual profissional para enviar aos seus clientes com um clique."
            />
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="py-24 md:py-32">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-4 text-foreground">
            Pronto para agilizar suas vendas?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Escolha um plano que se adapte às suas necessidades e comece a usar
            o simulador mais completo do mercado.
          </p>
          <Button size="lg" onClick={() => handleNavigate("/plans")}>
            Começar Agora
          </Button>
        </div>
      </section>
    </div>
  );
}