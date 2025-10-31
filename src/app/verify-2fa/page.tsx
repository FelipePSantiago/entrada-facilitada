'use client';

import { signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { ArrowLeft, KeyRound, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase/clientApp';

function Verify2FAPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { authLoading, functions, setIs2FAVerified, user } = useAuth(); // Removido isFullyAuthenticated e setIsFullyAuthenticated
  const [token, setToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !functions) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Usuário não encontrado.",
      });
      return;
    }
    setIsLoading(true);

    try {
      const verifyToken = httpsCallable(functions, "verifyTokenAction");
      const result = await verifyToken({ token });
      const isValid = result.data as boolean;

      if (isValid) {
        toast({
          title: "Verificação bem-sucedida!",
          description: "Você será redirecionado em instantes.",
        });
        localStorage.setItem(`2fa-verified-${user.uid}`, "true");
        setIs2FAVerified(true); // AQUI ESTÁ A MUDANÇA PRINCIPAL
      } else {
        throw new Error("Código inválido. Tente novamente.");
      }
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        variant: "destructive",
        title: "Erro na Verificação",
        description: err.message || "Não foi possível verificar o código.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = async () => {
    try {
      await signOut(auth);
      // O gatilho `onAuthStateChanged` no `AuthContext` irá lidar com o redirecionamento para /login
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao Sair",
        description: "Ocorreu um erro ao tentar voltar para a tela de login.",
      });
    }
  };

  if (authLoading) { // Simplificado
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md text-center mb-8">
        <h1 className="text-4xl font-bold text-foreground">Verificação de Segurança</h1>
        <p className="text-muted-foreground mt-2">
          Digite o código do seu aplicativo de autenticação para continuar.
        </p>
      </div>
      <Card className="w-full max-w-md shadow-lg">
        <form onSubmit={handleVerify}>
          <CardContent className="grid gap-6 pt-6">
            <div className="grid gap-2 text-left">
               <Label htmlFor="token">Código de 6 dígitos</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="token"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="pl-12 text-center tracking-[0.5em] h-12 text-lg"
                    placeholder="_ _ _ _ _ _"
                  />
                </div>
            </div>
             <div className="text-center text-sm">
                <p className="text-muted-foreground">Problemas com o código? Fale com o suporte.</p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading || token.length !== 6} size="lg">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verificar
            </Button>
            <Button variant="outline" className="w-full" type="button" onClick={handleBackToLogin}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para o Login
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function Verify2FAPage() {
    return (
        <Suspense fallback={
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                 <p className="mt-4 text-muted-foreground">Carregando...</p>
            </div>
        }>
            <Verify2FAPageContent />
        </Suspense>
    );
}
