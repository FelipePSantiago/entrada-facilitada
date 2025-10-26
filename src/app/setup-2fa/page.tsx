// src/app/setup-2fa/page.tsx
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
import { Loader2, ShieldCheck, KeyRound, Smartphone } from "lucide-react";
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
          toast({
            variant: "destructive",
            title: "Erro ao Gerar Segredo 2FA",
            description: err.message || "Por favor, recarregue a página.",
          });
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
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Usuário ou segredo 2FA não encontrado.",
      });
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Verificando configuração de segurança...</p>
        </div>
      </div>
    );
  }

  if (isLoading && has2FA === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Gerando configuração de segurança...</p>
        </div>
      </div>
    );
  }

  if (!qrCode && !isLoading && has2FA === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-red-500" />
              Erro na Configuração
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>Não foi possível gerar a configuração. Por favor, recarregue a página.</p>
            <Button 
              onClick={() => window.location.reload()} 
              className="w-full mt-4"
            >
              Recarregar Página
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (has2FA === false && !isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 mb-4">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Configuração de Segurança Obrigatória</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Para proteger sua conta, é necessário configurar a autenticação de dois fatores (2FA).
            </p>
          </div>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Configurar Autenticação de Dois Fatores
              </CardTitle>
              <CardDescription>
                Siga os passos abaixo para configurar a autenticação de dois fatores
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  O que fazer:
                </h3>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>Instale um aplicativo autenticador (ex: Google Authenticator, Authy).</li>
                  <li>No aplicativo, escaneie o QR Code abaixo.</li>
                  <li>Digite o código de 6 dígitos gerado pelo aplicativo para verificar.</li>
                </ol>
              </div>

              <div className="flex justify-center">
                {qrCode ? (
                  <div className="p-4 bg-white rounded-lg shadow-md">
                    <Image 
                      src={qrCode} 
                      alt="QR Code para autenticação de dois fatores" 
                      width={200} 
                      height={200} 
                    />
                  </div>
                ) : (
                  <div className="w-[200px] h-[200px] bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                )}
              </div>

              <form onSubmit={handleVerifyAndSave} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="token">Código de Verificação</Label>
                  <Input
                    id="token"
                    type="text"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    value={token}
                    onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
                    className="text-center text-lg tracking-[0.5em]"
                    placeholder="000000"
                    required
                  />
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isVerifying || token.length !== 6}
                >
                  {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verificar e Salvar
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Fallback for any other state (prevents blank screen)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        <p>Aguardando...</p>
      </div>
    </div>
  );
}

function Setup2FAPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Carregando...</p>
        </div>
      </div>
    }>
      <Setup2FAPageContent />
    </Suspense>
  );
}

export default Setup2FAPage;