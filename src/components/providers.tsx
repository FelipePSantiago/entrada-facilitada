'use client';

import dynamic from 'next/dynamic';
import React from 'react';

const ClientProviders = dynamic(() => import('./client-providers').then(mod => mod.ClientProviders), {
  ssr: false,
  loading: () => <div>Carregando...</div>, 
});

export function Providers({ children }: { children: React.ReactNode }) {
  return <ClientProviders>{children}</ClientProviders>;
}