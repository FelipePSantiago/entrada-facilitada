"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CaixaSimulation() {
  return (
    <div className="w-full max-w-4xl p-4 sm:p-8">
        <Card>
            <CardHeader>
                <CardTitle>Simulação Caixa</CardTitle>
                <CardDescription>
                    Esta funcionalidade de integração estará disponível em breve.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground rounded-lg p-8 border-2 border-dashed">
                    <Loader2 className="h-10 w-10 animate-spin text-primary/30" />
                    <h3 className="font-semibold">Em desenvolvimento...</h3>
                </div>
            </CardContent>
            <CardFooter>
                 <Button variant="outline" asChild>
                    <Link href="/simulator">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar para a Calculadora
                    </Link>
                </Button>
            </CardFooter>
        </Card>
    </div>
  );
}
