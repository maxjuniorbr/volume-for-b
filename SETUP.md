# 🔧 Setup - Volume for B

Guia completo para configurar o projeto após clonar do repositório.

## 📋 Pré-requisitos

- Node.js (versão 16+)
- Git
- Chrome/Chromium para testes

## 🚀 Configuração Passo a Passo

### 1. Clonar e instalar
```bash
git clone <seu-repositorio>
cd volume-for-b
npm install
```

### 2. Configurar build de produção
```bash
# Copiar arquivo de configuração
cp build.config.example.js build.config.js
```

### 3. Configurar Extension ID
Edite `build.config.js`:
```javascript
module.exports = {
  EXTENSION_ID: 'seu-extension-id-da-chrome-web-store',
  BUILD_DIR: './build',
  ZIP_NAME: 'volume-for-b-production.zip'
};
```

> 💡 **Como obter Extension ID**: Publique na Chrome Web Store em modo rascunho

### 4. Testar configuração
```bash
npm run build
```

Se aparecer erro sobre `build.config.js`, repita o passo 2.

## 🔨 Desenvolvimento

### Carregar extensão no Chrome
1. Abra `chrome://extensions/`
2. Ative "Modo do desenvolvedor"
3. Clique "Carregar sem compactação"
4. Selecione a pasta do projeto

### Scripts úteis
```bash
npm run clean    # Limpar builds anteriores
npm run build    # Build de produção (ZIP)
npm run dev      # Mostrar instruções
```

## � Build de Produção

O `npm run build` executa:
1. ✅ Limpa builds anteriores
2. ✅ Copia arquivos necessários
3. ✅ Adiciona Extension ID ao manifest
4. ✅ Incrementa versão automaticamente
5. ✅ Cria ZIP para Chrome Web Store

## 🚨 Importante - Segurança

- ❌ **NUNCA** commite `build.config.js`
- ✅ Sempre use `build.config.example.js` como base
- ✅ O `.gitignore` já protege arquivos sensíveis
- ✅ Extension ID fica apenas local

## 🐛 Troubleshooting

**Erro: "build.config.js não encontrado"**
```bash
cp build.config.example.js build.config.js
# Editar o arquivo com seu Extension ID
```

**Build falha com permissões**
```bash
chmod +x build-production.js
```

**Extensão não carrega no Chrome**
- Verifique se não há erros no console
- Confirme que todas as permissões estão no manifest
- Teste com `chrome://extensions/` → "Recarregar"
