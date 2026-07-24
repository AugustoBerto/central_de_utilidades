# Deploy

Referência: `FINAL.MD`, requisitos `NET-01` e `OPS-01`.

1. Defina `.env` a partir de `.env.example` com valores fortes para
   `APP_ENCRYPTION_KEY` e `BOOTSTRAP_TOKEN`; mantenha
   `COOKIE_SECURE=false` devido ao HTTP e `AUTOMATIONS_ENABLED=false` até a
   revisão operacional.
2. Restrinja a porta 80 à rede ou IPs autorizados no firewall/security group.
3. Execute `docker compose config` e `docker compose up -d --build`.
4. Confirme `curl -fsS http://localhost:80/api/health` a partir de uma origem
   permitida.
5. Depois do bootstrap, configure TOTP, guarde recovery codes fora da VPS e
   remova o valor de `BOOTSTRAP_TOKEN` do `.env` antes da próxima inicialização.
6. Faça um backup criptografado antes de qualquer atualização:

   ```bash
   BACKUP_PASSPHRASE='valor fora do .env' ./scripts/backup.sh /caminho/seguro
   ```

7. Atualizações usam `docker compose up -d --build`. Em falha, restaure a imagem
   anterior e, somente se necessário, execute o script de restauração com um
   backup verificado.

Não publique backend, SQLite ou volumes diretamente. O arquivo de backup deve
ser mantido fora da VPS ou em armazenamento protegido; a passphrase nunca deve
acompanhar o arquivo.
