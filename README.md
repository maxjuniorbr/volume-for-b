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

## Principais recursos

- Volume de 0% a 600%
- Controle individual por aba
- Mute, unmute e reset rápido
- Memória por domínio
- Modo claro e escuro
- Interface da extensão em português e inglês
- Landing pública em PT-BR, EN e ES

## Stack e estrutura

- Extensão Chrome Manifest V3
- `popup.*` para interface
- `sw.js` para orquestração da extensão
- `offscreen.*` para processamento de áudio
- `_locales/` para internacionalização
- `tests/` com cobertura do fluxo principal

## Como rodar localmente

```bash
git clone https://github.com/maxjuniorbr/volume-for-b.git
cd volume-for-b
npm install
npm test
```

Depois disso:

1. Abra `chrome://extensions/`
2. Ative o modo de desenvolvedor
3. Clique em `Carregar sem compactação`
4. Selecione a pasta do projeto

## Scripts principais

```bash
npm run dev        # Instruções para modo desenvolvedor
npm run build      # Build de produção
npm run lint       # Corrigir problemas de lint
npm run lint:check # Validar lint sem alterar arquivos
npm test           # Executar testes unitários
npm run clean      # Limpar builds
```

## Qualidade e validação

- `npm run lint:check`
- `npm test`
- `npm run build`
- SonarCloud com Quality Gate no nível `A`

## Documentos do projeto

- Página pública: https://maxjuniorbr.github.io/volume-for-b/
- Suporte: [SUPPORT.md](SUPPORT.md)
- Privacidade: [PRIVACY.md](PRIVACY.md)
- Segurança: [SECURITY.md](SECURITY.md)

## Licença

MIT. Veja [LICENSE](LICENSE).
