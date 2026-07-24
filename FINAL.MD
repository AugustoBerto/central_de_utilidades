# Painel de Utilidades Privado — Plano Final do Projeto

> **Documento mestre do projeto.** Esta é a fonte única de verdade para produto,
> UX, arquitetura, segurança, desenvolvimento, implantação e aceite. Todo
> arquivo, código, contrato, teste e documento criado no projeto deverá seguir
> este plano ou registrar formalmente a alteração deste plano.

## 0. Mapa e governança do plano

### 0.1 Identificação do documento

| Campo | Valor |
| --- | --- |
| Documento | `FINAL.MD` |
| Papel | Estrutura-mãe e fonte única de verdade do projeto |
| Status | Aprovado para orientar a implementação |
| Versão base | 1.0 |
| Responsável | Administrador do projeto |
| Última revisão | 21 de julho de 2026 |
| Escopo | Produto novo, desenvolvido integralmente do zero |

### 0.2 Como utilizar este documento

- antes de iniciar uma tarefa, localizar o requisito, a fase e o critério de
  aceite correspondentes;
- implementar somente depois de confirmar dependências e restrições;
- atualizar este arquivo no mesmo conjunto de mudanças sempre que houver
  alteração de escopo, contrato, segurança, infraestrutura ou aceite;
- usar documentos auxiliares para aprofundar decisões, nunca para contradizer
  este plano;
- registrar decisões irreversíveis ou de alto impacto em ADRs dentro de
  `docs/decisions/` e referenciá-las aqui;
- considerar uma fase concluída somente quando seu gate e os testes associados
  tiverem evidência verificável.

### 0.3 Navegação rápida

