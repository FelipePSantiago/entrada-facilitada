import type { Metadata } from "next";
import "@/app/globals.css";

import { ChunkErrorHandler } from "@/components/common/chunk-error-handler";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import Header from "@/components/common/Header";
import { Providers } from "@/components/providers";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { VersionCheckHandler } from "@/components/common/version-check-handler";

export const metadata: Metadata = {
  title: "Entrada Facilitada",
  description:
    "Calcule o fluxo de pagamento para o parcelamento da entrada de um financiamento imobiliário.",
  openGraph: {
    images: ["https://i.ibb.co/qMQW40pq/app-logo.png"],
  },
  icons: {
    icon: "https://i.ibb.co/qMQW40pq/app-logo.png",
    apple: "https://i.ibb.co/qMQW40pq/app-logo.png",
  },
  manifest: "/manifest.json",
  applicationName: "Entrada Facilitada",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Entrada Facilitada",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="app-version" content="0.1.34" />
        <meta name="theme-color" content="#0d6efd" />
        {/* Meta tags adicionais para controle de cache */}
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
            <Providers>
              <ChunkErrorHandler />
              <VersionCheckHandler />
              <Header />
              <main className="flex w-full flex-col items-center justify-center pt-24">
                {children}
              </main>
              <Toaster />
            </Providers>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}