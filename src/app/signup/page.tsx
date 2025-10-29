"use client";

import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from "firebase/auth";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase/clientApp";

const paymentLinks = {
  Mensal: "https://pay.sumup.com/b2c/Q0FRYLR6",
  Semestral: "https://pay.sumup.com/b2c/Q3QCURHB",
  Anual: "https://pay.sumup.com/b2c/QI2UYEAT",
};

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan") || "Nenhum plano selecionado";
  const paymentMethod = searchParams.get("paymentMethod");
  const { toast } = useToast();
  const [_name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    if (
      !plan ||
      !paymentMethod ||
      !["Mensal", "Semestral", "Anual"].includes(plan)
    ) {
      toast({
        variant: "destructive",
        title: "Erro no Plano",
        description:
          "Plano ou método de pagamento inválido. Por favor, selecione um plano novamente.",
      });
      router.push("/plans");
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      await sendEmailVerification(user);

      toast({
        title: "Verifique seu E-mail!",
        description:
          "Enviamos um link de verificação. Após verificar, faça login e você será direcionado para a configuração de segurança.",
      });

      if (paymentMethod === "creditCard") {
        const paymentUrl = paymentLinks[plan as keyof typeof paymentLinks];
        window.location.href = paymentUrl; // Redirect to external payment gateway
      } else {
        // PIX
        router.push(`/pix-payment?plan=${plan}`);
      }
    } catch (error: unknown) {
      const err = error as FirebaseError;
      let errorMessage = "Ocorreu um erro ao criar a conta.";
      if (err.code === "auth/email-already-in-use") {
        errorMessage = "Este e-mail já está em uso.";
      } else if (err.code === "auth/weak-password") {
        errorMessage = "A senha deve ter pelo menos 6 caracteres.";
      }
      toast({
        variant: "destructive",
        title: "Erro no Cadastro",
        description: errorMessage,
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md text-center mb-8">
        <h1 className="text-4xl font-bold text-foreground">Crie sua Conta</h1>
        <p className="text-muted-foreground mt-2">
          Assine o plano <span className="font-bold text-primary">{plan}</span> e
          comece a usar a plataforma.
        </p>
      </div>
      <Card className="w-full max-w-md shadow-lg">
        <form onSubmit={handleSignup}>
          <CardContent className="grid gap-6 pt-6">
            <div className="grid gap-2 text-left">
              <Label htmlFor="name">Nome Completo</Label>
              <Input
                id="name"
                type="text"
                placeholder="Seu nome"
                required
                value={_name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2 text-left">
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
            <div className="grid gap-2 text-left">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button className="w-full" type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Conta e Ir para Pagamento
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      }
    >
      <SignupPageContent />
    </Suspense>
  );
}
