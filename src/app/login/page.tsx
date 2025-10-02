
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { signInWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { auth } from "@/lib/firebase/clientApp";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { authLoading, user, isFullyAuthenticated } = useAuth();

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      if (!userCredential.user.emailVerified) {
        await sendEmailVerification(userCredential.user);
        toast({
          title: "Verificação de E-mail Necessária",
          description: "Enviamos um novo link de verificação para o seu e-mail. Por favor, verifique sua caixa de entrada antes de fazer login.",
        });
        await auth.signOut(); // Força o logout para que o usuário verifique o e-mail
        setIsLoading(false);
        return;
      }
      // O redirecionamento é tratado pelo AuthContext/Providers
    } catch {
        toast({
            variant: "destructive",
            title: "Erro no Login",
            description: "Credenciais inválidas. Verifique seu e-mail e senha.",
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
    <div className="flex items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription>
            Entre com suas credenciais para acessar o simulador.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
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
            <div className="grid gap-2">
              <Label htmlFor="password">Senha</Label>
              <Input 
                id="password" 
                type="password" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                />
               <div className="text-right text-sm">
                  <Link href="/forgot-password" className="underline">
                    Esqueceu a senha?
                  </Link>
                </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
            <Separator className="my-2"/>
             <div className="w-full text-center">
                <p className="text-sm text-muted-foreground mb-2">Não tem uma conta?</p>
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

    



    