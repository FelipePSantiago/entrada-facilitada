Soluções Completas para Erros do Firebase App Check 

Este documento explica as soluções implementadas para resolver os erros de Firebase App Check e problemas relacionados ao storage no projeto "Entrada Facilitada". 
🚨 Problemas Identificados 

     Firebase App Check 403 Error: Chave reCAPTCHA não configurada em produção
     Tracking Prevention Errors: Navegadores bloqueando acesso ao localStorage
     Firebase Functions 401 Error: Falha na autenticação devido ao App Check
     Rate Limiting: Throttling por 24 horas após múltiplas falhas
     

✅ Soluções Implementadas 
1. App Check com Tratamento Robusto de Erros 

Arquivo: src/components/providers.tsx 
Principais Melhorias: 

     ✅ Verificação de configuração da chave reCAPTCHA
     ✅ Fallback automático para modo debug em desenvolvimento
     ✅ Contexto React para monitorar status do App Check
     ✅ Tratamento graceful de falhas sem quebrar a aplicação
     

Como Usar: 
typescript
 
 
 
1
2
3
4
5
6
7
8
9
10
11
⌄
⌄
import { useAppCheck } from '@/components/providers';

function MyComponent() {
  const { isAppCheckAvailable, appCheckError } = useAppCheck();
  
  if (!isAppCheckAvailable) {
    return <div>Modo degradado: funcionalidades limitadas</div>;
  }
  
  return <div>Aplicação fully funcional</div>;
}
 
 
 
2. Safe Storage com Fallback Automático 

Arquivo: src/lib/safe-storage.ts 
Principais Melhorias: 

     ✅ Fallback para memória quando localStorage é bloqueado
     ✅ Verificação automática de disponibilidade do storage
     ✅ Sincronização entre storage e fallback
     ✅ Utilitários para objetos JSON e timestamps
     ✅ Hook React para uso facilitado
     

Como Usar: 
typescript
 
 
 
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
⌄
⌄
import { safeLocalStorage, storageUtils, useSafeStorage } from '@/lib/safe-storage';

// Substituição direta do localStorage
safeLocalStorage.setItem('user-token', 'abc123');
const token = safeLocalStorage.getItem('user-token');

// Utilitários avançados
storageUtils.setObject('user-data', { name: 'John', age: 30 });
const userData = storageUtils.getObject('user-data');

// Com timestamp (expira automático)
storageUtils.setWithTimestamp('2fa-verified', 'true');
const isVerified = storageUtils.getWithTimestamp('2fa-verified', 24 * 60 * 60 * 1000);

// Hook React
function MyComponent() {
  const { storage, isAvailable } = useSafeStorage('localStorage');
  
  const saveData = () => {
    storage.setItem('key', 'value');
  };
  
  return (
    <div>
      <p>Storage disponível: {isAvailable ? 'Sim' : 'Não'}</p>
      <button onClick={saveData}>Salvar Dados</button>
    </div>
  );
}
 
 
 
3. Retry Logic com Exponential Backoff 

Arquivo: src/lib/retry-logic.ts 
Principais Melhorias: 

     ✅ Exponential backoff com jitter
     ✅ Circuit Breaker para evitar falhas em cascata
     ✅ Fila de retry para operações concorrentes
     ✅ Condições customizáveis de retry
     ✅ Wrapper específico para Firebase Functions
     

Como Usar: 
typescript
 
 
 
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
⌄
⌄
⌄
⌄
import { 
  retryFirebaseFunction, 
  CircuitBreaker, 
  withFirebaseRetry,
  globalRetryQueue 
} from '@/lib/retry-logic';

// Retry básico
const result = await retryFirebaseFunction(
  () => httpsCallable(functions, 'myFunction')(data),
  'myFunction',
  {
    maxRetries: 3,
    initialDelay: 1000,
    onRetry: (attempt, error, delay) => {
      console.log(`Tentativa ${attempt}, erro: ${error.message}`);
    }
  }
);

// Circuit Breaker
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 60000,
});

const result = await circuitBreaker.execute(async () => {
  return retryFirebaseFunction(operation, 'functionName');
});

// Wrapper automático
const safeFunction = withFirebaseRetry(myFunction, 'myFunction');
const result = await safeFunction(data);

// Fila de retry
const result = await globalRetryQueue.add(
  () => httpsCallable(functions, 'myFunction')(data),
  1 // prioridade
);
 
 
 
4. Hook Integrado Firebase 

Arquivo: src/hooks/use-firebase-enhanced.ts 
Principais Melhorias: 

     ✅ Integração de todas as soluções
     ✅ Monitoramento de saúde do Firebase
     ✅ Operações específicas para 2FA
     ✅ Error boundaries automáticos
     ✅ Estado centralizado de loading e erros
     

