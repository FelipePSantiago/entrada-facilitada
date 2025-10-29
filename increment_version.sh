#!/bin/bash

# Define os caminhos dos arquivos
VERSION_FILE="public/version.json"
LAYOUT_FILE="src/app/layout.tsx"

# Verifica se o jq está instalado
if ! command -v jq &> /dev/null
then
    echo "jq não está instalado. Por favor, instale para continuar (ex: brew install jq ou sudo apt-get install jq)."
    exit 1
fi

# Lê a versão atual do version.json
current_version=$(jq -r .version < "$VERSION_FILE")

# Incrementa o número do patch (o último número)
new_version=$(echo "$current_version" | awk -F. -v OFS=. '{$NF++;print}')

# Atualiza o version.json com a nova versão
echo "Incrementando a versão de $current_version para $new_version"
jq --arg new_version "$new_version" '.version = $new_version' "$VERSION_FILE" > tmp.$$.json && mv tmp.$$.json "$VERSION_FILE"

# Atualiza a meta tag no layout.tsx
# Isso usa sed para encontrar a linha com a meta tag e substituir o valor da versão.
# A flag -i.bak cria um backup do arquivo original para segurança.
sed -i.bak "s/meta name=\"app-version\" content=\"[^\"]*\"/meta name=\"app-version\" content=\"$new_version\"/" "$LAYOUT_FILE"

# Remove o arquivo de backup criado pelo sed
rm "${LAYOUT_FILE}.bak"

echo "Versão atualizada para $new_version em $VERSION_FILE e $LAYOUT_FILE"

