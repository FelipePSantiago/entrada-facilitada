"use client";

import React from 'react';
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Settings } from 'lucide-react';
import { useAuth } from "@/contexts/AuthContext";

export default function AdminSettingsPage() {
  const { user } = useAuth();

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/admin">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao Painel
          </Link>
        </Button>
        
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Configurações do Sistema
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          Configure parâmetros gerais do sistema.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-purple-600" />
              Configurações Gerais
            </CardTitle>
            <CardDescription>
              Configurações básicas do sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Esta página está em desenvolvimento. Em breve você poderá configurar:
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>Parâmetros de simulação</li>
                <li>Configurações de notificação</li>
                <li>Integrações com sistemas externos</li>
                <li>Backup e restauração de dados</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informações do Sistema</CardTitle>
            <CardDescription>
              Detalhes sobre a instalação atual
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Usuário atual:</span>
                <span className="text-sm">{user?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Versão:</span>
                <span className="text-sm">0.1.41</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Ambiente:</span>
                <span className="text-sm">{process.env.NODE_ENV}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}