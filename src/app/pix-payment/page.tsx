// src/app/pix-payment/page.tsx
"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import Link from "next/link";
import { Loader2, QrCode, MessageCircle, ArrowLeft, CheckCircle } from "lucide-react";

function PixPaymentPageContent() {
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan") || "Selecionado";
  const whatsappNumber = "5561986213417";
  const message = `Olá! Gostaria de confirmar meu pagamento para o plano ${plan}. Segue o comprovante.`;
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

  return (
    <div className="min-h-screen bg-background-secondary py-8 px-4 flex items-center justify-center">
      <div className="max-w-md w-full">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={() => window.history.back()} 
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>

        <Card className="shadow-lg overflow-hidden">
          <CardHeader className="bg-accent text-accent-foreground">
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Pagamento via PIX
            </CardTitle>
            <CardDescription className="text-accent-foreground/80">
              Plano {plan}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="pt-6">
            <div className="text-center mb-6">
              <p className="text-text-secondary mb-4">
                Escaneie o QR Code abaixo para pagar.
              </p>
              
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-white rounded-lg shadow-md">
                  <div className="w-48 h-48 bg-gray-200 rounded-lg flex items-center justify-center">
                    <QrCode className="h-24 w-24 text-gray-400" />
                  </div>
                </div>
              </div>
              
              <div className="bg-accent/10 p-4 rounded-lg mb-6">
                <h3 className="font-semibold mb-2 flex items-center gap-2 text-accent">
                  <CheckCircle className="h-4 w-4" />
                  Próximos Passos:
                </h3>
                <ol className="text-sm text-left space-y-1 text-text-secondary">
                  <li>1. Escaneie o QR Code com seu aplicativo de pagamento</li>
                  <li>2. Confirme o pagamento</li>
                  <li>3. Envie o comprovante para o WhatsApp</li>
                  <li>4. Aguarde a liberação do seu acesso</li>
                </ol>
              </div>
              
              <p className="text-sm text-text-secondary">
                Após o pagamento, envie o comprovante para o WhatsApp (61) 98621-3417. 
                A liberação do seu acesso será feita após a confirmação.
              </p>
            </div>
          </CardContent>
          
          <CardFooter className="flex flex-col gap-3">
            <Button 
              asChild
              className="w-full bg-green-500 hover:bg-green-600 text-white"
              size="lg"
            >
              <a 
                href={whatsappUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2"
              >
                <MessageCircle className="h-4 w-4" />
                Enviar Comprovante via WhatsApp
              </a>
            </Button>
            
            <div className="flex gap-2 w-full">
              <Button 
                variant="outline" 
                asChild
                className="flex-1"
              >
                <Link href="/signup">
                  Ir para o Cadastro
                </Link>
              </Button>
              
              <Button 
                variant="outline" 
                asChild
                className="flex-1"
              >
                <Link href="/login">
                  Ir para o Login
                </Link>
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

export default function PixPaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background-secondary">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-accent" />
          <p className="text-text-secondary">Carregando...</p>
        </div>
      </div>
    }>
      <PixPaymentPageContent />
    </Suspense>
  );
}
