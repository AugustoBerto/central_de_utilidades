import { AuthService as BaseAuthService } from './auth-service.js';

/**
 * Adapta os metadados observados pelo servidor para o contrato interno do
 * serviço de autenticação. Campos equivalentes enviados no payload são
 * descartados para que a sessão não registre dados controlados pelo cliente.
 */
export class AuthService extends BaseAuthService {
  login(payload = {}, clientMetadata = {}) {
    const credentials = { ...payload };
    delete credentials.userAgent;
    delete credentials.ipAddress;
    return super.login(credentials, clientMetadata);
  }
}
