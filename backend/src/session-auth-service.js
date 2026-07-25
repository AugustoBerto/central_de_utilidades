import { AuthService as BaseAuthService } from './auth-service.js';

/**
 * Adapta os metadados coletados pela tela de login para o contrato interno do
 * serviço de autenticação. O endereço é apenas informativo; autorização e
 * identificação continuam dependendo exclusivamente da sessão segura.
 */
export class AuthService extends BaseAuthService {
  login(payload = {}, clientMetadata = {}) {
    const { userAgent, ipAddress, ...credentials } = payload;
    return super.login(credentials, {
      userAgent,
      ipAddress,
      ...clientMetadata
    });
  }
}
