'''
// functions/install-chrome.js

const { execSync } = require('child_process');
const { existsSync, mkdirSync } = require('fs');
const path = require('path');

// Diretório onde o Chrome será instalado, dentro da pasta functions
const chromeInstallPath = path.join(__dirname, '.local-chromium');

// Função principal
async function installChrome() {
  console.log(`Verificando se o diretório de instalação existe: ${chromeInstallPath}`);
  if (!existsSync(chromeInstallPath)) {
    console.log('Criando diretório de instalação...');
    mkdirSync(chromeInstallPath, { recursive: true });
  }

  try {
    console.log('Iniciando o download do Chrome for Testing...');
    // Usa a ferramenta oficial do Puppeteer para baixar o Chrome compatível
    // A flag --path especifica onde salvar os binários
    execSync(`npx @puppeteer/browsers install chrome@stable --path ${chromeInstallPath}`, {
      stdio: 'inherit', // Mostra a saída do comando no console
    });
    console.log('Download e instalação do Chrome concluídos com sucesso!');
    console.log(`O Chrome foi instalado em: ${chromeInstallPath}`);
  } catch (error) {
    console.error('Falha ao instalar o Chrome:', error);
    process.exit(1); // Encerra o processo com erro
  }
}

// Executa a função
installChrome();
'''