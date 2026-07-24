# Segurança

Referência: `FINAL.MD`, Seção 6 e requisitos `AUTH-01`, `AUTH-02` e `SEC-01`.

## Fronteira de rede

O produto usa HTTP em `http://IP_DA_VPS:80`. HTTP não protege credenciais,
cookies ou dados em trânsito. A operação exige rede privada, VPN ou allowlist
de IP no firewall/security group. Se a porta estiver aberta para a Internet, o
risco de interceptação é residual e aceito pelo responsável.

## Estado implementado

O healthcheck público aplica headers básicos e não revela detalhes internos.

- senha com Argon2id, TOTP cifrado no banco e códigos de recuperação com hash;
- cookie opaco persistente, `HttpOnly`, `SameSite=Strict` e sem `Domain`;
- token de sessão armazenado somente como hash, com rotação periódica e janela
  curta para requisições concorrentes; reutilização posterior revoga a sessão;
- listagem e revogação de navegadores confiáveis pelo próprio administrador;
- mutações protegidas por CSRF e validação de `Origin`/`Referer`;
- HTTP não fornece confidencialidade: a VPS deve ficar atrás de VPN, rede
  privada ou allowlist de firewall.

## Arquivos

Uploads são transmitidos por streaming para temporário no volume privado, com
limite no proxy e no backend. O servidor usa nomes internos aleatórios, rejeita
traversal, confirma o espaço disponível e remove partes após falha. Download e
preview exigem sessão; preview é limitado a tipos permitidos e respostas usam
`nosniff` e `Content-Disposition` seguro.

## Automações

O runner só executa itens estáticos da allowlist, com `shell: false`, ambiente
mínimo, timeout, limite de saída, processo não-root e parâmetros tipados. O
detalhamento de ameaças e controles está em
[THREAT_MODEL_AUTOMATIONS.md](THREAT_MODEL_AUTOMATIONS.md).

## Headers e correlação

Nginx aplica CSP, `nosniff`, negação de framing, `Referrer-Policy` e
`Permissions-Policy`. A CSP bloqueia scripts inline; estilos inline são
permitidos exclusivamente para compatibilidade com renderização controlada do
Vue e Chart.js. Cada resposta da API inclui `X-Request-Id` e erros retornam o
mesmo identificador, sem stack trace ou payload interno.

## Regras permanentes

- nenhum segredo, cookie, token ou conteúdo privado em logs;
- validação de entradas e respostas de erro sem detalhes internos;
- volumes persistentes separados e conteúdo de arquivo fora da raiz pública;
- automações somente por catálogo allowlisted, nunca shell fornecido pelo cliente.
