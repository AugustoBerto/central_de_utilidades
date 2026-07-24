# UX

Referência: `FINAL.MD`, requisitos `UX-01` e Seções 2–4.

O tema é Modern GitHub Dark: canvas `#0d1117`, superfície `#161b22`, borda
`#30363d`, texto `#f0f6fc` e azul de ação `#2f81f7`.

Toda tela deverá contemplar carregamento, vazio, erro, sucesso e
indisponibilidade. Componentes mantêm foco visível, navegação por teclado,
contraste WCAG AA e `prefers-reduced-motion`.

## Estado atual

A fundação visual inclui Vue Router, Pinia, sidebar responsiva, header, rodapé
de status, rotas dos módulos e o componente `AppButton`. O fluxo inicial de
bootstrap, o login com TOTP ou código de recuperação, os guards de rota e o
logout estão conectados à API. O cookie persistente não é lido pelo frontend;
o token CSRF permanece apenas em memória. As telas de módulos ainda indicam
que seus dados não estão conectados, sem conteúdo simulado como operacional.

O dashboard mostra origem, horário e saúde da coleta. Ele consulta a API a
cada 15 segundos apenas com a aba visível, preserva a última leitura válida em
falhas e diferencia dados desatualizados de valores atuais. Gráficos são
carregados somente após a primeira leitura disponível.

As notas usam editor de texto com salvamento explícito, indicador de alterações
não salvas e confirmação antes de descartar conteúdo, trocar de nota ou sair da
rota. A lista distingue mural vazio de busca sem resultado. A exclusão informa
o título e requer confirmação; o conteúdo não é renderizado como HTML.

O Drive é plano nesta fase: não exibe pastas ou breadcrumbs inexistentes. A
zona de upload aceita arrastar ou selecionar arquivos e mostra progresso real,
cancelamento e repetição individual. Download e preview mantêm a autenticação;
exclusões exigem confirmação contextual. Busca, ordenação e paginação são
executadas sem carregar todo o Drive no navegador.

Atalhos são agrupados em cards com ícones locais. A abertura usa nova aba com
`noopener,noreferrer`; criação e edição validam a URL no servidor. Botões para
subir e descer preservam a ordenação para teclado e leitores de tela, sem
depender de arrastar com o mouse.

Automações exibem somente o catálogo permitido e exigem confirmação que resume
a ação antes da execução. O painel mostra status, cancelamento quando cabível e
saída sanitizada por SSE; com o feature flag desligado, a indisponibilidade é
explicada sem comprometer os demais módulos.
