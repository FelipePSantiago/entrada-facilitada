"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 flex items-center justify-center min-h-[calc(100vh-15rem)]">
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
            <div className="mx-auto bg-destructive/10 p-3 rounded-full w-fit">
                <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="mt-4">Ocorreu um Erro no Simulador</CardTitle>
            <CardDescription>
                Não foi possível carregar a calculadora. Por favor, tente recarregar a página.
            </CardDescription>
        </CardHeader>
         <CardContent>
          <p className="text-sm text-muted-foreground">
             Detalhes do erro: {error.message || "Erro desconhecido."}
          </p>
        </CardContent>
        <CardContent>
          <Button onClick={() => reset()}>Tentar Novamente</Button>
        </CardContent>
      </Card>
    </div>
  );
}
