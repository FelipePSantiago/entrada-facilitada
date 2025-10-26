// src/app/forgot-password/page.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
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
import { Loader2, ArrowLeft, Mail, CheckCircle } from "lucide-react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase/clientApp";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    
    try {
      await sendPasswordResetEmail(auth, email);
      toast({
        title: "Link Enviado!",
        description: "Verifique sua caixa de entrada para redefinir sua senha.",
      });
      setIsSent(true);
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao Enviar",
        description: "Não foi possível encontrar uma conta com este e-mail.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            asChild
            className="mb-4"
          >
            <Link href="/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para o Login
            </Link>
          </Button>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
              <Mail className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle className="text-2xl">Redefinir Senha</CardTitle>
            <CardDescription>
              {isSent 
                ? "O link foi enviado para o seu e-mail." 
                : "Digite seu e-mail para receber um link de redefinição."
              }
            </CardDescription>
          </CardHeader>
          
          {!isSent ? (
            <form onSubmit={handleResetPassword}>
              <CardContent className="space-y-4">
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
              </CardContent>
              <CardFooter>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar Link de Redefinição
                </Button>
              </CardFooter>
            </form>
          ) : (
            <CardContent className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-green-800 dark:text-green-400">Email Enviado!</h3>
                    <p className="text-green-700 dark:text-green-300 text-sm mt-1">
                      Enviamos um link de redefinição de senha para o endereço de e-mail fornecido. 
                      Verifique sua caixa de entrada e também a pasta de spam.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                Não recebeu o email? Verifique sua pasta de spam ou{" "}
                <button 
                  onClick={() => setIsSent(false)}
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                >
                  tente novamente
                </button>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}