"use client";

import { useState, Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { httpsCallable } from "firebase/functions";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/clientApp";

function Verify2FAPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, authLoading, setIsFullyAuthenticated, isFullyAuthenticated, functions } = useAuth();
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
        toast({ variant: "destructive", title: "Erro", description: "Usuário não encontrado." });
        return;
    }
    setIsLoading(true);

    try {
        const verifyToken = httpsCallable(functions, 'verifyTokenAction');
        const result = await verifyToken({ token });
        const isValid = result.data as boolean;

        if (isValid) {
            toast({
                title: "Verificação bem-sucedida!",
                description: "Você está autenticado.",
            });
            localStorage.setItem(`2fa-verified-${user.uid}`, 'true');
            setIsFullyAuthenticated(true);
            router.push('/simulator');
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
    } catch {
       toast({
        variant: "destructive",
        title: "Erro ao Sair",
        description: "Ocorreu um erro ao tentar voltar para a tela de login.",
      });
    }
  };

  if (authLoading || (user && isFullyAuthenticated)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Redirecionando...</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Verificação 2FA</CardTitle>
          <CardDescription>
            Digite o código do seu aplicativo de autenticação para continuar.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleVerify}>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="token">Código de 6 dígitos</Label>
              <Input
                id="token"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
             <div className="text-center text-sm">
                <p className="text-muted-foreground">Problemas com o código? Fale com o suporte.</p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading || token.length !== 6}>
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


const DynamicVerify2FAPageContent = dynamic(() => Promise.resolve(Verify2FAPageContent), {
    loading: () => <div className="w-full max-w-sm"><Card><CardHeader><Loader2 className="h-8 w-8 animate-spin"/></CardHeader></Card></div>,
    ssr: false
});


export default function Verify2FAPage() {
    return (
        <Suspense fallback={
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        }>
            <DynamicVerify2FAPageContent />
        </Suspense>
    );
}