Como Usar: 
typescript
 
 
 
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
⌄
⌄
⌄
⌄
⌄
import { 
  useFirebase, 
  useTwoFactorAuth, 
  useTwoFactorStorage,
  useFirebaseHealth 
} from '@/hooks/use-firebase-enhanced';

function MyComponent() {
  const { functions, user } = useAuth();
  const { callFunction, loading, error, attempts } = useFirebase({
    defaultRetryOptions: { maxRetries: 3 }
  });
  
  const { generateSecret, verifyToken } = useTwoFactorAuth(functions);
  const { setVerified, isVerified } = useTwoFactorStorage();
  const { healthStatus, issues } = useFirebaseHealth();

  const handleSetup2FA = async () => {
    try {
      const secret = await generateSecret(user.uid);
      // ... lógica de setup
    } catch (error) {
      console.error('Erro:', error);
    }
  };

  return (
    <div>
      <p>Status Firebase: {healthStatus}</p>
      {issues.map(issue => <p key={issue}>{issue}</p>)}
      <button onClick={handleSetup2FA} disabled={loading}>
        Configurar 2FA
      </button>
    </div>
  );
}
 
 
 
🔧 Configuração Necessária 
1. Variáveis de Ambiente 

Adicione ao seu .env.production: 
bash
 
 
 
1
2
3
4
5
# Firebase App Check - Production
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6Le_xyz_your_real_recaptcha_v3_key

# Firebase App Check - Development (opcional)
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6LeIxAcTAAAAAJcZVRqyHh71UMIEbQjYyBdCR4cK
 
 
 
2. Firebase Console 

     Vá para Project Settings > App Check
     Registre seu domínio de produção
     Obtenha a chave reCAPTCHA v3
     Configure as regiões das Functions
     

3. Atualizar Código Existente 
Substituir localStorage: 
typescript
 
 
 
1
2
3
4
5
6
// Antes
localStorage.setItem(`2fa-verified-${user.uid}`, "true");

// Depois
import { safeLocalStorage } from '@/lib/safe-storage';
safeLocalStorage.setItem(`2fa-verified-${user.uid}`, "true");
 
 
 
Adicionar retry às Functions: 
typescript
 
 
 
1
2
3
4
5
6
7
8
9
// Antes
const result = await httpsCallable(functions, 'myFunction')(data);

// Depois
import { retryFirebaseFunction } from '@/lib/retry-logic';
const result = await retryFirebaseFunction(
  () => httpsCallable(functions, 'myFunction')(data),
  'myFunction'
);
 
 
 
📊 Monitoramento e Debug 
Health Check 
typescript
 
 
 
1
2
3
4
5
6
7
8
9
10
11
12
13
14
⌄
import { useFirebaseHealth } from '@/hooks/use-firebase-enhanced';

function HealthMonitor() {
  const { healthStatus, issues, circuitBreakerState } = useFirebaseHealth();
  
  return (
    <div>
      <p>Saúde: {healthStatus}</p>
      <p>Circuit Breaker: {circuitBreakerState.state}</p>
      <p>Falhas: {circuitBreakerState.failures}</p>
      {issues.map(issue => <p key={issue}>{issue}</p>)}
    </div>
  );
}
 
 
 
Logs Detalhados 

As soluções incluem logs automáticos para: 

     ✅ Status do App Check
     ✅ Tentativas de retry
     ✅ Mudanças de estado do Circuit Breaker
     ✅ Disponibilidade do storage
     

🚀 Exemplo Completo 

Veja src/examples/firebase-integration-example.tsx para um exemplo completo que integra todas as soluções. 
📈 Benefícios 

     Confiabilidade: A aplicação continua funcionando mesmo com falhas parciais
     Performance: Cache inteligente e retry automático
     Experiência do Usuário: Mensagens de erro claras e tentativas automáticas
     Monitoramento: Visibilidade completa do status dos serviços
     Segurança: App Check configurado corretamente
     

🔄 Migração Passo a Passo 

     Instalar os novos arquivos (já feito)
     Configurar variáveis de ambiente
     Atualizar providers no layout
     Substituir localStorage por safeLocalStorage
     Adicionar retry às chamadas de Functions
     Testar em desenvolvimento
     Implantar em produção
     

🆘 Suporte 

Se encontrar problemas: 

     Verifique os logs no console
     Use o componente de health monitoring
     Confirme as variáveis de ambiente
     Teste com o modo debug do App Check
     

As soluções foram projetadas para serem resilientes e fornecerem fallbacks automáticos, garantindo que sua aplicação continue funcionando mesmo sob condições adversas. 