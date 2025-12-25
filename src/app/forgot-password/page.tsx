"use client";

import { sendPasswordResetEmail } from "firebase/auth";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase/clientApp";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      toast({
        title: "Link Enviado!",
        description: "Verifique sua caixa de entrada para redefinir sua senha.",
      });
      setIsSent(true);
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao Enviar",
        description: "Não foi possível encontrar uma conta com este e-mail.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md text-center mb-8">
        <h1 className="text-4xl font-bold text-foreground">Esqueceu sua senha?</h1>
        <p className="text-muted-foreground mt-2">
          {isSent
            ? "O link foi enviado para o seu e-mail."
            : "Digite seu e-mail para receber um link de redefinição."}
        </p>
      </div>
      <Card className="w-full max-w-md shadow-lg">
        {!isSent ? (
          <form onSubmit={handleResetPassword}>
            <CardContent className="grid gap-6 pt-6">
              <div className="grid gap-2 text-left">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar Link de Redefinição
              </Button>
            </CardFooter>
          </form>
        ) : (
          <CardFooter>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/login">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para o Login
              </Link>
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
