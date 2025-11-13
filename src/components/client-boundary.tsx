'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

import { Providers } from "@/components/client-providers";
import { ChunkErrorHandler } from "@/components/common/chunk-error-handler";
import { VersionCheckHandler } from "@/components/common/version-check-handler";
import Header from "@/components/common/Header";
import { Toaster } from "@/components/ui/toaster";

export default function ClientBoundary({ children }: { children: React.ReactNode }) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Carregando aplicação...</p>
      </div>
    );
  }

  return (
    <Providers>
      <ChunkErrorHandler />
      <VersionCheckHandler />
      <Header />
      <main className="flex w-full flex-col items-center justify-center pt-24">
        {children}
      </main>
      <Toaster />
    </Providers>
  );
}
