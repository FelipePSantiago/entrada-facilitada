"use client";

import { httpsCallable } from "firebase/functions";
// Re-adding the aliased import for the local type cast
import { TotpMultiFactorGenerator, type User as FirebaseUser } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { KeyRound, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Suspense, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/client-providers";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase/client";
import { safeLocalStorage } from "@/lib/safe-storage";

function Setup2FAPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { authLoading, has2FA, setIsFullyAuthenticated, user } = useAuth();
  // Re-applying the local type cast as a fail-safe
  const firebaseUser = user as FirebaseUser;

  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState<any | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!authLoading && !firebaseUser) {
      router.replace("/login");
    }
    if (!authLoading && has2FA) {
      router.replace("/simulator");
    }
  }, [authLoading, firebaseUser, has2FA, router]);

  useEffect(() => {
    if (firebaseUser && has2FA === false) {
      const generateSecret = async () => {
        setIsLoading(true);
        try {
          // Using the locally casted user object
          const multiFactorSession = await firebaseUser.multiFactor.getSession();
          const totpSecret = await firebaseUser.multiFactor.generateSecret(
            multiFactorSession
          );

          setSecret(totpSecret);

          const qrCodeDataUrl = await QRCode.toDataURL(totpSecret.qrCodeUrl);
          setQrCode(qrCodeDataUrl);
        } catch (error) {
          console.error("Error generating 2FA secret:", error);
          toast({
            variant: "destructive",
            title: "Erro ao Gerar Segredo 2FA",
            description:
              "Não foi possível gerar a configuração de segurança. Recarregue a página e tente novamente.",
          });
        } finally {
          setIsLoading(false);
        }
      };
      generateSecret();
    }
  }, [firebaseUser, has2FA, toast]);

  const handleVerifyAndSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!firebaseUser || !secret) {
      toast({
        variant: "destructive",
        title: "Erro",
        description:
          "A sessão de configuração expirou. Por favor, recarregue a página.",
      });
      return;
    }
    setIsVerifying(true);

    try {
      const multiFactorAssertion =
        TotpMultiFactorGenerator.assertionForEnrollment(secret, token);

      await firebaseUser.multiFactor.enroll(
        multiFactorAssertion,
        "Meu App Autenticador"
      );

      const userDocRef = doc(db, "users", firebaseUser.uid);
      await updateDoc(userDocRef, {
        is2FAEnabled: true,
      });

      toast({
        title: "Configuração 2FA Concluída!",
        description:
          "Sua conta agora está protegida com verificação em duas etapas.",
      });

      safeLocalStorage.setItem(`2fa-verified-${firebaseUser.uid}`, "true");
      setIsFullyAuthenticated(true);
      router.push("/simulator");
    } catch (error: any) {
      console.error("2FA enrollment error:", error);
      let description = "Ocorreu um erro desconhecido. Tente novamente.";
      if (error.code === "auth/invalid-verification-code") {
        description =
          "O código inserido é inválido ou expirou. Tente novamente.";
      }
      toast({
        variant: "destructive",
        title: "Erro na Verificação",
        description: description,
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

  if (authLoading || (firebaseUser && has2FA === undefined)) {
    return renderLoading("Verificando configuração de segurança...");
  }

  if (isLoading && has2FA === false) {
    return renderLoading("Gerando configuração de segurança...");
  }

  if (has2FA === false && !isLoading) {
    return (
      <div className="w-full max-w-lg p-4 md:p-8">
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

  return renderLoading("Redirecionando...");
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
