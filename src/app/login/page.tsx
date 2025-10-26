// src/app/login/page.tsx
"use client";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building } from "lucide-react";
import Link from "next/link";
import { toast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password);
      toast({ title: "Login bem-sucedido!" });
      router.push("/");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro ao fazer login.";
      toast({ 
        title: "Erro de autenticação",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background-secondary p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white">
              <Building className="h-7 w-7" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-text-primary">Entrada Facilitada</h1>
          </Link>
          <p className="mt-4 text-text-secondary">Bem-vindo de volta! Faça login para continuar.</p>
        </div>

        <form 
          onSubmit={handleLogin} 
          className="bg-background-primary p-8 rounded-2xl shadow-apple space-y-6"
        >
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12"
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              <Link href="/forgot-password" className="text-sm text-accent hover:underline">
                Esqueceu a senha?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="Sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-12"
            />
          </div>
          
          <Button type="submit" className="w-full h-12 text-lg" disabled={isLoading}>
            {isLoading ? "Entrando..." : "Entrar"}
          </Button>
        </form>

        <p className="text-center text-sm text-text-secondary">
          Não tem uma conta?{" "}
          <Link href="/signup" className="font-medium text-accent hover:underline">
            Cadastre-se
          </Link>
        </p>
      </div>
    </div>
  );
}
