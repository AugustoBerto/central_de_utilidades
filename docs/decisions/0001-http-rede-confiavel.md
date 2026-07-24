# ADR 0001 — HTTP em rede confiável

## Status

Aceito.

## Contexto

O painel será acessado diretamente pelo IP da VPS na porta 80, sem TLS ou
domínio.

## Decisão

O sistema mantém HTTP e usa Nginx como único serviço publicado em `80:80`.
O acesso deve ocorrer por rede privada, VPN ou allowlist de IP no firewall.

## Consequências

Cookies não usam `Secure`, e credenciais podem ser interceptadas se a fronteira
de rede for violada. Nenhum código de aplicação elimina esse risco; mudanças
para TLS exigem ADR e atualização de `FINAL.MD`.
