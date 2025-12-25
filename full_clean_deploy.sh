#!/bin/bash

# =============================================================================
# LIMPEZA COMPLETA E DEPLOY AUTOMÁTICO DO FRONTEND
# =============================================================================
# Uso: ./full_clean_deploy.sh
# Este script remove TODOS os caches, builds, recria o build e faz deploy automático

echo "🧹 INICIANDO LIMPEZA COMPLETA E DEPLOY DO FRONTEND..."
echo "================================================================"

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

# Verificar pré-requisitos
echo -e "\n${BLUE}🔍 Verificando pré-requisitos...${NC}"

if ! command_exists firebase; then
    echo -e "${RED}❌ Firebase CLI não encontrado!${NC}"
    echo -e "${YELLOW}Instale com: npm install -g firebase-tools${NC}"
    exit 1
fi

if ! command_exists npm; then
    echo -e "${RED}❌ npm não encontrado!${NC}"
    exit 1
fi

check_success "Pré-requisitos verificados"

# 1. LIMPAR NEXT.JS BUILD
echo -e "\n${BLUE}📦 1. Limpando build do Next.js...${NC}"
if [ -d ".next" ]; then
    echo "Removendo diretório .next..."
    rm -rf .next
    check_success "Diretório .next removido"
else
    echo -e "${YELLOW}⚠️  Diretório .next não encontrado${NC}"
fi

# 2. LIMPAR CACHE DO NPM
echo -e "\n${BLUE}📦 2. Limpando cache do npm...${NC}"
echo "Executando npm cache clean --force..."
npm cache clean --force
check_success "Cache do npm limpo"

# 3. LIMPAR NODE_MODULES E REINSTALAR
echo -e "\n${BLUE}📦 3. Limpando node_modules...${NC}"
if [ -d "node_modules" ]; then
    echo "Removendo node_modules..."
    rm -rf node_modules
    check_success "node_modules removido"
else
    echo -e "${YELLOW}⚠️  node_modules não encontrado${NC}"
fi

echo "Reinstalando dependências..."
npm install
check_success "Dependências reinstaladas"

# 4. LIMPAR CACHE DO NEXT.JS
echo -e "\n${BLUE}🗂️ 4. Limpando cache do Next.js...${NC}"
if [ -d ".next" ]; then
    rm -rf .next/cache
    check_success "Cache do Next.js removido"
fi

# 5. LIMPAR OUTROS ARQUIVOS TEMPORÁRIOS
echo -e "\n${BLUE}🗂️ 5. Limpando arquivos temporários...${NC}"

# Remover arquivos de log
find . -name "*.log" -type f -delete 2>/dev/null && check_success "Logs removidos" || echo -e "${YELLOW}⚠️  Nenhum log encontrado${NC}"

# Remover arquivos de coverage
find . -name ".coverage" -type d -exec rm -rf {} + 2>/dev/null && check_success "Coverage removido" || echo -e "${YELLOW}⚠️  Nenhuma coverage encontrada${NC}"

# Remover arquivos .DS_Store (macOS)
find . -name ".DS_Store" -type f -delete 2>/dev/null && check_success "Arquivos .DS_Store removidos" || echo -e "${YELLOW}⚠️  Nenhum .DS_Store encontrado${NC}"

# Remover arquivos Thumbs.db (Windows)
find . -name "Thumbs.db" -type f -delete 2>/dev/null && check_success "Arquivos Thumbs.db removidos" || echo -e "${YELLOW}⚠️  Nenhum Thumbs.db encontrado${NC}"

# 6. LIMPAR CACHE DO TYPESCRIPT
echo -e "\n${BLUE}📝 6. Limpando cache do TypeScript...${NC}"
if [ -d ".next" ]; then
    rm -rf .next/types
    check_success "Cache do TypeScript removido"
fi

# Remover arquivos .tsbuildinfo
find . -name "*.tsbuildinfo" -type f -delete 2>/dev/null && check_success "Arquivos .tsbuildinfo removidos" || echo -e "${YELLOW}⚠️  Nenhum .tsbuildinfo encontrado${NC}"

# 7. LIMPAR CACHE DO ESLINT
echo -e "\n${BLUE}📝 7. Limpando cache do ESLint...${NC}"
if [ -d ".eslintcache" ]; then
    rm -rf .eslintcache
    check_success "Cache do ESLint removido"
fi

# 8. LIMPAR CACHE DO VITE (se existir)
echo -e "\n${BLUE}📦 8. Limpando cache do Vite...${NC}"
if [ -d "node_modules/.vite" ]; then
    rm -rf node_modules/.vite
    check_success "Cache do Vite removido"
fi

# 9. VERIFICAR E LIMPAR DIRETÓRIOS .VERCEL
echo -e "\n${BLUE}🚀 9. Limpando caches do Vercel...${NC}"
if [ -d ".vercel" ]; then
    rm -rf .vercel
    check_success "Cache do Vercel removido"
fi

# 10. LIMPAR OUTROS CACHES COMUNS
echo -e "\n${BLUE}🗂️ 10. Limpando outros caches...${NC}"

# Limpar cache do parcel
if [ -d ".parcel-cache" ]; then
    rm -rf .parcel-cache
    check_success "Cache do Parcel removido"
fi

# Limpar cache do webpack
if [ -d ".webpack" ]; then
    rm -rf .webpack
    check_success "Cache do Webpack removido"
fi

