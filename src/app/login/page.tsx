// src/app/login/page.tsx
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
import { Loader2, Eye, EyeOff } from "lucide-react";
import { signInWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { auth } from "@/lib/firebase/clientApp";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { FirebaseError } from "firebase/app";

export default function LoginPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
        await auth.signOut();
        setIsLoading(false);
        return;
      }
    } catch (e) {
      const error = e as FirebaseError;
      let title = "Erro no Login";
      let description = "Ocorreu um erro inesperado. Por favor, tente novamente.";
      
      switch (error.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
          title = 'Credenciais Inválidas';
          description = 'E-mail ou senha incorretos. Verifique seus dados e tente novamente.';
          break;
        case 'auth/user-disabled':
          title = 'Conta Desativada';
          description = 'Sua conta foi desativada. Entre em contato com o suporte.';
          break;
        case 'appCheck/recaptcha-error':
          title = 'Erro de Verificação';
          description = 'Não foi possível verificar seu dispositivo. Recarregue a página.';
          break;
        default:
          console.error('Erro de login não tratado:', error);
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-accent" />
          <p className="text-text-secondary">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-secondary px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Login</CardTitle>
          <CardDescription>
            Entre com suas credenciais para acessar o simulador.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="text-right">
              <Link 
                href="/forgot-password" 
                className="text-sm text-accent hover:underline"
              >
                Esqueceu a senha?
              </Link>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
              size="lg"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
            <Separator />
            <div className="text-center text-sm">
              <span className="text-text-secondary">Não tem uma conta?</span>{" "}
              <Link 
                href="/plans" 
                className="text-accent hover:underline font-medium"
              >
                VER PLANOS
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
