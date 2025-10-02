

"use client";

import { useRouter } from "next/navigation";
import { Zap, BotMessageSquare, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
    <Card className="text-center shadow-md hover:shadow-lg transition-shadow">
        <CardHeader className="items-center">
            <div className="p-4 bg-primary/10 rounded-full mb-2">
                {icon}
            </div>
            <CardTitle>{title}</CardTitle>
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
        <div className="w-full">
            {/* Hero Section */}
            <section className="text-center py-20 bg-background">
                <div className="container mx-auto px-4">
                    <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">
                        Entrada Facilitada
                    </h1>
                    <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
                        A ferramenta definitiva para corretores. Crie fluxos de pagamento personalizados, extraia dados com IA e gere propostas em PDF em segundos.
                    </p>
                    <div className="flex justify-center gap-4">
                        <Button size="lg" onClick={() => handleNavigate('/login')}>
                            Fazer Login
                        </Button>
                        <Button size="lg" variant="outline" onClick={() => handleNavigate('/plans')}>
                            Ver Planos
                        </Button>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="py-20 bg-secondary/50">
                <div className="container mx-auto px-4">
                    <h2 className="text-3xl font-bold text-center mb-12">Funcionalidades Poderosas</h2>
                    <div className="grid md:grid-cols-3 gap-8">
                       <FeatureCard 
                           icon={<Zap className="h-8 w-8 text-primary" />}
                           title="Simulação Rápida e Flexível"
                           description="Calcule fluxos de pagamento lineares ou escalonados, ajuste parcelas e condições em tempo real."
                       />
                        <FeatureCard 
                           icon={<BotMessageSquare className="h-8 w-8 text-primary" />}
                           title="Extração de Dados com IA"
                           description="Envie um PDF ou cole um print da simulação da Caixa e nossa IA preenche os campos para você."
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
             <section className="py-20 bg-background">
                <div className="container mx-auto px-4 text-center">
                    <h2 className="text-3xl font-bold mb-4">Pronto para agilizar suas vendas?</h2>
                    <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                        Escolha um plano que se adapte às suas necessidades e comece a usar o simulador mais completo do mercado.
                    </p>
                    <Button size="lg" onClick={() => handleNavigate('/plans')}>
                        Começar Agora
                    </Button>
                </div>
            </section>
        </div>
    );
}
