#!/bin/bash

# =============================================================================
# LIMPEZA E DEPLOY AUTOMÁTICO DAS FUNÇÕES FIREBASE
# =============================================================================
# Uso: ./clean_functions_deploy.sh
# Este script remove caches, recria o build e faz deploy apenas das functions
# Garante que versões anteriores não interfiram no funcionamento

# Cores para feedback visual
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para verificar se comando foi bem-sucedido
check_success() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $1${NC}"
    else
        echo -e "${RED}❌ $1${NC}"
        return 1
    fi
}

# Função para verificar se comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Função para exibir mensagem formatada
step_message() {
    echo -e "\n${BLUE}🔧 $1${NC}"
}

# Função para exibir erro formatado
error_message() {
    echo -e "\n${RED}❌ $1${NC}"
}

# Função para exibir sucesso formatado
success_message() {
    echo -e "\n${GREEN}✅ $1${NC}"
}

# Função para exibir aviso formatado
warning_message() {
    echo -e "\n${YELLOW}⚠️ $1${NC}"
}

# Início do script
echo -e "${BLUE}🚀 INICIANDO DEPLOY LIMPO DAS FUNÇÕES FIREBASE${NC}"
echo -e "${BLUE}================================================================${NC}"

# Verificar pré-requisitos
step_message "Verificando pré-requisitos..."

if ! command_exists firebase; then
    error_message "Firebase CLI não encontrado!"
    echo -e "${YELLOW}Instale com: npm install -g firebase-tools${NC}"
    exit 1
fi

if ! command_exists npm; then
    error_message "npm não encontrado!"
    exit 1
fi

check_success "Pré-requisitos verificados"

# 1. Limpar caches do projeto
step_message "1. Limpando caches do projeto..."

# Remover caches do Next.js
if [ -d ".next" ]; then
    echo "Removendo diretório .next..."
    rm -rf .next
    check_success "Cache .next removido"
else
    warning_message "Diretório .next não encontrado"
fi

# Remover caches do npm
echo "Executando npm cache clean --force..."
npm cache clean --force
check_success "Cache do npm limpo"

# Remover node_modules se existir (opcional, mas recomendado para build limpo)
if [ "$1" = "--deep-clean" ] && [ -d "node_modules" ]; then
    echo "Removendo node_modules..."
    rm -rf node_modules
    check_success "node_modules removido"
    echo "Reinstalando dependências..."
    npm install
    if [ $? -eq 0 ]; then
        check_success "Dependências reinstaladas"
    else
        error_message "Falha ao reinstalar dependências"
        exit 1
    fi
fi

# Remover arquivos temporários
echo "Removendo arquivos temporários..."
find . -name "*.log" -type f -delete 2>/dev/null && check_success "Logs removidos" || warning_message "Nenhum log encontrado"
find . -name ".DS_Store" -type f -delete 2>/dev/null && check_success "Arquivos .DS_Store removidos" || warning_message "Nenhum .DS_Store encontrado"

# 2. Verificar arquivos de configuração
step_message "2. Verificando arquivos de configuração..."

if [ ! -f "package.json" ]; then
    error_message "package.json não encontrado!"
    exit 1
fi

if [ ! -f "firebase.json" ]; then
    error_message "firebase.json não encontrado!"
    exit 1
fi

if [ ! -f "tsconfig.json" ]; then
    error_message "tsconfig.json não encontrado!"
    exit 1
fi

check_success "Arquivos de configuração verificados"

# 3. Verificar estrutura das functions
step_message "3. Verificando estrutura das functions..."

if [ ! -d "functions" ]; then
    error_message "Diretório functions não encontrado!"
    exit 1
fi

if [ ! -f "functions/package.json" ]; then
    error_message "functions/package.json não encontrado!"
    exit 1
fi

if [ ! -f "functions/tsconfig.json" ]; then
    error_message "functions/tsconfig.json não encontrado!"
    exit 1
fi

check_success "Estrutura das functions verificada"

# 4. Fazer build das functions
step_message "4. Fazendo build das functions..."

cd functions

# Verificar se há erros de TypeScript antes do build
echo "Verificando erros de TypeScript..."
npx tsc --noEmit
if [ $? -ne 0 ]; then
    error_message "Erros de TypeScript encontrados! Verifique acima."
    exit 1
fi

check_success "TypeScript verificado sem erros"

# Fazer build
echo "Executando npm run build..."
npm run build
if [ $? -eq 0 ]; then
    success_message "Build das functions concluído com sucesso!"
else
    error_message "Falha no build das functions!"
    echo -e "${YELLOW}Verifique os erros acima e corrija antes de continuar${NC}"
    exit 1
fi

# Verificar se o arquivo de build foi criado
if [ ! -f "lib/index.js" ]; then
    error_message "Arquivo de build não encontrado em lib/index.js!"
    exit 1
fi

# 5. Fazer deploy apenas das functions
step_message "5. Fazendo deploy das functions..."

cd ..

echo "Executando deploy das functions..."
firebase deploy --only functions

if [ $? -eq 0 ]; then
    success_message "Deploy das functions realizado com sucesso!"
else
    error_message "Falha no deploy das functions!"
    echo -e "${YELLOW}Verifique os erros acima e tente novamente${NC}"
    exit 1
fi

# 6. Verificar deploy
step_message "6. Verificando status do deploy..."

echo "Verificando functions disponíveis..."
firebase functions:list

if [ $? -eq 0 ]; then
    success_message "Functions verificadas com sucesso!"
else
    warning_message "Não foi possível verificar as functions"
fi

# 7. Informações finais
echo -e "\n${GREEN}🎉 DEPLOY DAS FUNCTIONS CONCLUÍDO COM SUCESSO!${NC}"
echo -e "${BLUE}================================================================${NC}"
echo -e "${GREEN}✅ Build limpo criado${NC}"
echo -e "${GREEN}✅ Deploy realizado sem interferência de versões anteriores${NC}"
echo -e "${GREEN}✅ Functions ativas e prontas para uso${NC}"
echo -e "${BLUE}================================================================${NC}"
echo -e "\n${YELLOW}📋 INFORMAÇÕES ÚTEIS:${NC}"
echo -e "${YELLOW}• Para visualizar logs: firebase functions:log${NC}"
echo -e "${YELLOW}• Para verificar status: firebase functions:list${NC}"
echo -e "${YELLOW}• Para fazer rollback: firebase deploy --only functions (versão anterior)${NC}"
echo -e "\n${BLUE}🌐 URL do projeto: https://entrada-facilitada.web.app${NC}"
echo -e "\n${BLUE}================================================================${NC}"

# Sinalizar sucesso
exit 0