| Seção | Conteúdo | Uso principal |
| --- | --- | --- |
| [1](#1-introdução) | Introdução | Objetivo, conceito, premissas e escopo |
| [2](#2-princípios-de-produto-e-experiência) | Produto e experiência | Regras de usabilidade e identidade visual |
| [3](#3-arquitetura-da-informação-e-navegação) | Navegação da aplicação | Rotas, layout e comportamentos globais |
| [4](#4-especificação-detalhada-do-frontend) | Frontend | Telas, interações, estados e integrações |
| [5](#5-desenvolvimento-e-tecnologias) | Desenvolvimento | Arquitetura, stack, estrutura e contratos |
| [6](#6-segurança-privacidade-e-confiabilidade) | Segurança | Autenticação, rede, arquivos e riscos técnicos |
| [7](#7-fases-de-desenvolvimento) | Execução | Ordem de implementação e gates |
| [8](#8-fases-de-implantação) | Implantação | Desenvolvimento, homologação e produção |
| [9](#9-estratégia-de-qualidade) | Qualidade | Testes, UX e performance |
| [10](#10-critérios-de-aceite-finais) | Aceite | Condições obrigatórias de conclusão |
| [11](#11-validações-técnicas-obrigatórias) | Validação | Comandos e cenários de verificação |
| [12](#12-riscos-e-mitigação) | Riscos | Ameaças, impactos e respostas |
| [13](#13-entregáveis) | Entregáveis | Artefatos obrigatórios |
| [14](#14-conclusão) | Conclusão | Resultado esperado |
| [15](#15-apêndice-de-rastreabilidade) | Apêndice de rastreabilidade | Relação entre requisito, fase e aceite |

### 0.4 Regras de mudança e precedência

1. `FINAL.MD` prevalece sobre README, comentários, issues e documentos
   auxiliares quando houver divergência.
2. Segurança, persistência, limite de upload e exposição de rede não podem ser
   alterados implicitamente durante uma implementação.
3. Toda alteração relevante deve informar motivação, impacto, migração,
   rollback e critérios de aceite atualizados.
4. Um ADR aprovado pode motivar uma mudança, mas a mudança só se torna regra
   após ser incorporada neste documento.
5. Itens fora do escopo entram primeiro no backlog; não são adicionados ao
   código como melhoria oportunista.

## 1. Introdução

### 1.1 Objetivo

Projetar e construir do zero um painel operacional privado, autohospedado em
uma VPS, que reúna em uma única interface as ferramentas mais frequentes do
administrador:

- monitoramento de recursos e saúde do ambiente;
- notas rápidas para registro de contexto operacional;
- Drive pessoal para armazenamento e recuperação de arquivos;
- atalhos para sistemas e páginas recorrentes;
- automações previamente cadastradas, controladas e auditáveis.

O objetivo não é criar apenas um dashboard visual, mas uma ferramenta de
trabalho confiável. A interface deve reduzir troca de contexto, tornar ações
recorrentes rápidas e apresentar com clareza o estado de cada operação. Como o
uso será contínuo, usabilidade, previsibilidade, acessibilidade e recuperação
de erros são requisitos centrais, não refinamentos opcionais.

### 1.2 Conceito do produto

O produto será uma **central operacional pessoal** com estética Dark moderna,
minimalista e inspirada na clareza visual do GitHub, acessível por desktop,
tablet e celular. Sua organização seguirá quatro áreas principais:

1. **Visão geral:** saúde, métricas e eventos relevantes da VPS;
2. **Conhecimento rápido:** captura, organização e consulta de notas;
3. **Arquivos:** upload, navegação, preview, download e exclusão segura;
4. **Ações:** atalhos e, em fase controlada, execução de automações permitidas.

A solução parte de um único administrador, sem cadastro público,
compartilhamento ou edição colaborativa. A arquitetura, porém, deverá manter
fronteiras claras entre interface, regras de negócio e persistência, evitando
decisões que impeçam evolução futura.

### 1.3 Premissas e decisões fundamentais

Este documento define um produto integralmente novo. Repositório, arquivos,
documentos, modelos, APIs, testes e código serão criados do zero. As decisões
fundamentais são:

- o backend de referência é **Node.js LTS + Express**, eliminando o placeholder
  de tecnologia presente no briefing do novo frontend;
- a autenticação utiliza sessão opaca persistente por navegador em cookie
  `HttpOnly` e `SameSite=Strict`, e nunca JWT salvo no navegador;
- Pinia e Vue Router serão adotados para estado transversal e navegação; estado
  exclusivamente local continua no componente ou em composables específicos;
- a primeira versão do Drive será plana; pastas e breadcrumbs dependem de
  extensão explícita do modelo e da API e entram como evolução incremental;
- notas em Markdown, categorias e tags exigem atualização do contrato e do
  banco; conteúdo Markdown será sanitizado e terá modo de edição e preview
  claramente separados;
- métricas devem começar com polling autenticado; SSE será adotado somente
  quando a atualização contínua trouxer benefício medido. WebSocket fica
  reservado para comunicação realmente bidirecional;
- execução de scripts nunca aceitará comandos shell livres enviados pelo
  frontend. Somente automações cadastradas no servidor, com parâmetros
  validados, limites e auditoria, poderão ser acionadas;
- a autenticação inicial de cada navegador exige credenciais fortes e segundo
  fator; depois disso, uma sessão de dispositivo renovável mantém o acesso sem
  solicitar login a cada visita, com opção de revogação;
- a aplicação é acessada diretamente por `http://IP_DA_VPS` na porta 80, sem
  domínio, TLS ou porta 443;
- Nginx é o único serviço publicado; frontend, backend, banco e arquivos
  permanecem isolados na rede interna do Compose;
- a rede entre navegador e VPS é uma fronteira de confiança obrigatória. O
  acesso deve ocorrer por rede privada, VPN ou allowlist de IP no firewall;
- todos os componentes serão implementados com contratos, segurança e testes
  definidos neste documento.

### 1.4 Escopo funcional consolidado

#### Escopo base

- primeiro login por navegador, restauração de sessão persistente, gestão de
  dispositivos confiáveis, logout e revogação;
- layout autenticado responsivo com sidebar, header e status global;
- dashboard de métricas da origem efetivamente monitorada;
- CRUD e organização de notas;
- upload, listagem, preview compatível, download e exclusão de arquivos;
- CRUD, ordenação e abertura segura de atalhos;
- feedback consistente de carregamento, sucesso, erro e estado vazio;
- persistência, backup, restauração, logs operacionais e healthcheck.

#### Expansões controladas

- árvore de diretórios no Drive;
- atualização em tempo real por SSE;
- editor e preview Markdown;
- categorias, tags, filtros e busca de notas;
- catálogo e execução auditável de automações;
- métricas reais do host quando a aplicação estiver em containers.

#### Fora do escopo inicial

- cadastro público e múltiplos usuários;
- compartilhamento público de arquivos;
- edição colaborativa e sincronização desktop/mobile;
- terminal web ou envio de comandos arbitrários ao servidor;
- editor de scripts pelo navegador;
- observabilidade de alta escala e otimização para alta concorrência;
- pré-visualização universal de documentos e mídia.

## 2. Princípios de produto e experiência

### 2.1 Princípios de usabilidade

1. **A ação principal deve ser evidente:** cada tela terá um CTA primário e
   ações secundárias visualmente subordinadas.
2. **O sistema sempre informa seu estado:** carregamento, progresso, sucesso,
   indisponibilidade e erro devem ser explícitos.
3. **Ações destrutivas são reversíveis quando possível:** usar confirmação
   contextual; para exclusões críticas, considerar lixeira ou período de
   retenção antes da remoção definitiva.
4. **O teclado é um caminho de primeira classe:** foco visível, ordem lógica,
   atalhos documentados e modais com contenção e devolução de foco.
5. **O contexto do usuário deve ser preservado:** filtros, ordenação, página e
   item selecionado não devem desaparecer após uma atualização de dados.
6. **O tempo percebido importa:** skeletons, atualizações otimistas seguras e
   progresso real substituem telas bloqueadas ou spinners indefinidos.
7. **Erros devem orientar a correção:** mensagens indicam o que ocorreu, o que
   foi preservado e qual é a próxima ação possível.
8. **Densidade é adaptável:** desktop privilegia produtividade; mobile mantém
   as mesmas capacidades essenciais com apresentação simplificada.

### 2.2 Direção visual

- tema único **Modern GitHub Dark**, com referência na hierarquia, densidade e
  legibilidade do GitHub, sem copiar sua identidade ou seus componentes;
- fundo principal próximo de `#0d1117`, superfícies em `#161b22`, áreas
  interativas em `#21262d` e bordas em `#30363d`;
- texto principal claro próximo de `#f0f6fc`, texto secundário em cinza frio e
  azul como acento primário para links, foco e ações;
- sucesso, atenção e erro usam verde, âmbar e vermelho frios, sempre combinados
  com ícone e texto para não depender apenas de cor;
- bordas de 1 px, raios moderados (`rounded-md`/`rounded-lg`) e sombras
  discretas; evitar o aspecto excessivamente arredondado ou “fofo”;
- superfícies planas e bem delimitadas, sem gradientes decorativos e sem
  excesso de cards aninhados;
- tipografia legível, números tabulares para métricas e escala consistente;
- ícones Lucide acompanhados de texto quando a ação não for universal;
- transições entre 150 e 250 ms, respeitando `prefers-reduced-motion`;
- contraste mínimo WCAG AA e foco visível em todos os controles.

### 2.3 Tokens e componentes fundamentais

Os tokens de cor, espaçamento, raio, sombra, tipografia, duração e `z-index`
serão definidos no tema do Tailwind e expostos por variáveis CSS. Isso permite
ajuste global do tema sem estilos isolados por tela.

Componentes-base previstos:

- `AppButton`, `AppIconButton`, `AppInput`, `AppTextarea`, `AppSelect`;
- `AppModal`, `AppDrawer`, `AppDropdown`, `AppTooltip`;
- `AppCard`, `AppBadge`, `AppTable`, `AppPagination`;
- `AppToast`, `InlineAlert`, `EmptyState`, `LoadingSkeleton`;
- `ConfirmDialog`, `ProgressBar`, `StatusIndicator`;
- `CommandPalette` como evolução posterior, caso atalhos de teclado demonstrem
  valor operacional.

Esses componentes encapsularão estados de foco, erro, desabilitado e
carregamento. Telas de domínio não deverão recriar esses comportamentos.

## 3. Arquitetura da informação e navegação

### 3.1 Rotas

| Rota | Tela | Proteção | Objetivo principal |
| --- | --- | --- | --- |
| `/login` | Login | Pública | Autenticar um navegador novo ou revogado |
| `/dashboard` | Visão geral | Autenticada | Acompanhar saúde e métricas |
| `/notes` | Notas | Autenticada | Capturar e recuperar informação |
| `/drive` | Drive | Autenticada | Organizar e acessar arquivos |
| `/shortcuts` | Atalhos | Autenticada | Gerenciar acessos frequentes |
| `/automations` | Automações | Autenticada e habilitada por configuração | Executar ações permitidas |
| `/settings` | Preferências | Autenticada | Preferências locais e informações da sessão |

`/` redirecionará para `/dashboard` quando houver sessão e para `/login` quando
ela não for válida. Rotas inexistentes apresentarão uma tela 404 interna com
retorno seguro à última rota válida.

### 3.2 Layout base

#### Desktop

- sidebar retrátil à esquerda, com ícone, rótulo, rota ativa e tooltip quando
  recolhida;
- header com título/contexto da página, atalhos fixados, indicador de saúde e
  menu da sessão;
- área de conteúdo com largura fluida e limites adequados para leitura;
- status geral discreto no rodapé, sem duplicar alertas críticos do header.

#### Tablet e mobile

- sidebar transformada em drawer acionado pelo header;
- ações da página condensadas em barra contextual ou menu, sem esconder o CTA
  principal;
- tabelas convertidas em listas ou cards quando a leitura horizontal degradar;
- áreas clicáveis de no mínimo 44 x 44 px;
- upload por seletor de arquivos continua disponível quando drag-and-drop não
  for adequado;
- gráficos apresentam resumo textual e intervalo reduzido.

### 3.3 Comportamentos globais

- o bootstrap chama `/api/auth/me` antes de decidir a rota final;
- o cookie persistente restaura a sessão mesmo depois de fechar e reabrir o
  navegador, sem copiar o token para qualquer storage acessível ao JavaScript;
- uma resposta `401` limpa o estado em memória e conduz ao login com motivo
  compreensível: sessão revogada, expirada ou dispositivo não reconhecido;
- requisições mutáveis incluem proteção CSRF conforme o contrato do backend;
- toasts são usados para confirmações transitórias; erros que bloqueiam uma
  área permanecem inline até resolução;
- operações longas continuam visíveis mesmo após troca de tela, por meio de
  uma central de atividades compacta;
- indisponibilidade de métricas não impede o uso de notas, Drive ou atalhos.

## 4. Especificação detalhada do frontend

### 4.1 Login e ciclo de sessão

#### Interface

- formulário centralizado com identidade do produto, usuário, senha, alternância
  de visibilidade e botão de entrada;
- campo para código TOTP no primeiro acesso e em todo navegador novo, além de
  suporte a um código de recuperação de uso único;
- mensagem explícita de que aquele navegador permanecerá autenticado até a
  sessão ser revogada, expirar por política ou o usuário encerrar a sessão;
- validação após interação com o campo e no envio, sem revelar se um usuário
  específico existe;
- botão apresenta progresso e impede duplo envio;
- erro de credencial é exibido no formulário; falha de rede oferece tentativa
  novamente sem apagar os campos;
- o foco inicial, preenchimento por gerenciador de senhas e envio por Enter
  devem funcionar corretamente.

#### Estado e integração

- `authStore` mantém somente usuário, status da sessão e timestamps úteis;
- cookie persistente de sessão permanece inacessível ao JavaScript e não é
  removido ao fechar o navegador;
- navigation guard aguarda a restauração de sessão uma única vez;
- logout chama o backend, limpa stores sensíveis e substitui o histórico pela
  rota de login;
- nenhuma credencial, sessão ou resposta sensível vai para `localStorage`,
  telemetria ou logs do console.

#### Primeiro acesso e navegador confiável

- se ainda não existir administrador, o sistema entra em modo de bootstrap e
  exige um token de instalação de uso único obtido diretamente no servidor;
- o administrador cria uma senha forte, registra TOTP em um aplicativo
  autenticador e recebe códigos de recuperação mostrados uma única vez;
- um novo navegador autentica com senha e TOTP; após sucesso, o backend cria
  uma sessão de dispositivo persistente;
- visitas futuras usam essa sessão automaticamente, inclusive após reiniciar o
  navegador ou a máquina cliente;
- a tela de preferências lista sessões confiáveis por rótulo, criação, último
  uso e origem de rede resumida, permitindo revogar uma ou todas;
- troca de senha, uso de código de recuperação, detecção de reutilização de
  token ou incidente de segurança revogam as sessões definidas pela política;
- ações de alto risco, como automações críticas, podem exigir confirmação TOTP
  sem encerrar a sessão normal.

### 4.2 Dashboard de monitoramento

#### Conteúdo

- resumo de saúde: disponível, degradado, indisponível ou origem desabilitada;
- cards de CPU, memória, disco, rede, uptime e conexões;
- gráficos de série temporal com período visível e unidade consistente;
- horário da última leitura e identificação clara da origem: host, container ou
  coletor externo;
- alertas recentes e links para a área relacionada, quando houver dados.

#### Interação

- primeira versão usa polling configurável, pausado quando a aba fica oculta;
- botão de atualização manual informa a hora da leitura concluída;
- falha parcial preserva o último valor válido, identifica-o como desatualizado
  e tenta novamente com backoff;
- tooltips dos gráficos são acessíveis por teclado e há resumo textual;
- gráficos são carregados sob demanda para não penalizar o primeiro acesso.

#### Contrato

`GET /api/system/metrics` deverá retornar envelope versionável com `source`,
`collectedAt`, unidades e métricas disponíveis. Dados ausentes devem ser `null`
ou omitidos conforme contrato, nunca simulados como zero.

SSE poderá ser introduzido em `/api/system/metrics/stream` após validação de
proxy, reconexão, limites de conexão e ganho real de experiência. Se o backend
estiver em Docker, o painel deverá dizer que mede o container; métricas do host
exigem coletor dedicado e permissão mínima.

### 4.3 Notas rápidas

#### Experiência

- mural responsivo com busca, filtro por categoria/tag e ordenação;
- criação rápida preservando o rascunho em memória durante a sessão;
- edição em drawer ou tela dedicada, evitando modais apertados no mobile;
- título opcional, corpo, categoria, tags, data de atualização e indicador de
  alterações não salvas;
- preview Markdown separado da edição e sanitizado antes da renderização;
- exclusão com confirmação que exibe o título e informa se há recuperação;
- estados vazios diferentes para “nenhuma nota” e “nenhum resultado no filtro”.

#### Regras

- salvar por ação explícita no MVP; autosave só será habilitado com indicador
  confiável de estado e tratamento de conflito;
- busca e filtros utilizam debounce e parâmetros na URL para permitir retorno
  ao contexto;
- conteúdo nunca será interpretado como HTML bruto;
- limites de título, corpo, quantidade/tamanho de tags serão compartilhados
  entre interface e validação da API.

#### Extensões necessárias

O CRUD atual cobre listagem, criação e exclusão. A edição e os novos metadados
exigem `GET /api/notes/:id` e `PATCH /api/notes/:id`, além de migração para
`title`, `category_id` e relacionamento de tags. A entrega pode ser dividida:

1. mural usando o contrato atual;
2. edição de conteúdo;
3. categorias, tags, filtros e Markdown.

### 4.4 Drive pessoal

#### Experiência principal

- zona de drag-and-drop acompanhada de botão “Selecionar arquivos”;
- fila de uploads com nome, tamanho, progresso real, estado, cancelamento e
  repetição individual;
- lista/tabela com nome, tipo, tamanho, modificação e ações contextuais;
- busca, ordenação e seleção múltipla quando as operações em lote existirem;
- preview autenticado somente para tipos permitidos, com fallback informativo;
- download explícito, exclusão confirmada e mensagens específicas para falta
  de espaço, limite excedido e conexão interrompida;
- conflito de nomes é tratado pelo servidor por ID/nome interno, sem
  sobrescrita silenciosa.

#### Pastas e breadcrumbs

Como o modelo atual não possui diretórios, a entrega será incremental:

- **Etapa A:** Drive plano, com busca e ordenação;
- **Etapa B:** diretórios virtuais no banco, raiz fixa e `parent_id`;
- **Etapa C:** breadcrumbs, criação/renomeação/movimentação de pasta e arquivo;
- **Etapa D:** operações em lote e lixeira, após definição transacional.

Breadcrumbs só serão exibidos quando a API representar uma hierarquia real.
Não se deve simular pastas apenas no cliente.

#### Upload robusto

- streaming do navegador ao backend, sem armazenar o arquivo inteiro em memória;
- limite de 2 GiB aplicado no Nginx e novamente no backend;
- arquivo temporário, cálculo de tamanho e promoção atômica ao destino final;
- remoção de partes após falha ou cancelamento;
- nomes internos aleatórios e conteúdo fora do diretório público;
- `AbortController` no frontend para cancelamento;
- upload recomeçável/chunked fica fora do MVP e requer protocolo próprio.

### 4.5 Atalhos

- grid/lista responsiva com ícone, rótulo, URL, grupo e ordem;
- criação e edição com validação de `https` e, quando habilitado, `http`;
- abertura em nova aba com `noopener,noreferrer`;
- reordenação acessível por botões e teclado, mesmo que drag-and-drop também
  exista;
- atalhos fixados podem aparecer no header, respeitando limite visual;
- favicon remoto não será buscado pelo backend sem política contra SSRF; o MVP
  usará ícones locais escolhidos de uma lista permitida.

### 4.6 Automações e scripts

Esta é a área de maior risco e será separada dos atalhos visuais. Sua liberação
dependerá de revisão de segurança e feature flag desabilitada por padrão.

#### Modelo seguro

- scripts ficam instalados e registrados no servidor, fora do banco e fora da
  edição pelo navegador;
- o banco armazena catálogo, descrição, parâmetros permitidos e histórico, mas
  não comandos livres;
- cada automação possui identificador, executável/caminho permitido, argumentos
  tipados, timeout, diretório de trabalho fixo e política de concorrência;
- execução ocorre com usuário sem privilégio, ambiente mínimo, sem shell
  intermediário e sem interpolação de entrada;
- parâmetros são validados contra schema e segredos não são passados pela UI;
- saída tem limite, redaction de segredos e política de retenção;
- ações críticas exigem confirmação reforçada e podem exigir nova validação de
  sessão;
- uma allowlist define quais automações podem ser executadas.

#### Interface

- catálogo com finalidade, impacto, última execução e disponibilidade;
- formulário gerado a partir do schema de parâmetros;
- modal/drawer de confirmação que resume exatamente a ação;
- painel de execução com status `queued`, `running`, `succeeded`, `failed`,
  `timed_out` ou `cancelled`;
- logs incrementais por SSE, com opção de copiar/baixar somente conteúdo já
  sanitizado;
- histórico auditável com início, duração, resultado e usuário/origem.

#### API proposta

- `GET /api/automations` — lista catálogo autorizado;
- `POST /api/automations/:id/runs` — valida parâmetros e cria execução;
- `GET /api/automation-runs/:runId` — consulta estado e resumo;
- `GET /api/automation-runs/:runId/events` — stream SSE autenticado;
- `POST /api/automation-runs/:runId/cancel` — solicita cancelamento quando
  permitido.

O endpoint jamais receberá `command`, `shell` ou caminho arbitrário.

### 4.7 Preferências e status operacional

- preferências não sensíveis, como sidebar recolhida e densidade, podem ser
  persistidas localmente;
- a tela de preferências informa versão da interface, origem das métricas,
  validade aproximada da sessão e modo de conexão;
- o status global combina healthcheck dos serviços conhecidos, sem transformar
  falhas opcionais em indisponibilidade total;
- detalhes técnicos e IDs de correlação podem ser copiados, mas stack traces e
  segredos nunca aparecem para o usuário.

## 5. Desenvolvimento e tecnologias

### 5.1 Arquitetura de conexão e execução

```text
Navegador autorizado
       │
       │ HTTP em rede confiável
       ▼
http://IP_DA_VPS:80
       │
       ▼
Nginx :80
  ├── /       → bundle estático do Frontend Vue 3
  └── /api/*  → Backend Node.js/Express :3000 (rede interna)
                        ├── SQLite em volume persistente
                        └── arquivos em volume persistente separado
```

#### Regras de exposição

- o host publica exclusivamente `80:80` para a aplicação;
- backend, frontend de build, SQLite e volumes não publicam portas próprias;
- o endereço de uso é `http://IP_DA_VPS`, sem hostname obrigatório;
- Nginx encaminha `/api` para o backend e entrega o bundle do frontend;
- em produção não existe servidor Vite nem processo Node para o frontend: o
  build é copiado para a imagem do Nginx em estágio multi-stage;
- o firewall da VPS permite a porta 80 somente das origens que realmente
  utilizarão o painel, sempre que os endereços clientes forem previsíveis;
- SSH não compartilha credenciais com o painel, usa chave e deve ter regra de
  acesso própria;
- `trust proxy` no Express será configurado para exatamente um proxy interno,
  evitando confiança em headers forjados pelo cliente;
- healthcheck externo usa `GET /api/health`; detalhes internos de saúde ficam
  em rota autenticada.

#### Limite de segurança do HTTP

HTTP não fornece confidencialidade, integridade de transporte nem autenticação
do servidor. Quem conseguir observar ou alterar o tráfego entre navegador e
VPS poderá capturar senha, TOTP, cookie persistente, notas e arquivos. Argon2id,
TOTP, `HttpOnly`, CSRF e rate limiting continuam necessários, mas não eliminam
esse risco de rede.

Por isso, “VPS privada” significa, para este projeto, que o caminho de rede é
controlado por pelo menos um destes meios:

1. rede privada entre cliente e VPS;
2. VPN usada antes de abrir `http://IP_DA_VPS`;
3. firewall/security group com allowlist dos IPs clientes.

Se a porta 80 ficar aberta para toda a Internet, o risco de interceptação e
sequestro de sessão será formalmente aceito pelo responsável, pois a aplicação
não consegue corrigi-lo apenas com código de autenticação.

### 5.2 Stack consolidada

| Camada | Tecnologia | Papel |
| --- | --- | --- |
| Frontend | Vue 3, Composition API, `<script setup>` | Interface modular e reativa |
| Build | Vite | Desenvolvimento e bundle de produção |
| Navegação | Vue Router | Rotas, layouts e guards |
| Estado | Pinia + composables | Sessão, atividades e estados de domínio |
| Estilo | Tailwind CSS + variáveis CSS | Design system e responsividade |
| Ícones | Lucide Vue | Iconografia consistente |
| Gráficos | Chart.js com wrapper Vue, carregado sob demanda | Séries de métricas |
| Backend | Node.js LTS + Express | API REST, sessão, streaming e regras |
| Banco | SQLite + `better-sqlite3`, modo WAL | Metadados e sessões |
| Arquivos | Volume persistente fora da raiz pública | Conteúdo do Drive |
| Proxy | Nginx | Entrada HTTP na porta 80, frontend, API e limites |
| Execução | Docker Compose | Serviços, rede e volumes |
| Testes | Vitest, Vue Test Utils e testes HTTP de integração | Regressão e contratos |

Chart.js é escolhido como padrão por integração madura e bundle controlável.
Outra biblioteca só deverá substituí-lo após protótipo comparar acessibilidade,
tamanho e manutenção. Dependências e imagens serão fixadas em versões
reproduzíveis.

### 5.3 Estrutura inicial do novo repositório

O projeto começa com a criação desta árvore de arquivos:

```text
painel-utilidades/
├── backend/                 # API, domínio, migrações e testes
├── frontend/                # aplicação Vue, design system e testes
├── nginx/                   # proxy HTTP, limites e headers
├── scripts/                 # backup, restore, deploy e tarefas operacionais
├── docs/
│   ├── decisions/           # ADRs numerados e imutáveis após aprovação
│   ├── ARCHITECTURE.md      # decisões e diagramas
│   ├── API.md               # contratos HTTP e SSE
│   ├── SECURITY.md          # autenticação, ameaças e resposta
│   ├── UX.md                # fluxos, tokens e padrões de interação
│   ├── DEPLOY.md            # instalação, atualização e rollback
│   └── OPERATIONS.md        # backup, restore e diagnóstico
├── data/                    # somente runtime; ignorado pelo Git
├── backups/                 # somente runtime; ignorado pelo Git
├── .env.example             # nomes e descrições, nunca segredos reais
├── .gitignore
├── AGENTS.md                # instruções operacionais compactas para agentes
├── docker-compose.yml
├── FINAL.MD                 # documento mestre do projeto
├── package.json             # workspace npm
└── README.md
```

O primeiro commit deverá conter apenas scaffolding reproduzível, documentação
inicial, configurações de qualidade e exemplos seguros. Banco real, uploads,
chaves TOTP, tokens, `.env`, logs, builds e dependências
instaladas nunca serão versionados.

### 5.4 Organização sugerida do frontend

```text
frontend/src/
├── app/                 # bootstrap, router, providers e estilos globais
├── assets/
├── components/
│   ├── base/            # design system reutilizável
│   └── layout/          # sidebar, header, footer e activity center
├── features/
│   ├── auth/
│   ├── dashboard/
│   ├── notes/
│   ├── drive/
│   ├── shortcuts/
│   └── automations/
├── services/            # cliente HTTP, erros, CSRF e contratos
├── stores/              # estado global estritamente necessário
├── composables/         # comportamentos reutilizáveis
├── types/               # tipos e DTOs do frontend
└── views/               # composição das páginas por rota
```

Cada feature deverá concentrar componentes, serviço, tipos e testes do domínio.
Componentes de página orquestram; componentes menores recebem dados e emitem
eventos, sem chamar APIs de modo implícito.

### 5.5 Estado e comunicação com a API

- `authStore`: sessão e bootstrap;
- `uiStore`: sidebar, activity center e preferências globais;
- stores de domínio apenas quando dados precisarem sobreviver entre rotas;
- cliente HTTP centralizado com `credentials: include`, timeout apropriado,
  normalização de erros e ID de correlação;
- cancelamento de requests ao desmontar telas quando a resposta não tiver mais
  consumidor;
- tipos de DTO separados dos modelos visuais para evitar acoplamento;
- paginação, filtro e ordenação executados no backend quando o volume crescer;
- cache curto e invalidação explícita após mutações, sem mostrar informação
  obsoleta como atual.

### 5.6 Backend e contratos

#### Endpoints principais a implementar

- `GET /api/health`;
- `GET /api/setup/status` e `POST /api/setup/initialize`, disponíveis somente
  enquanto não houver administrador e protegidos pelo token de bootstrap;
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`;
- `GET /api/auth/csrf` para inicializar a proteção de mutações;
- `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id` e
  `POST /api/auth/sessions/revoke-others` para gerenciar navegadores confiáveis;
- `GET /api/system/metrics`;
- `GET/POST /api/files`, preview, download e exclusão por ID;
- `GET/POST/PATCH/DELETE /api/notes`;
- `GET/POST/PATCH/DELETE /api/shortcuts`.

#### Extensões incrementais

- endpoints/relacionamentos de tags e categorias;
- paginação, busca e ordenação padronizadas em arquivos e notas;
- CRUD de diretórios e movimentação para a fase hierárquica do Drive;
- stream SSE de métricas caso polling se torne insuficiente;
- catálogo, execução e eventos de automações conforme modelo seguro.

Todos os contratos terão schema de entrada e saída, códigos HTTP consistentes e
um formato de erro como:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revise os campos indicados.",
    "fields": { "title": "O título excede o limite permitido." },
    "requestId": "..."
  }
}
```

Mensagens de domínio podem ser apresentadas ao usuário; detalhes internos ficam
somente em logs sanitizados.

### 5.7 Modelo de dados evolutivo

Tabelas iniciais planejadas:

- `users(id, username, password_hash, totp_secret_encrypted, totp_enabled,
  password_changed_at, created_at, updated_at)`;
- `recovery_codes(id, user_id, code_hash, used_at, created_at)`;
- `sessions(id, user_id, token_hash, device_label, created_at, last_used_at,
  idle_expires_at, absolute_expires_at, rotated_at, revoked_at)`;
- `session_token_history(id, session_id, token_hash, issued_at, invalidated_at,
  expires_at)` com retenção curta para detectar reutilização após rotação;
- `files(id, storage_name, original_name, mime_type, size_bytes, created_at,
  updated_at)`;
- `notes(id, title, content, created_at, updated_at)`;
- `shortcuts(id, label, url, position, created_at, updated_at)`.

Evoluções posteriores, sempre por migrações idempotentes:

- notas: `title`, `category_id`, índices por atualização e busca;
- `categories` e `tags`, com tabela de relação `note_tags`;
- arquivos: `parent_id`, `updated_at`, `deleted_at` e índice composto de pasta;
- `directories(id, parent_id, name, created_at, updated_at)` se a hierarquia
  não for modelada em uma única tabela de nós;
- atalhos: `group_name`, `icon_key`, `is_pinned`;
- `automations` como catálogo sincronizado com configuração segura;
- `automation_runs` e `audit_events`, com retenção definida.

`sessions.token_hash`, expirações, datas de listagem, posições e chaves
estrangeiras receberão índices. O segredo TOTP será cifrado com chave de
aplicação mantida fora do banco; códigos de recuperação serão armazenados
somente como hash. Migrações devem ser transacionais e acompanhadas por backup
antes de alterações destrutivas.

### 5.8 Configuração obrigatória

O `.env.example` deverá documentar, no mínimo:

| Variável | Exemplo não sensível | Regra |
| --- | --- | --- |
| `NODE_ENV` | `production` | Controla defaults seguros e logs |
| `PORT` | `3000` | Porta interna do backend; não publicar no host |
| `DATABASE_PATH` | `/data/app.sqlite` | Caminho no volume persistente |
| `FILES_DIR` | `/files` | Diretório persistente fora da raiz pública |
| `TEMP_UPLOAD_DIR` | `/files/.tmp` | Mesmo filesystem do destino para promoção atômica |
| `MAX_UPLOAD_BYTES` | `2147483648` | 2 GiB no backend e valor equivalente no Nginx |
| `APP_ENCRYPTION_KEY` | sem valor | Segredo para cifrar TOTP; obrigatório e não versionado |
| `BOOTSTRAP_TOKEN` | sem valor | Token aleatório de uso único; remover após setup |
| `SESSION_COOKIE_NAME` | `panel_session` | Nome sem prefixo que exija HTTPS |
| `SESSION_IDLE_DAYS` | `180` | Validade por inatividade do navegador confiável |
| `SESSION_ABSOLUTE_DAYS` | `365` | Limite máximo antes de novo login |
| `SESSION_ROTATION_HOURS` | `24` | Intervalo máximo entre rotações transparentes |
| `COOKIE_SECURE` | `false` | Deve permanecer falso enquanto o acesso for HTTP |
| `TRUST_PROXY_HOPS` | `1` | Confiar somente no Nginx interno |
| `SYSTEM_METRICS_MODE` | `local` | Explicitar se mede backend/container |
| `AUTOMATIONS_ENABLED` | `false` | Feature flag desabilitada até a Fase 7 |
| `LOG_LEVEL` | `info` | Nunca habilitar payloads ou segredos nos logs |

Valores sensíveis serão fornecidos por arquivo `.env` protegido ou secrets do
ambiente, nunca no Compose versionado. `APP_ENCRYPTION_KEY` precisa fazer parte
do backup seguro de configuração: sua perda impede validar o TOTP existente.
Depois do bootstrap, o token deve ser invalidado no banco, removido do ambiente
e substituído por valor vazio antes da próxima inicialização.

## 6. Segurança, privacidade e confiabilidade

### 6.1 Autenticação e aplicação web

- senha forte armazenada somente com Argon2id e parâmetros calibrados no host;
- TOTP obrigatório no bootstrap e ao autenticar um navegador ainda não
  confiável; códigos de recuperação são de uso único e guardados como hash;
- sessão opaca de alta entropia no cookie persistente `panel_session`, com
  `HttpOnly`, `SameSite=Strict`, `Path=/` e sem atributo `Domain`; somente o
  hash do token é armazenado no banco;
- como o projeto opera deliberadamente em HTTP, o cookie não pode usar
  `Secure` nem o prefixo `__Host-`. Essa limitação é compensada apenas pela
  restrição da rede, nunca pela aplicação;
- o cookie recebe `Max-Age` e sobrevive ao fechamento do navegador. A política
  padrão será de 180 dias de inatividade e limite absoluto de 365 dias,
  configuráveis; renovações e rotações acontecem de forma transparente;
- o token é rotacionado periodicamente e após eventos sensíveis, com janela
  curta para requests concorrentes e detecção de reutilização;
- logout revoga o navegador atual; a área de segurança permite revogar outros
  dispositivos ou todas as sessões;
- troca de senha revoga as demais sessões. IP não será vínculo rígido da
  sessão, pois pode mudar, mas eventos anormais serão registrados sem coletar
  mais dados do que o necessário;
- rate limiting progressivo no login, no TOTP e no bootstrap, sem bloqueio
  permanente explorável por terceiros;
- proteção CSRF com token por sessão e validação de `Origin`/`Referer` para toda
  mutação;
- `helmet`, CSP compatível com o bundle e CORS restrito à própria origem;
- validação na borda da API e queries parametrizadas;
- sem token, senha, conteúdo de notas, cookies ou segredo em logs;
- nenhuma renderização de HTML fornecido pelo usuário sem sanitização.

Persistência não significa ausência de validade. Uma sessão permanente e não
revogável transformaria o roubo do cookie em acesso indefinido. Os prazos acima
mantêm o navegador conectado durante o uso normal, mas preservam rotação,
expiração e resposta a incidentes.

### 6.2 Arquivos e infraestrutura

- rejeição de traversal, IDs inválidos, nomes ambíguos e MIME não permitido em
  preview;
- download autenticado, `Content-Disposition` seguro e `nosniff`;
- verificação de espaço antes e durante upload;
- containers como usuário não-root e rede interna para frontend/backend;
- apenas o Nginx publica `80:80` no host;
- volumes separados para banco e arquivos, com permissões mínimas;
- backup criptografado e restauração testada;
- firewall ou security group restringe a porta 80 à rede/origens autorizadas;
- `COOKIE_SECURE=false` é documentado como consequência técnica do HTTP, não
  como evidência de que o transporte é seguro.

### 6.3 Escalabilidade pragmática

SQLite com WAL é adequado ao cenário de um administrador. A solução deve
evitar acoplamentos que dificultem evolução, mas não introduzir serviços
distribuídos prematuramente.

Sinais que justificam reavaliação arquitetural:

- múltiplos usuários ou escrita concorrente frequente;
- fila persistente de automações;
- métricas com alta frequência e retenção longa;
- uploads recomeçáveis ou replicação de arquivos;
- necessidade de disponibilidade em mais de um nó.

Nessa situação, considerar banco servidor, object storage, fila e coletor de
métricas em decisões separadas, com migração planejada.

## 7. Fases de desenvolvimento

Cada fase termina com demonstração, testes, documentação e critérios objetivos.
Nada é considerado implementado apenas por estar descrito neste plano.

### Fase 0 — Fundação e criação do projeto

**Objetivo:** criar uma base nova, reproduzível e documentada antes das
funcionalidades de produto.

- criar o novo repositório, workspace npm e a estrutura de frontend, backend,
  proxy, scripts e documentação;
- criar `README.md`, `.gitignore`, `.env.example` e os documentos de
  arquitetura, API, segurança, UX, deploy e operação;
- fixar versões de runtime, dependências e imagens;
- definir contratos iniciais, esquema de migrações e convenções de erro;
- produzir wireframes de baixa fidelidade e tokens do tema Modern GitHub Dark;
- criar threat model para acesso por IP/HTTP, autenticação persistente, upload e
  automações;
- definir IP da VPS, origens autorizadas e regras de firewall antes do primeiro
  deploy remoto;
- configurar lint, format, testes, build e validação de Compose desde o início.

**Saída:** repositório novo executável, documentação inicial, backlog
priorizado, contratos planejados e riscos registrados.

**Gate:** um clone limpo instala dependências, executa os testes iniciais,
constrói os esqueletos e valida o Compose usando apenas variáveis documentadas.

### Fase 1 — Fundação do frontend e design system

- configurar Vue 3, Vite, Tailwind, Router, Pinia, lint e testes;
- criar tokens, componentes-base e catálogo visual interno;
- estruturar features, cliente HTTP e normalização de erros;
- implementar shell responsivo sem ainda acoplar todas as APIs;
- validar contraste, foco, redução de movimento e viewports-alvo.

**Gate:** layout e componentes-base cobertos por testes essenciais e sem
violações críticas de acessibilidade.

### Fase 2 — Autenticação e navegação operacional

- implementar bootstrap de administrador com token de instalação de uso único;
- implementar senha Argon2id, TOTP, códigos de recuperação, login e `/auth/me`;
- implementar sessão persistente por navegador, rotação, logout e gestão de
  dispositivos confiáveis;
- implementar guards, sidebar, header, menu de sessão e 404;
- criar feedback global, activity center e tratamento de indisponibilidade;
- validar ausência de tokens no storage, CSRF e comportamento em `401`/`403`.

**Gate:** o primeiro login exige senha e TOTP; fechar/reabrir o navegador
restaura a sessão automaticamente; logout ou revogação impedem seu reuso.

### Fase 3 — Dashboard de métricas

- estabilizar contrato com origem e unidades explícitas;
- implementar cards, polling responsável, gráficos e último valor válido;
- tratar modo desabilitado e distinção host/container;
- medir bundle, custo de atualização e comportamento em aba oculta;
- decidir por evidência se SSE será necessário.

**Gate:** nenhuma métrica ausente é apresentada como zero e falhas não bloqueiam
as demais ferramentas.

### Fase 4 — Notas

- entregar mural, criação, leitura, edição e exclusão com o contrato inicial;
- estabilizar edição parcial por `PATCH` e tratamento de alterações concorrentes;
- evoluir título, categoria, tags, busca e filtros;
- introduzir Markdown sanitizado e rascunho de sessão;
- testar limites, XSS, filtros vazios e perda de conexão.

**Gate:** fluxo completo funciona por teclado e não há perda silenciosa de
conteúdo.

### Fase 5 — Drive

- implementar Drive plano, upload com fila/progresso/cancelamento, preview,
  download e exclusão;
- validar arquivos vazios, próximos e acima de 2 GiB, interrupção, falta de
  espaço e persistência;
- adicionar busca, ordenação e paginação;
- projetar e migrar hierarquia antes de exibir pastas e breadcrumbs;
- avaliar lixeira e operações em lote.

**Gate:** uploads são transmitidos por streaming, falhas não deixam partes
utilizáveis e o uso mobile preserva todas as ações essenciais.

### Fase 6 — Atalhos

- CRUD, grupos, ordenação acessível, ícones locais e atalhos fixados;
- validação forte de URL e abertura segura;
- integração limitada ao header para não gerar poluição visual.

**Gate:** URLs inválidas são rejeitadas no cliente e servidor; ordenação é
possível sem mouse.

### Fase 7 — Automações controladas

- produzir threat model específico e catálogo allowlisted;
- implementar runner isolado, validação, timeout, concorrência e auditoria;
- criar APIs de execução e stream de eventos;
- desenvolver catálogo, confirmação, logs e histórico no frontend;
- realizar testes de injeção, cancelamento, saída excessiva e segredo em log;
- liberar por feature flag somente após revisão.

**Gate:** não existe caminho para enviar comando arbitrário, elevar privilégio
ou acessar segredo por parâmetros/logs.

### Fase 8 — Hardening, desempenho e preparação para produção

- auditoria de dependências, CSP, headers, CSRF e permissões;
- testes E2E dos fluxos críticos e orçamento de performance;
- otimizar lazy loading, gráficos e listas extensas;
- concluir Dockerfiles multi-stage, healthchecks e limites de recurso;
- executar backup/restauração e simulação de rollback;
- revisar documentação operacional e variáveis de ambiente.

**Gate:** todos os critérios de aceite e o checklist de produção estão
evidenciados.

## 8. Fases de implantação

### 8.1 Ambiente de desenvolvimento

- `.env` local não versionado, dados sintéticos e serviços com hot reload;
- mocks apenas onde a API ainda não existir, sempre identificados;
- testes automatizados executados em cada mudança.

### 8.2 Homologação em host equivalente

- build imutável por Docker Compose;
- cópia anonimizada ou dados sintéticos representativos;
- teste real de upload grande, volume, proxy, SSE e cookies;
- validação mobile/desktop, acessibilidade e restauração de backup;
- assinatura dos critérios de aceite antes de produção.

### 8.3 Produção inicial

1. confirmar o IP da VPS e a lista de redes/IPs autorizados a usar o painel;
2. fechar portas desnecessárias no firewall e manter acesso administrativo por
   chave e origem restrita sempre que possível;
3. registrar versões das imagens e comando de rollback;
4. construir ou obter imagens fixadas;
5. gerar backup verificado caso já existam dados de homologação a preservar;
6. criar volumes e aplicar migrações idempotentes;
7. subir serviços e aguardar healthchecks;
8. confirmar acesso por `http://IP_DA_VPS`, exposição exclusiva da porta 80 e
   os atributos possíveis do cookie em HTTP;
9. consumir o token de bootstrap, cadastrar senha/TOTP e guardar os códigos de
   recuperação fora da VPS;
10. executar smoke test autenticado pela entrada pública;
11. observar erros, latência, tentativas de login e espaço em disco.

Desenvolvimento, homologação e produção usam HTTP. `COOKIE_SECURE=false` deve
ser explícito em `.env.example`; o acesso externo depende da fronteira de rede
definida na Seção 5.1.

### 8.4 Rollout incremental

- layout, autenticação e módulos centrais novos são ativados primeiro;
- extensões de notas e diretórios usam migrações compatíveis com a versão
  imediatamente anterior do novo projeto;
- SSE e automações permanecem sob feature flag;
- mudanças de alto risco têm janela de observação e critérios automáticos de
  rollback, como falha de login, erro elevado de API ou healthcheck instável.

### 8.5 Operação contínua

- backup criptografado em agenda definida e teste de restauração periódico;
- retenção e rotação de logs sem conteúdo sensível;
- monitoramento de saúde, disco, falhas de upload e execuções de automação;
- atualização de imagens e dependências em ciclos controlados;
- runbook para indisponibilidade, banco corrompido, disco cheio, firewall e
  rollback.

## 9. Estratégia de qualidade

### 9.1 Pirâmide de testes

- **unitários:** formatadores, validadores, composables e regras puras;
- **componentes:** estados, eventos, teclado, foco e mensagens;
- **integração frontend:** stores, router, cliente HTTP e contratos simulados;
- **integração backend:** autenticação, validação, banco e streaming;
- **E2E:** login, nota, upload/download, atalho e automação controlada;
- **operacionais:** Compose, volumes, backup/restauração e rollback.

### 9.2 Matriz mínima de UX

Cada tela deverá ser verificada nos estados:

- carregamento inicial;
- conteúdo disponível;
- estado vazio;
- filtro sem resultado;
- falha parcial e falha total;
- sessão expirada;
- ação em progresso, concluída e cancelada;
- viewport mobile e desktop;
- navegação apenas por teclado;
- movimento reduzido e contraste adequado.

### 9.3 Performance

- definir orçamento para JavaScript inicial e maior conteúdo visível após medir
  o baseline;
- lazy loading por rota e importação tardia de gráficos/preview;
- evitar polling simultâneo duplicado e requests quando a aba estiver oculta;
- virtualizar listas apenas quando medições demonstrarem necessidade;
- não bloquear interação por tarefas de formatação ou renderização pesada;
- medir Core Web Vitals no ambiente de homologação.

## 10. Critérios de aceite finais

O projeto será considerado pronto para a primeira versão produtiva quando:

1. o bootstrap funcionar uma única vez e não aceitar reutilização do token;
2. um navegador novo exigir senha e TOTP antes de acessar dados;
3. o navegador autenticado permanecer conectado depois de ser fechado e
   reaberto, usando apenas cookie persistente seguro;
4. logout, revogação, expiração e rotação impedirem reutilização de token;
5. senha, token, cookie, TOTP e conteúdo sensível não aparecerem em
   `localStorage`, `sessionStorage`, IndexedDB, banco em texto puro ou logs;
6. os quatro módulos principais forem navegáveis com mouse, toque e teclado;
7. a interface responder adequadamente em mobile e desktop;
8. toda tela possuir estados de loading, vazio, erro e sucesso coerentes;
9. métricas informarem origem, unidade e horário sem valores simulados;
10. notas puderem ser capturadas e recuperadas sem perda silenciosa;
11. uploads de até 2 GiB ocorrerem por streaming e sobreviverem à recriação dos
   containers;
12. uploads interrompidos/acima do limite não deixarem arquivos promovidos;
13. atalhos aceitarem apenas protocolos permitidos e abrirem com segurança;
14. automações, quando habilitadas, forem allowlisted, auditadas e incapazes de
    aceitar comandos arbitrários;
15. Nginx for o único serviço publicado pela aplicação, em `80:80`;
16. firewall/security group permitir a porta 80 somente pelas origens aprovadas
    ou o acesso ocorrer obrigatoriamente pela rede privada/VPN definida;
17. lint, testes, build, Compose, healthchecks e smoke tests passarem;
18. backup e restauração forem demonstrados em ambiente de teste;
19. documentação de configuração, deploy, rollback e operação estiver atualizada.

## 11. Validações técnicas obrigatórias

Quando a implementação estiver disponível, executar na raiz:

```bash
npm ci
npm run lint
npm test
npm run build
docker compose config
docker compose build
docker compose up -d
curl -fsS http://localhost:80/api/health
docker compose down
```

O mesmo healthcheck deve ser repetido de uma origem permitida usando
`http://IP_DA_VPS/api/health`. Uma origem fora da allowlist deverá falhar antes
de alcançar a aplicação.

Além disso, validar manual ou automaticamente:

- bootstrap único, login correto/incorreto, TOTP, recuperação, rate limit,
  persistência após reiniciar o navegador, rotação, expiração e revogação;
- CSRF, CORS, CSP e ausência de sessão em `localStorage`;
- upload vazio, interrompido, próximo de 2 GiB e acima do limite;
- traversal, ID inexistente, MIME inadequado para preview e disco cheio;
- persistência após recriação de containers;
- origem real das métricas;
- sanitização de Markdown e entradas maliciosas;
- parâmetros, timeout, cancelamento e logs de automação;
- permissões dos volumes, backup, restauração e rollback;
- responsividade, leitor de tela, teclado e redução de movimento.

## 12. Riscos e mitigação

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Escopo do projeto novo crescer antes do núcleo estar estável | Alto | Fases com gates e expansões atrás de feature flags |
| Métricas do container serem chamadas de métricas da VPS | Alto | Exibir origem e usar coletor dedicado para o host |
| Execução de shell ampliar a superfície de ataque | Crítico | Allowlist, runner sem shell, isolamento, limites e feature flag |
| Upload de 2 GiB falhar no proxy ou consumir disco/memória | Alto | Streaming, limites duplicados, temporários e testes reais |
| Frontend e backend novos divergirem nos contratos | Alto | Schemas compartilhados, documentação e testes de integração |
| Markdown introduzir XSS | Alto | Sanitização, CSP e nenhum HTML bruto por padrão |
| Muitos elementos reduzirem clareza do dashboard | Médio | Hierarquia visual, progressive disclosure e testes de uso |
| SQLite atingir limite futuro | Médio | WAL, transações curtas, métricas e gatilhos de migração |
| Cookie persistente ser roubado em um cliente ou rede comprometida | Crítico | Rede restrita, `HttpOnly`, rotação, expiração, detecção e revogação por dispositivo |
| IP público receber força bruta e varreduras | Alto | TOTP, rate limiting, firewall, logs e superfície mínima |
| HTTP permitir interceptação de credenciais e dados | Crítico | Rede privada, VPN ou allowlist; risco residual formalmente documentado |
| Exclusão causar perda irreversível | Alto | Confirmação contextual, backup e avaliação de lixeira |

## 13. Entregáveis

- frontend Vue 3 responsivo, modular e acessível;
- design system e tokens documentados;
- backend Node.js/Express novo, com contratos versionáveis e validação;
- autenticação persistente por navegador, TOTP, recuperação e gestão de sessões;
- migrações idempotentes e modelos atualizados;
- testes unitários, integração, componentes e E2E críticos;
- Dockerfiles, Compose, Nginx, healthchecks e volumes;
- scripts/procedimentos de backup, restauração e rollback;
- documentação de desenvolvimento, APIs, segurança e operação;
- matriz de aceite e evidências de homologação.

## 14. Conclusão

O resultado esperado é uma central de trabalho privada, coesa e rápida, segura
dentro da fronteira de rede confiável definida neste plano, na qual
monitoramento, notas, arquivos, atalhos e automações formem um único fluxo
operacional. O frontend deverá transmitir continuamente o estado do sistema,
reduzir passos para tarefas frequentes e continuar compreensível em falhas,
conexões lentas e telas pequenas.

No uso cotidiano, o administrador autenticará cada navegador apenas na primeira
vez com senha e TOTP. A partir daí, abrir o endereço levará diretamente ao
painel enquanto a sessão confiável estiver válida, mantendo `HttpOnly`,
`SameSite=Strict`, rotação, expiração e capacidade de revogação.

A implementação será bem-sucedida quando a qualidade não estiver apenas na
aparência: sessão segura, navegação previsível, feedback preciso, acessibilidade,
upload robusto, persistência comprovada e operação recuperável precisam fazer
parte da mesma entrega. A evolução por fases mantém o núcleo novo estável,
permite validar valor cedo e reserva recursos de maior risco — especialmente
pastas, tempo real e automações — para etapas com contratos, testes e controles
adequados.

Ao final, o projeto terá uma base sólida para uso pessoal imediato e fronteiras
técnicas claras para crescer sem transformar o MVP em uma plataforma complexa
antes da necessidade real.

## 15. Apêndice de rastreabilidade

### 15.1 Identificadores de requisitos

| ID | Requisito | Especificação | Fase | Entregáveis/evidências | Aceite relacionado |
| --- | --- | --- | --- | --- | --- |
| `FOUND-01` | Criar o projeto integralmente do zero | 1.3, 5.3 | Fase 0 | Repositório, workspace, estrutura e documentação | 17, 19 |
| `NET-01` | Acessar somente por `http://IP_DA_VPS:80` | 1.3, 5.1, 6.2 | Fases 0 e 8 | Nginx, Compose, firewall e teste de exposição | 15, 16 |
| `AUTH-01` | Autenticar o administrador com senha e TOTP | 4.1, 6.1 | Fase 2 | Bootstrap, login, TOTP e recovery codes | 1, 2, 5 |
| `AUTH-02` | Manter o navegador conectado com sessão persistente | 3.3, 4.1, 6.1 | Fase 2 | Cookie, rotação, sessões e revogação | 3, 4, 5 |
| `UX-01` | Entregar interface Modern GitHub Dark responsiva | 2, 3 | Fase 1 | Tokens, componentes-base e layout | 6, 7, 8 |
| `MON-01` | Monitorar a origem correta das métricas | 4.2 | Fase 3 | Cards, gráficos, polling e contrato | 9 |
| `NOTE-01` | Criar e organizar notas sem perda silenciosa | 4.3 | Fase 4 | CRUD, editor, filtros e sanitização | 8, 10 |
| `DRIVE-01` | Armazenar arquivos de até 2 GiB com robustez | 4.4, 6.2 | Fase 5 | Upload, preview, download e testes de falha | 11, 12 |
| `LINK-01` | Gerenciar e abrir atalhos seguros | 4.5 | Fase 6 | CRUD, ordenação e validação de URL | 13 |
| `AUTO-01` | Executar somente automações permitidas | 4.6 | Fase 7 | Catálogo, runner, eventos e auditoria | 14 |
| `SEC-01` | Aplicar proteções transversais | 6 | Fases 2–8 | CSRF, CSP, validação, logs e testes | 1–5, 12–16 |
| `OPS-01` | Garantir persistência e recuperação operacional | 8 | Fase 8 | Volumes, backup, restore e rollback | 11, 18, 19 |
| `QUAL-01` | Validar comportamento e qualidade antes do deploy | 9, 11 | Todas | Lint, testes, build, E2E e evidências | 17 |

Os números da última coluna correspondem aos itens da Seção 10. Ao criar uma
issue, branch, teste E2E ou registro de homologação, incluir pelo menos um ID da
matriz para manter a ligação entre intenção e evidência.

### 15.2 Mapa de dependências das fases

```text
Fase 0 — Fundação do projeto
   │
   ▼
Fase 1 — Design system e shell do frontend
   │
   ▼
Fase 2 — Autenticação e navegação protegida
   ├──────────┬──────────┬──────────┐
   ▼          ▼          ▼          ▼
Fase 3     Fase 4     Fase 5     Fase 6
Métricas   Notas      Drive      Atalhos
   │          │          │          │
   └──────────┴──────────┴──────────┘
                    │
                    ▼
             Fase 7 — Automações
                    │
                    ▼
             Fase 8 — Hardening e produção
```

- Fases 3–6 podem avançar em paralelo depois que autenticação, layout,
  cliente HTTP e componentes-base estiverem estabilizados;
- Fase 7 depende da autenticação e do padrão de eventos/logs, mas não precisa
  bloquear a entrega dos módulos anteriores;
- Fase 8 consolida todas as fases habilitadas no release e não corrige débitos
  funcionais que deveriam ter sido resolvidos nos gates anteriores.

### 15.3 Estados de acompanhamento

| Estado | Significado | Evidência exigida |
| --- | --- | --- |
| `planned` | Requisito detalhado, ainda não iniciado | Escopo e dependências identificados |
| `ready` | Pode entrar em desenvolvimento | Contrato, UX e aceite definidos |
| `in_progress` | Implementação ativa | Responsável e branch/tarefa associados |
| `blocked` | Impedimento externo ou dependência ausente | Motivo e ação de desbloqueio registrados |
| `review` | Código completo aguardando verificação | PR/diff, testes e documentação |
| `validated` | Gate técnico e funcional aprovado | Evidências automatizadas e manuais |
| `done` | Integrado, documentado e apto ao release | Critérios de aceite satisfeitos |

### 15.4 Checklist de cada pacote de trabalho

Antes de mover uma tarefa para `ready`, documentar:

- ID de requisito e objetivo do usuário;
- comportamento esperado e itens fora do escopo;
- fluxo principal, alternativas e falhas;
- componentes e estados do frontend;
- endpoints, schemas, códigos HTTP e permissões;
- mudança de banco, arquivos ou variáveis de ambiente;
- ameaças de segurança e dados sensíveis envolvidos;
- testes unitários, integração, E2E e verificações manuais;
- impacto em deploy, backup, migração e rollback;
- arquivos de documentação que precisam ser atualizados.

Antes de mover uma tarefa para `done`, confirmar:

- implementação revisada e sem código gerado indevido;
- lint, testes e build aplicáveis aprovados;
- loading, vazio, erro, sucesso, teclado e mobile verificados;
- logs sem credenciais, cookies, notas ou conteúdo de arquivos;
- critérios de aceite demonstrados;
- `FINAL.MD` e documentos derivados coerentes com o comportamento entregue.
