# Volume for B

Extensão do Chrome para amplificar o volume de qualquer aba até 600%. Ideal para vídeos, músicas e áudios com volume baixo.

**Sem propagandas. Sem coleta de dados. Código aberto.**

---

## Sobre

Volume for B é uma extensão gratuita e de código aberto que permite controlar e amplificar o volume de abas individuais do navegador. O processamento de áudio é feito localmente, garantindo privacidade total.

## Funcionalidades

- Amplificação de volume de 0% a 600%
- Controle individual por aba
- Função mute/unmute
- Modo escuro/claro
- Memória de configurações por domínio
- Suporte a português e inglês

## Como Usar

1. Abra uma aba com áudio (YouTube, Spotify, etc.)
2. Clique no ícone da extensão
3. Selecione a aba na lista
4. Clique em "Iniciar" para ativar o controle
5. Ajuste o volume usando o slider (0-600%)

## Privacidade e Segurança

- Nenhum dado é coletado ou enviado para servidores externos
- Todo o processamento de áudio é feito localmente no navegador
- Código fonte disponível publicamente no GitHub
- Sem propagandas ou rastreadores
- Permissões mínimas necessárias

## Para Desenvolvedores

### Instalação

```bash
git clone https://github.com/seu-usuario/volume-for-b.git
cd volume-for-b
npm install
```

### Scripts Disponíveis

```bash
npm run dev        # Instruções para modo desenvolvedor
npm run build      # Build de produção
npm run lint       # Executar ESLint
npm test           # Executar testes unitários
npm run clean      # Limpar builds
```

### Estrutura do Projeto

```
volume-for-b/
├── manifest.json       # Configuração da extensão (Manifest V3)
├── popup.*             # Interface principal
├── sw.js               # Service Worker
├── offscreen.*         # Processamento de áudio
├── _locales/           # Internacionalização (pt_BR, en)
├── tests/              # Testes unitários
└── icons/              # Ícones da extensão
```

### Carregar em Modo Desenvolvedor

1. Acesse `chrome://extensions/`
2. Ative o "Modo de desenvolvedor"
3. Clique em "Carregar sem compactação"
4. Selecione a pasta do projeto

## Licença

MIT License - Veja [LICENSE](LICENSE) para detalhes.

---

Desenvolvido por Dianin
