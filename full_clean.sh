#!/bin/bash

# =============================================================================
# LIMPEZA COMPLETA DO PROJETO NEXT.JS PARA DEPLOY LIMPO
# =============================================================================
# Uso: ./clean-deploy.sh
# Este script remove TODOS os caches, builds e arquivos temporários

echo "🧹 INICIANDO LIMPEZA COMPLETA DO PROJETO..."
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
    fi
}

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

# 15. LIMPAR VERSÕES ANTERIORES DO FIREBASE HOSTING
echo -e "\n${BLUE}🔥 15. Informações sobre Firebase Hosting...${NC}"
echo -e "${YELLOW}⚠️  Para limpar caches do Firebase Hosting:${NC}"
echo -e "${BLUE}   1. Acesse Firebase Console${NC}"
echo -e "${BLUE}   2. Vá para Hosting${NC}"
echo -e "${BLUE}   3. Selecione seu projeto${NC}"
echo -e "${BLUE}   4. Clique em 'Clear cache' (se disponível)${NC}"
echo -e "${BLUE}   5. Faça deploy novamente${NC}"

# 16. RESUMO FINAL
echo -e "\n${GREEN}🎉 LIMPEZA COMPLETA FINALIZADA!${NC}"
echo "================================================================"
echo -e "${GREEN}✅ Todos os caches foram removidos${NC}"
echo -e "${GREEN}✅ Build criado com sucesso${NC}"
echo -e "${GREEN}✅ Projeto pronto para deploy${NC}"
echo "================================================================"

# 17. INSTRUÇÕES FINAIS
echo -e "\n${BLUE}📋 PRÓXIMOS PASSOS:${NC}"
echo -e "${YELLOW}1. Commit as mudanças (se necessário):${NC}"
echo "   git add ."
echo "   git commit -m \"Limpeza completa e build atualizado\""
echo ""
echo -e "${YELLOW}2. Deploy via Firebase Hosting:${NC}"
echo "   firebase deploy --only hosting"
echo ""
echo -e "${YELLOW}3. Ou via Firebase Console:${NC}"
echo "   - Arraste a pasta .next/static para o Firebase Hosting"
echo "   - Ou configure build automático no GitHub Actions"

echo -e "\n${GREEN}🚀 Projeto 100% limpo e pronto para deploy!${NC}"