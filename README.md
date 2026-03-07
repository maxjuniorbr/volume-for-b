# Volume for B

Extensão do Chrome para amplificar o volume das abas com áudio em até 600%, com processamento local no navegador.

**Sem propagandas. Sem coleta de dados. Código aberto.**

---

## Sobre

Volume for B é uma extensão gratuita e de código aberto com propósito único: aumentar o volume de abas que estão reproduzindo áudio. O processamento é feito localmente no navegador, sem envio de dados para servidores externos.

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
git clone https://github.com/maxjuniorbr/volume-for-b.git
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

## Suporte e Privacidade

- Suporte: veja [SUPPORT.md](SUPPORT.md)
- Privacidade: veja [PRIVACY.md](PRIVACY.md)

## Licença

MIT License - Veja [LICENSE](LICENSE) para detalhes.

---

Desenvolvido por Dianin
