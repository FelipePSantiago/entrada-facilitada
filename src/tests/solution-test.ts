import { safeLocalStorage, storageUtils } from '../lib/safe-storage';
import { retryFirebaseFunction, CircuitBreaker } from '../lib/retry-logic';

// Teste 1: Safe Storage
function testSafeStorage() {
  console.log('🧪 Testando Safe Storage...');
  
  // Teste básico
  safeLocalStorage.setItem('test-key', 'test-value');
  const value = safeLocalStorage.getItem('test-key');
  console.log('✅ Safe Storage básico:', value === 'test-value');
  
  // Teste com timestamp
  storageUtils.setWithTimestamp('timestamp-test', 'expires-soon');
  const timestampValue = storageUtils.getWithTimestamp('timestamp-test', 60000); // 1 minuto
  console.log('✅ Safe Storage com timestamp:', timestampValue === 'expires-soon');
  
  // Teste com objeto
  const testObj = { name: 'John', age: 30 };
  storageUtils.setObject('object-test', testObj);
  const objValue = storageUtils.getObject('object-test');
  console.log('✅ Safe Storage com objeto:', JSON.stringify(objValue) === JSON.stringify(testObj));
}

// Teste 2: Retry Logic
async function testRetryLogic() {
  console.log('🧪 Testando Retry Logic...');
  
  let attempts = 0;
  const mockFunction = async () => {
    attempts++;
    if (attempts < 3) {
      throw new Error('Simulated failure');
    }
    return 'success';
  };
  
  try {
    const result = await retryFirebaseFunction(
      mockFunction,
      'test-function',
      {
        maxRetries: 3,
        initialDelay: 100,
        onRetry: (attempt, error, delay) => {
          // Verificação de tipo para acessar a propriedade message
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`🔄 Retry attempt ${attempt}: ${errorMessage}`);
        }
      }
    );
    console.log('✅ Retry Logic funcionou:', result === 'success');
  } catch (error) {
    // Também corrigir o catch para lidar com unknown
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log('❌ Retry Logic falhou:', errorMessage);
  }
}

// Teste 3: Circuit Breaker
async function testCircuitBreaker() {
  console.log('🧪 Testando Circuit Breaker...');
  
  const circuitBreaker = new CircuitBreaker({
    failureThreshold: 2,
    resetTimeout: 1000,
  });
  
  let attempts = 0;
  const failingFunction = async () => {
    attempts++;
    throw new Error('Always fails');
  };
  
  // Primeiras falhas para abrir o circuit breaker
  try {
    await circuitBreaker.execute(failingFunction);
  } catch (error) {
    console.log('🔌 Expected failure 1');
  }
  
  try {
    await circuitBreaker.execute(failingFunction);
  } catch (error) {
    console.log('🔌 Expected failure 2');
  }
  
  // Circuit breaker deve estar aberto agora
  const state = circuitBreaker.getState();
  console.log('✅ Circuit Breaker aberto:', state.state === 'OPEN');
  
  // Tentar executar com circuit breaker aberto
  try {
    await circuitBreaker.execute(failingFunction);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log('🔌 Circuit breaker bloqueou execução:', errorMessage);
  }
}

// Teste 4: Storage Availability
function testStorageAvailability() {
  console.log('🧪 Testando Storage Availability...');
  
  const isAvailable = safeLocalStorage.isStorageAvailable();
  console.log('✅ Storage availability check:', typeof isAvailable === 'boolean');
  
  // Testar fallback - usar type assertion para evitar problemas de tipo
  const originalLocalStorage = window.localStorage;
  
  // Temporariamente remover localStorage para testar fallback
  Object.defineProperty(window, 'localStorage', {
    value: undefined,
    writable: true,
    configurable: true
  });
  
  safeLocalStorage.setItem('fallback-test', 'fallback-value');
  const fallbackValue = safeLocalStorage.getItem('fallback-test');
  console.log('✅ Fallback storage funcionou:', fallbackValue === 'fallback-value');
  
  // Restaurar localStorage original
  Object.defineProperty(window, 'localStorage', {
    value: originalLocalStorage,
    writable: true,
    configurable: true
  });
}

// Executar todos os testes
export async function runAllTests() {
  console.log('🚀 Iniciando testes das soluções Firebase...');
  
  try {
    testSafeStorage();
    await testRetryLogic();
    await testCircuitBreaker();
    testStorageAvailability();
    
    console.log('✅ Todos os testes concluídos com sucesso!');
  } catch (error) {
    // Corrigir o tratamento de erro aqui também
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Erro nos testes:', errorMessage);
  }
}

// Exportar funções individuais para testes específicos
export {
  testSafeStorage,
  testRetryLogic,
  testCircuitBreaker,
  testStorageAvailability,
};