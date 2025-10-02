
"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
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
import { Loader2 } from "lucide-react";

function PixPaymentPageContent() {
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan") || "Selecionado";
  
  const whatsappNumber = "5561986213417"; // Seu número de WhatsApp com código do país
  const message = `Olá! Gostaria de confirmar meu pagamento para o plano ${plan}. Segue o comprovante.`;
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;


  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl">Pagamento via PIX</CardTitle>
        <CardDescription>
          Plano {plan}. Escaneie o QR Code abaixo para pagar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6">
        <Image
          src="https://i.ibb.co/jKLk4D1/1754070627026.png"
          alt="QR Code PIX"
          width={300}
          height={300}
          className="rounded-lg border shadow-md"
        />
        <p className="text-sm text-center text-muted-foreground max-w-sm">
          Após o pagamento, envie o comprovante para o WhatsApp (61) 98621-3417. A liberação do seu acesso será feita após a confirmação.
        </p>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-4">
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
  );
}

export default function PixPaymentPage() {
    return (
        <Suspense fallback={
            <div className="flex flex-col items-center justify-center min-h-screen">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="mt-4 text-muted-foreground">Carregando...</p>
            </div>
        }>
            <PixPaymentPageContent />
        </Suspense>
    )
}
