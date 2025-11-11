"use client";

import { httpsCallable } from "firebase/functions";
import { KeyRound, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Suspense, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useAppCheck } from "@/components/providers";
import { safeLocalStorage } from "@/lib/safe-storage";
import { retryFirebaseFunction } from "@/lib/retry-logic";

function Setup2FAPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { authLoading, functions, has2FA, setIsFullyAuthenticated, user } = useAuth();
  const { isAppCheckAvailable, appCheckError } = useAppCheck();

  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [secretUri, setSecretUri] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);
  
  useEffect(() => {
    if (!authLoading && has2FA) {
      router.replace("/simulator");
    }
  }, [authLoading, has2FA, router]);

  useEffect(() => {
    if (user && !authLoading && has2FA === false && functions) {
      const generateSecret = async () => {
        setIsLoading(true);
        try {
          const generateTwoFactorSecret = httpsCallable(
            functions,
            "generateTwoFactorSecretAction"
          );

          // Usar retry logic para a chamada da função
          const result = await retryFirebaseFunction(
            () => generateTwoFactorSecret(),
            "generateTwoFactorSecretAction",
            {
              maxRetries: 3,
              initialDelay: 1000,
              onRetry: (attempt, error) => {
                setRetryCount(attempt);
                console.warn(`Retrying 2FA secret generation (attempt ${attempt}):`, error);
                toast({
                  variant: "default",
                  title: "Tentando novamente...",
                  description: `Tentativa ${attempt} de gerar configuração de segurança.`,
                });
              },
            }
          );

          const otpauthUrl = result.data as string;

          if (!otpauthUrl) {
            throw new Error(
              "Não foi possível obter a URI de autenticação. Tente recarregar a página."
            );
          }
          setSecretUri(otpauthUrl);
          const qr = await QRCode.toDataURL(otpauthUrl);
          setQrCode(qr);

          // Reset retry count on success
          setRetryCount(0);

        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error("Erro desconhecido");
          console.error("Error generating 2FA secret for setup:", err);
          
          // Mostrar erro específico baseado no tipo de problema
          let errorMessage = err.message || "Por favor, recarregue a página.";
          let errorTitle = "Erro ao Gerar Segredo 2FA";

          if (err.message?.includes('403') || err.message?.includes('throttled')) {
            errorTitle = "Serviço Temporariamente Indisponível";
            errorMessage = "O serviço está temporariamente limitado. Tente novamente em alguns minutos.";
          } else if (err.message?.includes('network') || err.message?.includes('fetch')) {
            errorTitle = "Erro de Conexão";
            errorMessage = "Verifique sua conexão com a internet e tente novamente.";
          } else if (!isAppCheckAvailable) {
            errorTitle = "Problema de Segurança";
            errorMessage = "Não foi possível verificar a segurança da conexão. Recarregue a página.";
          }

          toast({
            variant: "destructive",
            title: errorTitle,
            description: errorMessage,
          });
        } finally {
          setIsLoading(false);
        }
      };
      generateSecret();
    }
  }, [user, authLoading, has2FA, toast, functions, isAppCheckAvailable]);

  const handleVerifyAndSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !secretUri || !functions) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Usuário ou segredo 2FA não encontrado.",
      });
      return;
    }
    setIsVerifying(true);

    try {
      const verifyAndEnableTwoFactor = httpsCallable(
        functions,
        "verifyAndEnableTwoFactorAction"
      );

      // Usar retry logic para a verificação
      const result = await retryFirebaseFunction(
        () => verifyAndEnableTwoFactor({ secretUri, token }),
        "verifyAndEnableTwoFactorAction",
        {
          maxRetries: 2,
          initialDelay: 500,
          onRetry: (attempt, error) => {
            console.warn(`Retrying 2FA verification (attempt ${attempt}):`, error);
          },
        }
      );

      const isEnabled = result.data as boolean;

      if (isEnabled) {
        toast({
          title: "Configuração 2FA Concluída!",
          description: "Você será redirecionado para a página principal.",
        });

        // Usar safe storage em vez de localStorage diretamente
        safeLocalStorage.setItem(`2fa-verified-${user.uid}`, "true");
        setIsFullyAuthenticated(true);
        router.push("/simulator");
      } else {
        throw new Error("Código inválido. Tente novamente.");
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error("2FA verification error:", err);
      
      let errorMessage = err.message || "Não foi possível verificar o código.";
      let errorTitle = "Erro na Verificação";

      if (err.message?.includes('403') || err.message?.includes('throttled')) {
        errorTitle = "Serviço Temporariamente Indisponível";
        errorMessage = "Tente novamente em alguns minutos.";
      } else if (err.message?.includes('network')) {
        errorTitle = "Erro de Conexão";
        errorMessage = "Verifique sua conexão e tente novamente.";
      }

      toast({
        variant: "destructive",
        title: errorTitle,
        description: errorMessage,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const renderLoading = (message: string) => (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="mt-4 text-muted-foreground">{message}</p>
    </div>
  );

  const renderAppCheckWarning = () => {
    if (!isAppCheckAvailable && appCheckError) {
      return (
        <Card className="w-full max-w-lg mb-6 border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <h4 className="font-semibold text-amber-800">Aviso de Segurança</h4>
                <p className="text-amber-700 mt-1">
                  {appCheckError.includes('production') 
                    ? "A verificação de segurança não está configurada. Algumas funcionalidades podem estar limitadas."
                    : "Modo de desenvolvimento detectado. Usando configurações de teste."
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }
    return null;
  };

  if (authLoading || (user && has2FA === undefined)) {
    return renderLoading("Verificando configuração de segurança...");
  }

  if (isLoading && has2FA === false) {
    return renderLoading("Gerando configuração de segurança...");
  }

  if (!qrCode && !isLoading && has2FA === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] text-center px-4">
        <AlertTriangle className="h-16 w-16 text-amber-500 mb-4" />
        <h2 className="text-2xl font-semibold text-foreground mb-2">
          Não foi possível gerar a configuração
        </h2>
        <p className="text-muted-foreground mb-4">
          Verifique sua conexão e tente recarregar a página.
        </p>
        {retryCount > 0 && (
          <p className="text-sm text-muted-foreground">
            Tentativas realizadas: {retryCount}
          </p>
        )}
        <Button 
          onClick={() => window.location.reload()} 
          variant="outline"
          className="mt-4"
        >
          Recarregar Página
        </Button>
      </div>
    );
  }

  if (has2FA === false && !isLoading) {
    return (
      <div className="w-full max-w-lg p-4 md:p-8">
        {renderAppCheckWarning()}
        
        <div className="text-center mb-10">
          <ShieldCheck className="mx-auto h-16 w-16 text-primary mb-4" />
          <h1 className="text-4xl font-bold text-foreground">
            Configure a Verificação em Duas Etapas
          </h1>
          <p className="text-lg text-muted-foreground mt-2">
            Proteja sua conta com uma camada extra de segurança.
          </p>
        </div>
        
        <Card className="w-full shadow-lg">
          <form onSubmit={handleVerifyAndSave}>
            <CardContent className="space-y-8 pt-8">
              <div className="space-y-4 text-left p-6 bg-secondary/30 rounded-lg border">
                <h3 className="font-semibold text-lg">Como configurar:</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>
                    Instale um aplicativo autenticador (ex: Google Authenticator,
                    Authy).
                  </li>
                  <li>No aplicativo, escaneie o QR Code abaixo.</li>
                  <li>
                    Digite o código de 6 dígitos gerado pelo aplicativo para
                    verificar.
                  </li>
                </ol>
              </div>

              <div className="flex flex-col items-center gap-6">
                {qrCode ? (
                  <Image
                    src={qrCode}
                    alt="QR Code para 2FA"
                    width={220}
                    height={220}
                    className="rounded-lg border-4 p-1 border-background shadow-md"
                  />
                ) : (
                  <div className="h-[220px] w-[220px] flex items-center justify-center bg-muted rounded-lg">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  </div>
                )}
              </div>

              <div className="grid gap-2 max-w-sm mx-auto">
                <Label htmlFor="token" className="text-left font-semibold">
                  Código de Verificação
                </Label>
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
            <CardFooter className="pt-6">
              <Button
                type="submit"
                className="w-full max-w-sm mx-auto"
                disabled={isVerifying || token.length !== 6}
                size="lg"
              >
                {isVerifying && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Verificar e Ativar
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return renderLoading("Redirecionando para a página principal...");
}

export default function Setup2FAPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      }
    >
      <Setup2FAPageContent />
    </Suspense>
  );
}