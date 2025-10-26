// src/app/page.tsx
"use client";
import { useRouter } from "next/navigation";
import { Zap, BotMessageSquare, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FeatureCard = ({ 
  icon, 
  title, 
  description 
}: { 
  icon: React.ReactNode, 
  title: string, 
  description: string 
}) => (
  <Card className="feature-card text-center">
    <CardHeader className="items-center pb-4">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 text-accent mb-4">
        {icon}
      </div>
      <CardTitle className="text-xl">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-text-secondary">{description}</p>
    </CardContent>
  </Card>
);

export default function RootPage() {
  const router = useRouter();
  
  const handleNavigate = (path: string) => {
    router.push(path);
  };

  return (
    <div className="min-h-screen bg-background-secondary">
      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto text-center fade-in">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 text-text-primary">
            Entrada Facilitada
          </h1>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto mb-10">
            A ferramenta definitiva para corretores. Crie fluxos de pagamento personalizados, extraia dados com IA e gere propostas em PDF em segundos.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              onClick={() => handleNavigate('/login')} 
              size="lg"
            >
              Fazer Login
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handleNavigate('/plans')}
              size="lg"
            >
              Ver Planos
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 bg-background-primary">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12 text-text-primary">Funcionalidades Poderosas</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Zap size={28} />} 
              title="Simulação Rápida e Flexível" 
              description="Calcule fluxos de pagamento lineares ou escalonados, ajuste parcelas e condições em tempo real." 
            />
            <FeatureCard 
              icon={<BotMessageSquare size={28} />} 
              title="Extração de Dados com IA" 
              description="Envie um PDF da simulação Caixa e nossa IA preenche os campos para você." 
            />
            <FeatureCard 
              icon={<FileText size={28} />} 
              title="Geração de PDF Profissional" 
              description="Crie propostas de pagamento claras e com visual profissional para enviar aos seus clientes com um clique." 
            />
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6 text-text-primary">Pronto para agilizar suas vendas?</h2>
          <p className="text-xl text-text-secondary mb-8">
            Escolha um plano que se adapte às suas necessidades e comece a usar o simulador mais completo do mercado.
          </p>
          <Button 
            onClick={() => handleNavigate('/plans')}
            size="lg"
          >
            Começar Agora
          </Button>
        </div>
      </section>
    </div>
  );
}
