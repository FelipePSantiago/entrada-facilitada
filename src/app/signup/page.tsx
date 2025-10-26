// src/app/signup/page.tsx
"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Loader2, Eye, EyeOff, CreditCard, QrCode } from "lucide-react";
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { auth } from "@/lib/firebase/clientApp";
import dynamic from "next/dynamic";

const paymentLinks = {
  Mensal: "https://pay.sumup.com/b2c/Q0FRYLR6",
  Semestral: "https://pay.sumup.com/b2c/Q3QCURHB",
  Anual: "https://pay.sumup.com/b2c/QI2UYEAT",
};

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan') || 'Nenhum plano selecionado';
  const paymentMethod = searchParams.get('paymentMethod');
  const { toast } = useToast();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    
    if (!plan || !paymentMethod || !['Mensal', 'Semestral', 'Anual'].includes(plan)) {
      toast({
        variant: "destructive",
        title: "Erro no Plano",
        description: "Plano ou método de pagamento inválido. Por favor, selecione um plano novamente.",
      });
      router.push('/plans');
      return;
    }
    
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      await sendEmailVerification(user);
      
      toast({
        title: "Verifique seu E-mail!",
        description: "Enviamos um link de verificação. Após verificar, faça login para continuar.",
      });
      
      if (paymentMethod === 'creditCard') {
        const paymentUrl = paymentLinks[plan as keyof typeof paymentLinks];
        window.location.href = paymentUrl;
      } else { // PIX
        router.push(`/pix-payment?plan=${plan}`);
      }
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      let errorMessage = "Ocorreu um erro ao criar a conta.";
      
      if (err.code === 'auth/email-already-in-use') {
        errorMessage = "Este e-mail já está em uso.";
      } else if (err.code === 'auth/weak-password') {
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
    <div className="min-h-screen bg-background-secondary py-8 px-4 flex items-center justify-center">
      <div className="max-w-md w-full">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold mb-2 text-text-primary">Cadastro</h1>
          <p className="text-text-secondary">
            Crie sua conta para assinar o plano: <span className="font-semibold text-accent">{plan}</span>.
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {paymentMethod === 'creditCard' ? (
                <CreditCard className="h-5 w-5 text-accent" />
              ) : (
                <QrCode className="h-5 w-5 text-accent" />
              )}
              Criar Conta
            </CardTitle>
            <CardDescription>
              Preencha os dados abaixo para criar sua conta.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSignup}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome Completo</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Seu nome completo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              
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
                <p className="text-xs text-text-secondary">
                  A senha deve ter pelo menos 6 caracteres
                </p>
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
                Criar Conta e Ir para Pagamento
              </Button>
              
              <div className="text-center text-sm">
                <span className="text-text-secondary">Já tem uma conta?</span>{" "}
                <Link 
                  href="/login" 
                  className="text-accent hover:underline font-medium"
                >
                  Fazer Login
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}

const DynamicSignupPageContent = dynamic(() => Promise.resolve(SignupPageContent), {
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-background-secondary">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-accent" />
        <p className="text-text-secondary">Carregando...</p>
      </div>
    </div>
  ),
  ssr: false
});

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background-secondary">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-accent" />
          <p className="text-text-secondary">Carregando...</p>
        </div>
      </div>
    }>
      <DynamicSignupPageContent />
    </Suspense>
  );
}
