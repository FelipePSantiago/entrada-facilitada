import type { Metadata } from "next";
import { PT_Sans } from "next/font/google";
import "@/app/globals.css";
import { Toaster } from "@/components/ui/toaster";
import Header from "@/components/common/Header";
import { Providers } from "@/components/providers";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { ThemeProvider } from "@/components/theme-provider";
import { ChunkErrorHandler } from "@/components/common/chunk-error-handler";

const ptSans = PT_Sans({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-pt-sans",
});

export const metadata: Metadata = {
  title: "Entrada Facilitada",
  description:
    "Calcule o fluxo de pagamento para o parcelamento da entrada de um financiamento imobiliário.",
  openGraph: {
    images: ['https://i.ibb.co/WW6nrBnQ/Riva-LOGO.png'],
  },
  icons: {
    icon: 'https://i.ibb.co/WW6nrBnQ/Riva-LOGO.png',
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
      </head>
      <body className={`${ptSans.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
            <Providers>
              <ChunkErrorHandler />
              <Header />
              <main className="flex w-full flex-col items-center justify-center pt-20">
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
