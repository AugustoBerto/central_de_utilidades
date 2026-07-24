# Painel de Utilidades Privado

Painel operacional autohospedado.
O acesso é por `http://IP_DA_VPS` e pressupõe rede privada, VPN ou allowlist de
IP no firewall.

## Desenvolvimento local

```bash
cp .env.example .env
npm install
npm run dev --workspace backend
```

Em outro terminal:

```bash
npm run dev --workspace frontend
```

O frontend Vite responde em `http://localhost:5173` e encaminha `/api` para o
backend em `http://localhost:3000`. O healthcheck é `GET /api/health`.

## Qualidade

```bash
npm run lint
npm test
npm run build
```

## Containers

Com Docker Engine disponível:

```bash
cp .env.example .env
# Defina APP_ENCRYPTION_KEY e BOOTSTRAP_TOKEN antes do primeiro deploy.
docker compose config
docker compose up -d --build
curl -fsS http://localhost:80/api/health
```

Nginx é o único serviço publicado (`80:80`). Não exponha a porta 80 fora da
rede confiável definida no plano.

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Segurança](docs/SECURITY.md)
- [Deploy](docs/DEPLOY.md)
- [Operação](docs/OPERATIONS.md)
