'use client';

import { signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { ArrowLeft, KeyRound, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import QRCode from 'qrcode';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, useAppCheck } from '@/components/client-providers';
import { useToast } from '@/hooks/use-toast';
import { safeLocalStorage } from '@/lib/safe-storage';
import { retryFirebaseFunction } from '@/lib/retry-logic';

function Verify2FAPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { authLoading, functions, setIs2FAVerified, setIsFullyAuthenticated, user, auth } = useAuth();
  const { isAppCheckAvailable, appCheckError } = useAppCheck();
  
  const [token, setToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  // 🔒 NOVA LÓGICA: Verificar status do 2FA e gerar QR code se necessário
  useEffect(() => {
    if (!authLoading && user && functions) {
      const checkTwoFactorStatus = async () => {
        try {
          const getTwoFactorSecret = httpsCallable(functions, "getTwoFactorSecretAction");
          const result = await retryFirebaseFunction(() => getTwoFactorSecret(), "getTwoFactorSecretAction");
          
          const secretUri = result.data as string;
          
          if (!secretUri) {
            // Usuário não tem 2FA configurado, gerar novo segredo
            console.log("Usuário sem 2FA configurado, gerando segredo...");
            const generateTwoFactorSecret = httpsCallable(functions, "generateTwoFactorSecretAction");
            const generateResult = await retryFirebaseFunction(() => generateTwoFactorSecret(), "generateTwoFactorSecretAction");
            
            const newSecretUri = generateResult.data as string;
            if (newSecretUri) {
              // Extrair o secret da URI para usar na verificação
              const url = new URL(newSecretUri);
              const secret = url.searchParams.get('secret');
              
              if (secret) {
                setSetupSecret(secret);
                setQrCode(await QRCode.toDataURL(newSecretUri));
                setNeedsSetup(true);
              }
            }
          } else {
            // Usuário já tem 2FA configurado
            console.log("Usuário já tem 2FA configurado");
            setNeedsSetup(false);
          }
        } catch (error) {
          console.error("Erro ao verificar status do 2FA:", error);
          toast({
            variant: "destructive",
            title: "Erro",
            description: "Não foi possível verificar o status da autenticação 2FA.",
          });
        }
      };

      checkTwoFactorStatus();
    }
  }, [authLoading, user, functions, toast]);

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !functions) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Usuário não autenticado ou funções indisponíveis.",
      });
      return;
    }
    setIsLoading(true);

    try {
      // 🔒 NOVA LÓGICA: Usar função universal de verificação
      const verifyOrSetupTwoFactor = httpsCallable(functions, "verifyOrSetupTwoFactorAction");
      const result = await retryFirebaseFunction(() => 
        verifyOrSetupTwoFactor({ 
          token,
          setupSecret: needsSetup ? setupSecret : undefined 
        }), 
        "verifyOrSetupTwoFactorAction"
      );

      const response = result.data as { success: boolean, needsSetup: boolean, message?: string };

      if (response.success) {
        let successMessage = "Verificação bem-sucedida!";
        if (response.message?.includes("configurado com sucesso")) {
          successMessage = "Autenticação 2FA configurada e verificada com sucesso!";
        }
        
        toast({
          title: successMessage,
          description: "Você será redirecionado em instantes.",
        });
        
        // 🔒 MELHORIA: Garantir que o estado seja atualizado imediatamente
        safeLocalStorage.setItem(`2fa-verified-${user.uid}`, "true");
        safeLocalStorage.setItem(`2fa-timestamp-${user.uid}`, Date.now().toString());
        setIs2FAVerified(true);
        setRetryCount(0);
        
        // 🔒 MELHORIA: Forçar atualização do estado de autenticação completa
        setTimeout(() => {
          setIsFullyAuthenticated(true);
          setTimeout(() => {
            router.push('/simulator');
          }, 500);
        }, 500);
      } else {
        if (response.needsSetup) {
          toast({
            variant: "destructive",
            title: "Configuração Necessária",
            description: response.message || "É necessário configurar a autenticação 2FA.",
          });
        } else {
          throw new Error(response.message || "Código inválido. Tente novamente.");
        }
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error("2FA verification error:", err);
      console.error("Error details:", {
        message: err.message,
        name: err.name,
        stack: err.stack,
        error: error
      });
      
      let errorMessage = err.message || "Não foi possível verificar o código.";
      let errorTitle = "Erro na Verificação";

      // Try to extract more specific error information
      if (err.message.includes('internal')) {
        errorMessage = "Erro interno do servidor. Tente novamente em alguns instantes.";
      } else if (err.message.includes('permission-denied')) {
        errorMessage = "Permissão negada. Verifique suas credenciais.";
      } else if (err.message.includes('unauthenticated')) {
        errorMessage = "Usuário não autenticado. Faça login novamente.";
      } else if (err.message.includes('not-found')) {
        errorMessage = "Configuração 2FA não encontrada. Configure o 2FA primeiro.";
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

  const handleBackToLogin = async () => {
    if (!auth) {
        toast({
            variant: "destructive",
            title: "Erro",
            description: "Serviço de autenticação não disponível.",
        });
        return;
    }
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

  const renderAppCheckWarning = () => {
    if (!isAppCheckAvailable && appCheckError) {
      return (
        <Card className="w-full max-w-md mb-6 border-amber-200 bg-amber-50">
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

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-4">
      {renderAppCheckWarning()}
      
      <div className="w-full max-w-md text-center mb-8">
        <h1 className="text-4xl font-bold text-foreground">
          {needsSetup ? "Configure a Verificação em Duas Etapas" : "Verificação de Segurança"}
        </h1>
        <p className="text-muted-foreground mt-2">
          {needsSetup 
            ? "Proteja sua conta com uma camada extra de segurança. Escaneie o QR Code e digite o código."
            : "Digite o código do seu aplicativo de autenticação para continuar."
          }
        </p>
      </div>
      
      <Card className="w-full max-w-md shadow-lg">
        <form onSubmit={handleVerify}>
          <CardContent className="grid gap-6 pt-6">
            {needsSetup && qrCode && (
              <div className="flex flex-col items-center gap-4">
                <div className="text-center">
                  <ShieldCheck className="mx-auto h-12 w-12 text-primary mb-2" />
                  <h3 className="font-semibold">Escaneie este QR Code</h3>
                  <p className="text-sm text-muted-foreground">
                    Use seu aplicativo autenticador (Google Authenticator, Authy, etc.)
                  </p>
                </div>
                <img 
                  src={qrCode} 
                  alt="QR Code para 2FA" 
                  className="w-48 h-48 rounded-lg border-2 p-2 border-background shadow-md"
                />
              </div>
            )}
            
            <div className="grid gap-2 text-left">
               <Label htmlFor="token">
                {needsSetup ? "Código de 6 dígitos do aplicativo" : "Código de 6 dígitos"}
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
             <div className="text-center text-sm">
                <p className="text-muted-foreground">
                  {needsSetup 
                    ? "Após escanear o QR Code, digite o código gerado."
                    : "Problemas com o código? Fale com o suporte."
                  }
                </p>
                {retryCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Tentativas realizadas: {retryCount}
                  </p>
                )}
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
              {needsSetup ? "Configurar e Verificar" : "Verificar"}
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