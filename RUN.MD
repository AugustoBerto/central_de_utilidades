# Execução em Ubuntu Server

Este guia instala o Painel de Utilidades em uma VPS Ubuntu acessada por
`http://IP_DA_VPS`. A arquitetura não usa domínio, TLS ou porta 443. Portanto,
restrinja a porta 80 a uma VPN, allowlist de IPs ou rede privada: HTTP não
protege credenciais contra interceptação.

## 1. Pré-requisitos

- Ubuntu Server LTS atualizado;
- usuário com `sudo` e acesso SSH por chave;
- Docker Engine e o plugin Docker Compose;
- porta 80 liberada somente para origens autorizadas.

Instale Docker seguindo a documentação oficial do Docker para Ubuntu. Depois
confirme:

```bash
docker --version
docker compose version
```

## 2. Preparar o diretório

```bash
sudo mkdir -p /opt/painel-utilidades
sudo chown "$USER":"$USER" /opt/painel-utilidades
cd /opt/painel-utilidades
```

Copie os arquivos do projeto para esse diretório sem incluir `.env`, bancos,
uploads, backups ou `node_modules` da máquina local.

## 3. Firewall

Exemplo com UFW: permita SSH antes de ativar o firewall e limite HTTP ao IP ou
rede administrativa.

```bash
sudo ufw allow OpenSSH
sudo ufw allow from 203.0.113.10 to any port 80 proto tcp
sudo ufw enable
sudo ufw status numbered
```

Substitua `203.0.113.10` pelo IP real ou configure uma faixa privada/VPN. Não
use uma regra pública ampla para dados sensíveis enquanto o acesso for HTTP.

## 4. Criar `.env`

```bash
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
openssl rand -hex 32
```

Use as duas saídas, distintas, em `APP_ENCRYPTION_KEY` e `BOOTSTRAP_TOKEN`.
Edite com um editor local do servidor, sem publicar nem enviar esses valores:

```dotenv
NODE_ENV=production
APP_ENCRYPTION_KEY=primeira_saida_aleatoria
BOOTSTRAP_TOKEN=segunda_saida_aleatoria
COOKIE_SECURE=false
SYSTEM_METRICS_MODE=container
METRICS_SAMPLE_INTERVAL_SECONDS=5
METRICS_RETENTION_HOURS=24
ALLOW_HTTP_SHORTCUTS=false
AUTOMATIONS_ENABLED=false
```

Principais variáveis:

| Variável | Uso |
| --- | --- |
| `APP_ENCRYPTION_KEY` | Cifra o segredo TOTP; guarde também fora da VPS. |
| `BOOTSTRAP_TOKEN` | Autoriza somente o primeiro cadastro; remover após uso. |
| `COOKIE_SECURE` | Deve permanecer `false` nesta arquitetura HTTP. |
| `MAX_UPLOAD_BYTES` | Limite por arquivo; padrão de 2 GiB. |
| `SYSTEM_METRICS_MODE` | Em Compose, use `container` para não declarar métricas do host. |
| `AUTOMATIONS_ENABLED` | Só use `true` após revisão operacional; também mostra a aba. |

Não altere `DATABASE_PATH`, `FILES_DIR` ou `TEMP_UPLOAD_DIR` no Compose: os
volumes persistentes são configurados pelo serviço.

## 5. Subir e verificar

```bash
docker compose config
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:80/api/health
```

Somente o Nginx deve mostrar `0.0.0.0:80->80/tcp`. Backend, SQLite e volumes
não podem ter porta publicada.

## 6. Primeiro acesso

1. Acesse `http://IP_DA_VPS` de uma origem permitida.
2. Use o valor de `BOOTSTRAP_TOKEN` para criar o administrador e uma senha forte.
3. Cadastre o TOTP em um autenticador.
4. Guarde os códigos de recuperação fora da VPS; eles só são exibidos uma vez.
5. Remova o token do `.env` (`BOOTSTRAP_TOKEN=`) e recrie os containers:

```bash
docker compose up -d --force-recreate
```

O navegador autenticado permanece conectado por cookie persistente. Novos
navegadores exigem senha e TOTP.

## 7. Operação

Logs e saúde:

```bash
docker compose logs --tail=200 backend nginx
curl -fsS http://127.0.0.1:80/api/health
```

Backup criptografado antes de atualizações:

```bash
BACKUP_PASSPHRASE='segredo-fora-do-env' ./scripts/backup.sh /caminho/protegido
```

Mantenha o arquivo e a passphrase separados, preferencialmente fora da VPS.
O restore substitui banco e arquivos, exige confirmação textual e só deve ser
executado a partir de um backup verificado.

## 8. Atualização e rollback

```bash
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:80/api/health
```

Em falha, volte para a revisão/imagem anterior e execute novamente o Compose.
Restaure dados apenas se necessário, com `scripts/restore.sh --replace` e um
backup criptografado validado. Nunca use `docker compose down -v` em produção:
isso remove os volumes persistentes.
