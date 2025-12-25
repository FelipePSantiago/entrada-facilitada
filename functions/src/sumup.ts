import * as functions from 'firebase-functions';
import { type CallableRequest } from 'firebase-functions/v2/https';

export const processSumupPayment = async (request: CallableRequest) => {
    // Force redeploy to update environment variables
    const sumupApiKey = process.env.SUMUP_APIKEY;

    try {
        // Verifique se a chave existe aqui
        if (!sumupApiKey) {
            console.error('A chave da API da SumUp não foi configurada nas variáveis de ambiente do Firebase.');
            throw new functions.https.HttpsError('internal', 'Erro de configuração do servidor.');
        }

        const { amount, currency, email, name } = request.data;

        if (!amount || !currency || !email || !name) {
            throw new functions.https.HttpsError('invalid-argument', 'Dados de pagamento incompletos.');
        }

        const response = await fetch('https://api.sumup.com/v0.1/checkouts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sumupApiKey}`
            },
            body: JSON.stringify({
                checkout_reference: `checkout_${Date.now()}`,
                amount: parseFloat(amount),
                currency: currency,
                pay_to_email: 'santiago.physics@gmail.com',
                description: 'Pagamento de teste',
                customer: {
                    name: name,
                    email: email,
                },
                return_url: 'http://localhost:3000/sumup-payment/success', 
            }),
        });

        const data = await response.json();

        if (response.ok) {
            return { checkout_url: data.checkout_url };
        } else {
            console.error('Erro da API da SumUp:', data);
            throw new functions.https.HttpsError('internal', data.error_message || 'Erro ao criar o checkout na SumUp.');
        }
    } catch (error) {
        console.error('Erro interno na função de pagamento:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Ocorreu um erro inesperado ao processar o pagamento.');
    }
};
