"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, KeyRound } from "lucide-react";
import QRCode from "qrcode";
import { useAuth } from "@/contexts/AuthContext";
import { httpsCallable } from "firebase/functions";

function Setup2FAPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, authLoading, has2FA, setIsFullyAuthenticated, functions } = useAuth();
  
  const [secretUri, setSecretUri] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [token, setToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user && !authLoading && has2FA === false && functions) {
      const generateSecret = async () => {
        setIsLoading(true);
        try {
          const generateTwoFactorSecret = httpsCallable(functions, 'generateTwoFactorSecretAction');
          const result = await generateTwoFactorSecret();
          const otpauthUrl = result.data as string;

          if (!otpauthUrl) {
              throw new Error("Não foi possível obter a URI de autenticação. Tente recarregar a página.");
          }
          setSecretUri(otpauthUrl);
          const qr = await QRCode.toDataURL(otpauthUrl);
          setQrCode(qr);
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error("Erro desconhecido");
          console.error("Error generating 2FA secret for setup:", err);
          toast({ variant: "destructive", title: "Erro ao Gerar Segredo 2FA", description: err.message || "Por favor, recarregue a página." });
        } finally {
          setIsLoading(false);
        }
      };
      generateSecret();
    }
  }, [user, authLoading, has2FA, toast, functions]);

  const handleVerifyAndSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !secretUri || !functions) {
      toast({ variant: "destructive", title: "Erro", description: "Usuário ou segredo 2FA não encontrado." });
      return;
    }
    setIsVerifying(true);

    try {
        const verifyAndEnableTwoFactor = httpsCallable(functions, 'verifyAndEnableTwoFactorAction');
        const result = await verifyAndEnableTwoFactor({ secretUri, token });
        const isEnabled = result.data as boolean;

        if (isEnabled) {
            toast({
              title: "Configuração 2FA Concluída!",
              description: "Você será redirecionado para a página principal.",
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
        setIsVerifying(false);
    }
  };
  
  if (authLoading || (user && has2FA === undefined)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Verificando configuração de segurança...</p>
      </div>
    );
  }

  if (isLoading && has2FA === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Gerando configuração de segurança...</p>
      </div>
    );
  }


  if (!qrCode && !isLoading && has2FA === false) {
     return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] text-center">
        <p className="text-destructive">Não foi possível gerar a configuração. Por favor, recarregue a página.</p>
      </div>
    );
  }

  if (has2FA === false && !isLoading) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-primary" />
          <CardTitle className="text-2xl mt-4">Configuração de Segurança Obrigatória</CardTitle>
          <CardDescription>
              Para proteger sua conta, é necessário configurar a autenticação de dois fatores (2FA).
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleVerifyAndSave}>
          <CardContent className="space-y-6">
              <div className="space-y-2 text-sm text-left p-4 bg-secondary/50 rounded-lg">
                  <p className="font-semibold">O que fazer:</p>
                  <ol className="list-decimal list-inside space-y-1">
                      <li>Instale um aplicativo autenticador (ex: Google Authenticator, Authy).</li>
                      <li>No aplicativo, escaneie o QR Code abaixo.</li>
                      <li>Digite o código de 6 dígitos gerado pelo aplicativo para verificar.</li>
                  </ol>
              </div>

              <div className="flex flex-col items-center gap-4">
                  {qrCode ? (
                      <Image
                          src={qrCode}
                          alt="QR Code para 2FA"
                          width={200}
                          height={200}
                          className="rounded-lg border shadow-md"
                      />
                  ) : (
                      <div className="h-[200px] w-[200px] flex items-center justify-center">
                          <Loader2 className="h-8 w-8 animate-spin" />
                      </div>
                  )}
              </div>
              
              <div className="grid gap-2">
                  <Label htmlFor="token">Código de Verificação</Label>
                  <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                      id="token"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className="pl-10 text-center tracking-[0.5em]"
                      placeholder="_ _ _ _ _ _"
                      />
                  </div>
              </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isVerifying || token.length !== 6}>
              {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verificar e Salvar
              </Button>
          </CardFooter>
        </form>
      </Card>
    );
  }

  // Fallback for any other state (prevents blank screen)
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Aguardando...</p>
    </div>
  );
}

export default function Setup2FAPage() {
    return (
        <Suspense fallback={<div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}>
            <Setup2FAPageContent />
        </Suspense>
    );
}