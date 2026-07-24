# Threat model — Automações controladas

Referência: `FINAL.MD`, requisito `AUTO-01`.

## Escopo atual

O catálogo contém somente `runner-diagnostic`, um diagnóstico sem alteração de
arquivos, rede ou configuração. Ele fica indisponível enquanto
`AUTOMATIONS_ENABLED=false`.

## Ameaças e controles

| Ameaça                                                      | Controle implementado                                                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Comando, shell ou caminho arbitrário enviado pelo navegador | A API não aceita esses campos; executável, script e diretório de trabalho ficam fixos no código do servidor.               |
| Injeção por parâmetro                                       | Schema fechado aceita apenas `repeat` inteiro de 1 a 3; valores fora do catálogo são rejeitados.                           |
| Escalada via shell ou ambiente herdado                      | `spawn` usa `shell: false`, processo não-root do container, cwd fixo e ambiente mínimo.                                    |
| Processo travado ou saída excessiva                         | Timeout de 5 s, término por sinal e saída limitada a 8 KiB.                                                                |
| Segredos em logs e SSE                                      | Saída é sanitizada antes de persistência ou transmissão; caracteres de controle e padrões comuns de segredo são removidos. |
| Execução concorrente da mesma rotina                        | Há no máximo uma execução por item do catálogo.                                                                            |
| Execução não autorizada                                     | Sessão, CSRF, origem válida e feature flag são exigidos.                                                                   |

## Limites e revisão

Antes de adicionar qualquer nova automação, revisar este documento, definir
impacto, argumentos tipados, timeout, usuário de execução, diretório de
trabalho, saída e testes negativos. Rotinas que alterem estado devem exigir
confirmação reforçada e, se aplicável, uma nova verificação TOTP.
