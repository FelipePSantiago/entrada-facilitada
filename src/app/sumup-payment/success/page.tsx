
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle } from "lucide-react";

export default function SumUpPaymentSuccessPage() {
    const router = useRouter();

    useEffect(() => {
        const redirectTimer = setTimeout(() => {
            router.push('/');
        }, 5000);

        return () => clearTimeout(redirectTimer);
    }, [router]);

    return (
        <div className="flex flex-col justify-center items-center h-screen text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
            <h1 className="text-2xl font-bold mb-2">Pagamento Aprovado!</h1>
            <p className="text-muted-foreground">
                Seu pagamento foi processado com sucesso.
            </p>
            <p className="text-sm text-gray-500 mt-4">
                Você será redirecionado para a página inicial em 5 segundos.
            </p>
        </div>
    );
}
