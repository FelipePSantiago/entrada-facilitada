
"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Importações do Firebase para chamar a função
import { getFunctions, httpsCallable, HttpsCallableResult } from "firebase/functions";

// Interface for the payment result data
interface PaymentResult {
    checkout_url?: string;
}

export default function SumUpPaymentPage() {
    const [amount, setAmount] = useState('50.00'); // Valor de exemplo
    const [currency, setCurrency] = useState('BRL');
    const [email, setEmail] = useState('cliente@exemplo.com'); // Email de exemplo
    const [name, setName] = useState('Nome do Cliente'); // Nome de exemplo
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handlePayment = async () => {
        setError(null);
        setIsLoading(true);

        try {
            const functions = getFunctions(); // Obtém a instância do Firebase Functions
            const processSumupPayment = httpsCallable<Record<string, string>, PaymentResult>(functions, 'processSumupPaymentAction');

            const result: HttpsCallableResult<PaymentResult> = await processSumupPayment({
                amount,
                currency,
                email,
                name,
            });

            const data = result.data;
            if (data && data.checkout_url) {
                window.location.href = data.checkout_url;
            } else {
                throw new Error('URL de checkout não recebida.');
            }
        } catch (err) {
            const errorMessage = (err instanceof Error) ? err.message : 'Ocorreu um erro ao processar o pagamento. Tente novamente.';
            console.error("Erro ao chamar a função de pagamento:", err);
            // Define uma mensagem de erro amigável para o usuário
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex justify-center items-center h-screen bg-gray-50">
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader>
                    <CardTitle className="text-center text-2xl font-bold">Pagamento com SumUp</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="name">Nome Completo</Label>
                            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome completo" />
                        </div>
                        <div>
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
                        </div>
                        <div>
                            <Label htmlFor="amount">Valor (R$)</Label>
                            <Input id="amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                        </div>
                        <div>
                            <Label htmlFor="currency">Moeda</Label>
                            <Input id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled />
                        </div>
                        {error && (
                            <p className="text-red-500 text-sm text-center">{error}</p>
                        )}
                        <Button onClick={handlePayment} disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                            {isLoading ? 'Processando...' : 'Pagar Agora'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
