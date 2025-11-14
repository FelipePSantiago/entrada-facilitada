'use client';

export default function SimpleDebugPage() {
  const checkAuth = () => {
    console.log('=== AUTH DEBUG ===');
    console.log('User:', (window as any).user);
    console.log('has2FA:', (window as any).has2FA);
    console.log('is2FAVerified:', (window as any).is2FAVerified);
    console.log('isFullyAuthenticated:', (window as any).isFullyAuthenticated);
    
    // Check localStorage
    console.log('=== LOCAL STORAGE ===');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('2fa')) {
        console.log(`${key}:`, localStorage.getItem(key));
      }
    }
  };

  const clearAll2FA = () => {
    console.log('Clearing all 2FA data...');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('2fa')) {
        localStorage.removeItem(key);
      }
    }
    console.log('All 2FA data cleared');
  };

  const force2FAVerified = () => {
    const user = (window as any).user;
    if (user) {
      localStorage.setItem(`2fa-verified-${user.uid}`, 'true');
      localStorage.setItem(`2fa-timestamp-${user.uid}`, Date.now().toString());
      console.log('2FA verification forced for user:', user.uid);
    }
  };

  return (
    <div className="container mx-auto p-8 max-w-2xl">
      <h1 className="text-3xl font-bold text-center mb-8">🔐 Debug 2FA - Versão Simples</h1>
      
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">📊 Estado Atual</h2>
          
          <div className="space-y-2">
            <button
              onClick={checkAuth}
              className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              🔍 Verificar Estado
            </button>
            
            <button
              onClick={clearAll2FA}
              className="w-full bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              🧹 Limpar Dados 2FA
            </button>
            
            <button
              onClick={force2FAVerified}
              className="w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
              🔓 Forçar Verificação
            </button>
          </div>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">📋 Instruções</h2>
          
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Abra o console do navegador (F12)</li>
            <li>Clique em "Verificar Estado" para ver os dados atuais</li>
            <li>Se houver problema com 2FA, use "Limpar Dados"</li>
            <li>Para testar acesso, use "Forçar Verificação"</li>
            <li>Depois de forçar, tente acessar /simulator</li>
            <li>Recarregue a página para ver as mudanças</li>
          </ol>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">🔗 Links Úteis</h2>
          
          <div className="space-y-2">
            <a href="/login" className="block text-blue-600 hover:text-blue-800 underline">
              📝 Login
            </a>
            <a href="/simulator" className="block text-blue-600 hover:text-blue-800 underline">
              🏗 Simulador
            </a>
            <a href="/debug-2fa" className="block text-blue-600 hover:text-blue-800 underline">
              🔐 Debug Avançado
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}