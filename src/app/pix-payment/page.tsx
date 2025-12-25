"use client";

import { Loader2, Copy } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

function PixPaymentPageContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const plan = searchParams.get("plan") || "Selecionado";

  const pixKey = "00020126360014br.gov.bcb.pix0114+5561986213417520400005303986540530.005802BR5924Matheus Feitosa de Sous6009SAO PAULO61080000000062070503***6304E0B4";

  const whatsappNumber = "5561986213417"; // Seu número de WhatsApp com código do país
  const message = `Olá! Gostaria de confirmar meu pagamento para o plano ${plan}. Segue o comprovante.`;
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
    message
  )}`;

  const handleCopyPixKey = () => {
    navigator.clipboard.writeText(pixKey).then(() => {
      toast({
        title: "Chave PIX Copiada!",
        description: "A chave PIX foi copiada para sua área de transferência.",
      });
    });
  };

  return (
    <div className="w-full max-w-2xl p-4 md:p-8">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-foreground">Pagamento via PIX</h1>
        <p className="text-lg text-muted-foreground mt-2">
          Plano <span className="font-bold text-primary">{plan}</span>. Escaneie o QR Code ou copie a chave para pagar.
        </p>
      </div>
      <Card className="w-full shadow-lg">
        <CardContent className="flex flex-col items-center gap-8 pt-8">
          <Image
            src="https://i.ibb.co/jKLk4D1/1754070627026.png"
            alt="QR Code PIX"
            width={280}
            height={280}
            className="rounded-lg border-4 border-background shadow-md"
          />
          <div className="w-full max-w-sm text-center">
            <p className="text-muted-foreground mb-4">
              Copie a chave PIX para efetuar o pagamento:
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={pixKey}
                className="w-full bg-muted text-muted-foreground p-2 rounded-md border text-xs"
              />
              <Button variant="outline" size="icon" onClick={handleCopyPixKey}>
                <Copy className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <p className="text-sm text-center text-muted-foreground max-w-md">
            Após o pagamento, envie o comprovante para o WhatsApp (61)
            98621-3417. A liberação do seu acesso será feita em até 24h úteis após a confirmação.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-4 pt-6">
          <Button asChild className="w-full">
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              Enviar Comprovante via WhatsApp
            </a>
          </Button>
          <Button variant="ghost" asChild className="w-full">
            <Link href="/login">Ir para Login</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function PixPaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      }
    >
      <PixPaymentPageContent />
    </Suspense>
  );
}
