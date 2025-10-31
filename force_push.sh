#!/bin/bash

# Script para forçar o push de todos os arquivos para o repositório GitHub

# Navega para o diretório do projeto (opcional, se o script estiver na raiz)
# cd /path/to/your/project

# Inicializa o repositório Git, se ainda não foi inicializado
git init

# Adiciona ou atualiza o repositório remoto
if git remote | grep -q 'origin'; then
    git remote set-url origin https://github.com/FelipePSantiago/entrada-facilitada.git
else
    git remote add origin https://github.com/FelipePSantiago/entrada-facilitada.git
fi

# Adiciona todos os arquivos ao stage
git add .

# Faz o commit das alterações com uma mensagem padrão
git commit -m "Atualização forçada de todos os arquivos do projeto"

# Força o push para a branch main do repositório remoto
git push --force origin HEAD:main

echo "Push forçado para o repositório concluído com sucesso!"
