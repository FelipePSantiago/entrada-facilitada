'use client';

import { signOut, TotpMultiFactorGenerator } from 'firebase/auth';
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
import { useAuth } from '@/components/client-providers'; 
import { useToast } from '@/hooks/use-toast';
import { safeLocalStorage } from '@/lib/safe-storage';

function Verify2FAPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { 
    authLoading, 
    user, 
    auth, 
    mfaResolver, 
    setMfaResolver, 
    setIs2FAVerified, 
    setIsFullyAuthenticated 
  } = useAuth();
  
  const [token, setToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // If there's no user or mfaResolver, the user shouldn't be here.
    if (!authLoading && (!user || !mfaResolver)) {
      router.replace('/login');
    }
  }, [authLoading, user, mfaResolver, router]);

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    if (!mfaResolver || !user) {
        toast({ variant: "destructive", title: "Erro de Sessão", description: "O fluxo de verificação expirou. Por favor, faça login novamente." });
        router.push("/login");
        setIsLoading(false);
        return;
    }

    try {
        // Create the multi-factor assertion.
        // Using `as any` to bypass a potential issue with outdated or incorrect type definitions
        // where the `.assertion()` static method is not found on `TotpMultiFactorGenerator`.
        const credential = (TotpMultiFactorGenerator as any).assertion(token);

        // Complete the sign-in process.
        await mfaResolver.resolveSignIn(credential);

        // On successful sign-in, onAuthStateChanged in client-providers will handle the rest.
        // But we can give immediate feedback and set state.
        toast({
            title: "Verificação bem-sucedida!",
            description: "Você será redirecionado em instantes.",
        });

        safeLocalStorage.setItem(`2fa-verified-${user.uid}`, "true");
        setIs2FAVerified(true);
        setIsFullyAuthenticated(true);

        // Cleanup resolver
        setMfaResolver(null);

        // The central router in client-providers will handle the redirect to /simulator
        // but we can also push it here to make it faster.
        router.push('/simulator');

    } catch (error: any) {
      console.error("2FA verification error:", error);
      
      let errorMessage = "O código inserido é inválido ou expirou. Tente novamente.";
      if (error.code === 'auth/invalid-verification-code') {
        errorMessage = "Código de verificação inválido. Por favor, verifique e tente novamente.";
      } else if (error.code === 'auth/session-expired') {
        errorMessage = "A sessão de verificação expirou. Por favor, faça o login novamente.";
        // Force user back to login if session is lost
        setTimeout(() => router.push("/login"), 2000);
      }

      toast({
        variant: "destructive",
        title: "Erro na Verificação",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = async () => {
    if (!auth) {
        toast({ variant: "destructive", title: "Erro", description: "Serviço de autenticação não disponível." });
        return;
    }
    try {
      await signOut(auth);
      setMfaResolver(null); // Clean up resolver onexplicit logout
      // onAuthStateChanged in providers will handle the redirect.
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao Sair",
        description: "Ocorreu um erro ao tentar voltar para a tela de login.",
      });
    }
  };

  if (authLoading || !mfaResolver) {
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
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || token.length !== 6} 
              size="lg"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verificar
            </Button>
            <Button 
              variant="outline" 
              className="w-full" 
              type="button" 
              onClick={handleBackToLogin}
              disabled={isLoading || !auth}
            >
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
