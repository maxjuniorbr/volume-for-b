# Volume for B

Aumente o volume de abas do Chrome em até 600%, com controle por aba e processamento local no navegador.

**Sem propagandas. Sem coleta de dados. Código aberto.**

Página da extensão: https://maxjuniorbr.github.io/volume-for-b/

---

## O que você precisa saber

- Funciona quando o áudio de uma aba está baixo mesmo com o volume do navegador e do sistema já altos.
- O controle é por aba. Ele não muda o volume geral do computador.
- O processamento acontece localmente no navegador.
- Ele aumenta ganho. Não corrige áudio ruim nem substitui hardware.

## Recursos

- Volume de 0% a 600%
- Controle individual por aba
- Mute, unmute e reset rápido
- Memória por domínio
- Modo claro e escuro
- Suporte a português e inglês

## Como Usar

1. Abra uma aba com áudio (YouTube, Spotify, etc.)
2. Clique no ícone da extensão
3. Selecione a aba na lista
4. Clique em "Iniciar" para ativar o controle
5. Ajuste o volume usando o slider (0-600%)

## Privacidade e Segurança

- Nenhum dado é enviado para servidores externos
- Todo o processamento de áudio acontece localmente no navegador
- Sem propagandas, trackers ou analytics
- Permissões mínimas necessárias para controlar o áudio das abas

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
