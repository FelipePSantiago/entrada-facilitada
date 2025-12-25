"use client";

import { FirebaseError } from "firebase/app";
import {
  sendEmailVerification,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { Loader2 } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase/clientApp";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState("");
  const { authLoading, isFullyAuthenticated, user } = useAuth();
  const { toast } = useToast();

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      if (!userCredential.user.emailVerified) {
        await sendEmailVerification(userCredential.user);
        toast({
          title: "Verificação de E-mail Necessária",
          description:
            "Enviamos um novo link de verificação para o seu e-mail. Por favor, verifique sua caixa de entrada antes de fazer login.",
        });
        await auth.signOut(); // Força o logout para que o usuário verifique o e-mail
        setIsLoading(false);
        return;
      }
      // O redirecionamento é tratado pelo AuthContext/Providers
    } catch (e) {
      const error = e as FirebaseError;
      let title = "Erro no Login";
      let description =
        "Ocorreu um erro inesperado. Por favor, tente novamente.";

      switch (error.code) {
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
          title = "Credenciais Inválidas";
          description =
            "E-mail ou senha incorretos. Verifique seus dados e tente novamente.";
          break;
        case "auth/user-disabled":
          title = "Conta Desativada";
          description =
            "Sua conta foi desativada. Entre em contato com o suporte para mais informações.";
          break;
        case "appCheck/recaptcha-error":
          title = "Erro de Verificação";
          description =
            "Não foi possível verificar seu dispositivo. Recarregue a página e tente novamente.";
          break;
        default:
          console.error("Erro de login não tratado:", error);
          break;
      }

      toast({
        variant: "destructive",
        title: title,
        description: description,
      });
      setIsLoading(false);
    }
  };

  if (authLoading || (user && !isFullyAuthenticated)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Verificando autenticação...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md text-center mb-8">
        <h1 className="text-4xl font-bold text-foreground">Bem-vindo de Volta</h1>
        <p className="text-muted-foreground mt-2">
          Entre com suas credenciais para acessar o simulador.
        </p>
      </div>
      <Card className="w-full max-w-md shadow-lg">
        <form onSubmit={handleLogin}>
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
            <div className="grid gap-2 text-left">
              <div className="flex justify-between items-center">
                <Label htmlFor="password">Senha</Label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-muted-foreground hover:underline"
                >
                  Esqueceu a senha?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
            <Separator className="my-2" />
            <div className="w-full text-center">
              <p className="text-sm text-muted-foreground mb-2">
                Não tem uma conta?
              </p>
              <Button variant="outline" className="w-full" asChild>
                <Link href="/plans">VER PLANOS</Link>
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
