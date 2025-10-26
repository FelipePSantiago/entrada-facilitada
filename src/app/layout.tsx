// src/app/layout.tsx
import { AuthProvider } from "@/contexts/AuthContext";
import { Inter } from 'next/font/google'
import { ThemeToggle } from '@/components/theme-toggle';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
})


import "./globals.css";

export const metadata = {
  title: "Entrada Facilitada",
  description: "A ferramenta definitiva para corretores. Crie fluxos de pagamento personalizados, extraia dados com IA e gere propostas em PDF em segundos.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        <AuthProvider>
          <ThemeToggle />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}