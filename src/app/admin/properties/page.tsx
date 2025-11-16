"use client";

import React from 'react';
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building, Users, Settings } from 'lucide-react';
import { useAuth } from "@/contexts/AuthContext";

export default function AdminPage() {
  const { user } = useAuth();

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Painel Administrativo
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          Bem-vindo, {user?.displayName || user?.email}. Escolha uma opção abaixo:
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5 text-blue-600" />
              Gerenciamento de Empreendimentos
            </CardTitle>
            <CardDescription>
              Adicione, edite ou remova empreendimentos e suas tabelas de preços.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/admin/properties">
                <Building className="mr-2 h-4 w-4" />
                Gerenciar Empreendimentos
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-green-600" />
              Administração de Usuários
            </CardTitle>
            <CardDescription>
              Gerencie todos os usuários cadastrados no sistema, permissões e acessos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" variant="default">
              <Link href="/admin/users">
                <Users className="mr-2 h-4 w-4" />
                Administração de Usuários
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-purple-600" />
              Configurações do Sistema
            </CardTitle>
            <CardDescription>
              Configure parâmetros gerais do sistema e preferências.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" variant="outline">
              <Link href="/admin/settings">
                <Settings className="mr-2 h-4 w-4" />
                Configurações
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Acesso Rápido</CardTitle>
            <CardDescription>
              Links rápidos para as ferramentas mais usadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <Button variant="outline" asChild>
                <Link href="/simulator">
                  Ir para o Simulador
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/caixa-simulation">
                  Simulação Caixa
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}