# 11. FORÇAR LIMPEZA DO WATCHMAN (macOS/Linux)
echo -e "\n${BLUE}👀️ 11. Limpando Watchman...${NC}"
if command -v watchman >/dev/null 2>&1; then
    watchman watch-del-all >/dev/null 2>&1
    check_success "Watchman limpo"
else
    echo -e "${YELLOW}⚠️  Watchman não encontrado${NC}"
fi

# 12. VERIFICAR ARQUIVOS DE CONFIGURAÇÃO
echo -e "\n${BLUE}⚙️ 12. Verificando arquivos de configuração...${NC}"

# Verificar se package.json existe
if [ -f "package.json" ]; then
    check_success "package.json encontrado"
else
    echo -e "${RED}❌ ERRO: package.json não encontrado!${NC}"
    exit 1
fi

# Verificar se next.config.js/ts existe
if [ -f "next.config.js" ] || [ -f "next.config.ts" ] || [ -f "next.config.mjs" ]; then
    check_success "Configuração do Next.js encontrada"
else
    echo -e "${RED}❌ ERRO: Configuração do Next.js não encontrada!${NC}"
    exit 1
fi

# Verificar se firebase.json existe
if [ -f "firebase.json" ]; then
    check_success "Configuração do Firebase encontrada"
else
    echo -e "${RED}❌ ERRO: firebase.json não encontrado!${NC}"
    echo -e "${YELLOW}⚠️  Execute 'firebase init hosting' para criar configuração${NC}"
    exit 1
fi

# 13. CRIAR NOVO BUILD COMPLETAMENTE LIMPO
echo -e "\n${BLUE}🏗️ 13. Criando build completamente limpo...${NC}"
echo "Executando npm run build..."
npm run build

if [ $? -eq 0 ]; then
    check_success "Build criado com sucesso"
else
    echo -e "${RED}❌ ERRO: Falha no build!${NC}"
    echo -e "${YELLOW}⚠️  Verifique os erros acima e corrija antes de fazer deploy${NC}"
    exit 1
fi

# 14. VERIFICAR TAMANHO DO BUILD
echo -e "\n${BLUE}📊 14. Verificando tamanho do build...${NC}"
if [ -d ".next" ]; then
    BUILD_SIZE=$(du -sh .next 2>/dev/null | cut -f1)
    echo -e "${GREEN}📦 Tamanho do build: ${BUILD_SIZE}${NC}"
fi

# 15. VERIFICAR SE ESTÁ LOGADO NO FIREBASE
echo -e "\n${BLUE}🔥 15. Verificando login no Firebase...${NC}"
if firebase login:list | grep -q "No active users"; then
    echo -e "${RED}❌ Você não está logado no Firebase!${NC}"
    echo -e "${YELLOW}Execute: firebase login${NC}"
    exit 1
else
    check_success "Login no Firebase verificado"
fi

# 16. FAZER DEPLOY AUTOMÁTICO APENAS DO FRONTEND
echo -e "\n${BLUE}🚀 16. Iniciando deploy do frontend...${NC}"
echo "Executando: firebase deploy --only hosting"

firebase deploy --only hosting

if [ $? -eq 0 ]; then
    check_success "Deploy do frontend realizado com sucesso!"
    DEPLOY_SUCCESS=true
else
    echo -e "${RED}❌ ERRO: Falha no deploy!${NC}"
    echo -e "${YELLOW}⚠️  Verifique os erros acima${NC}"
    DEPLOY_SUCCESS=false
    exit 1
fi

# 17. RESUMO FINAL
echo -e "\n${GREEN}🎉 PROCESSO COMPLETO FINALIZADO!${NC}"
echo "================================================================"
echo -e "${GREEN}✅ Todos os caches foram removidos${NC}"
echo -e "${GREEN}✅ Build criado com sucesso${NC}"
echo -e "${GREEN}✅ Deploy do frontend realizado${NC}"
echo "================================================================"

# 18. INFORMAÇÕES DO DEPLOY
if [ "$DEPLOY_SUCCESS" = true ]; then
    echo -e "\n${BLUE}📋 INFORMAÇÕES DO DEPLOY:${NC}"
    
    # Extrair URL do firebase.json se existir
    if [ -f "firebase.json" ]; then
        echo -e "${GREEN}✅ Projeto deployado com sucesso!${NC}"
        echo -e "${YELLOW}⚠️  Verifique o Firebase Console para a URL do seu site${NC}"
    fi
    
    echo -e "\n${BLUE}🌐 ACESSO RÁPIDO:${NC}"
    echo -e "${YELLOW}1. Firebase Console: https://console.firebase.google.com${NC}"
    echo -e "${YELLOW}2. Seu projeto está listado na seção Hosting${NC}"
fi

# 19. INSTRUÇÕES FINAIS
echo -e "\n${BLUE}📋 PRÓXIMOS PASSOS OPCIONAIS:${NC}"
echo -e "${YELLOW}1. Para fazer deploy apenas de mudanças específicas:${NC}"
echo "   firebase deploy --only hosting"
echo ""
echo -e "${YELLOW}2. Para visualizar logs de deploy:${NC}"
echo "   firebase hosting:log"
echo ""
echo -e "${YELLOW}3. Para fazer rollback:${NC}"
echo "   firebase hosting:rollback"
echo ""

echo -e "\n${GREEN}🚀 Frontend 100% limpo e deploy concluído!${NC}"
echo -e "${GREEN}⭐ Seu site está no ar!${NC}"