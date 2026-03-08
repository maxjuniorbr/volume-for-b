# Política de Privacidade

`Volume for B` processa o áudio localmente no navegador para permitir o ajuste do volume das abas com áudio.

## Resumo

- o áudio é tratado localmente no navegador
- preferências são armazenadas localmente
- não há coleta de dados para servidores externos
- não há analytics, trackers ou anúncios

## Dados usados pela extensão

- URLs e domínios das abas com áudio, para exibir a aba correta e salvar o volume por domínio
- título da aba, para identificar a aba no popup
- preferências locais, como ganho por domínio e modo escuro

## O que a extensão não faz

- não coleta dados pessoais em servidores externos
- não vende dados
- não compartilha dados com terceiros
- não usa analytics, trackers ou anúncios

## Compromisso com a Chrome Web Store User Data Policy

O uso dos dados acessados pela extensão segue a Chrome Web Store User Data Policy. Os dados usados para identificar abas e aplicar preferências locais são utilizados apenas para o funcionamento declarado da extensão, sem transferência para terceiros.

## Armazenamento

As preferências são armazenadas localmente usando `chrome.storage.local`.

## Serviços externos

`Volume for B` não depende de serviços externos para processar áudio ou armazenar preferências.

## Permissões

- `tabs`: listar abas com áudio e navegar até a aba selecionada
- `tabCapture`: capturar o áudio da aba para aplicar ganho localmente
- `offscreen`: processar áudio sem página visível
- `storage`: salvar preferências locais

## Contato

Para suporte geral, consulte [SUPPORT.md](SUPPORT.md). Para relato de vulnerabilidades, consulte [SECURITY.md](SECURITY.md).
