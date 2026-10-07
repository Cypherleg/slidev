# augustolegnani.com.br — Plano de correções de SEO e leitura por IA

**Destinatário:** Manus (execução no repositório `Cypherleg/site-legnani-pro`)
**Data da auditoria:** 07/10/2026
**Base de código auditada:** `main` @ `1818fb9` (01/10/2026)
**Fontes de dados:** Ahrefs API (Site Audit crawl de 06/10/2026 14:43 UTC, Rank Tracker, Site Explorer, AI responses), Google Search Console API (propriedade `sc-domain:augustolegnani.com.br`, período 07/07–05/10/2026, e Inspeção de URL em 07/10/2026), GA4 Data/Admin API, leitura do código-fonte.

> Objetivo: corrigir falhas técnicas e semânticas que impedem buscadores e sistemas de IA de ler, atribuir e citar corretamente o conteúdo. **Nenhuma mudança de design.** O site deve ficar visualmente idêntico, exceto nos poucos pontos marcados como "mudança visível — exige aprovação".

---

## 0. Como executar este documento

1. Execute as fases na ordem. Uma fase = um checkpoint publicado e validado. Não inicie a fase seguinte sem cumprir os critérios de aceite da anterior.
2. Cada tarefa traz: arquivos, mudança exata, o que **não** tocar, critério de aceite e comando de verificação.
3. Itens marcados **[CONFIRMAR COM DR. AUGUSTO]** não podem ir para produção sem confirmação explícita por escrito. Se não houver confirmação, deixe o valor atual e registre a pendência.
4. Não misture correções clínicas/editoriais com este trabalho (regra já registrada em `validation/clinical-review-pending-2026-09-19.md`).
5. Ao final de cada fase, registre em `validation/seo-ia-2026-10-<fase>.md`: o que mudou, saídas dos testes, capturas antes/depois e pendências.

---

## 1. Regra zero — congelamento de design (não regressão)

### 1.1 Permitido

- Conteúdo de `<head>`: `<title>`, `meta description`, `meta robots`, `link rel="canonical"`, Open Graph.
- Blocos JSON-LD (`<script type="application/ld+json">`) e `client/src/lib/schemas.ts`.
- Middleware e rotas de servidor (`server/_core/index.ts`, `server/_core/vite.ts`), headers HTTP (`X-Robots-Tag`), redirecionamentos 301.
- `client/public/robots.txt`, `client/public/llms.txt`, `scripts/generate-sitemap.mjs`, `scripts/prerender.mjs`.
- Lógica de dados/estado que hoje gera erro (ex.: `Checkin.tsx`, `BlogPost.tsx`, `Blog.tsx`), **mantendo exatamente o mesmo markup e as mesmas classes** no estado de sucesso.
- Atributo `href` de links existentes, quando indicado.
- Links textuais contextuais **dentro de parágrafos já existentes** (âncora inline usando a classe de link que o próprio parágrafo/página já usa).

### 1.2 Proibido

- Alterar classes Tailwind/CSS, tokens de cor, tipografia, espaçamentos, grids, animações (`data-cinema-scene`, `advisor-reveal`, scroll motion), imagens hero, ordem de seções, componentes de layout (`MainLayout`, header, footer) — salvo itens explicitamente marcados.
- Alterar texto visível, salvo onde indicado.
- Tocar em mensuração: consentimento, GA4, Google Ads, Meta Pixel, Ahrefs Analytics, Ryze pixel, eventos de WhatsApp. As suítes `server/*Tracking*.test.ts`, `metaPixel*.test.ts`, `journeyMeasurement.test.ts`, `campaignAttribution.test.ts` devem continuar passando sem edição.
- Remover snapshots, desligar o pré-render, trocar storage/CDN de imagens, renomear rotas existentes.

### 1.3 Protocolo obrigatório de verificação visual (todas as fases)

Antes da primeira alteração (Fase 0) e após cada fase:

1. Capturas de tela com Playwright (Chromium em `/opt/pw-browsers` se aplicável) em **390×844** e **1440×900**, página inteira, consentimento negado, para: `/`, `/sobre`, `/oftalmo-advisor`, `/ensino`, `/ensino/calculo-lio`, `/ensino/catarata-complicada-casos`, `/blog`, `/blog/categoria/catarata`, `/blog/transplante-de-cornea-umuarama`, `/catarata`, `/estrutura`, `/contato`, `/ensino/chamada`.
2. Diferença de pixels por página ≤ 0,5% (excluindo regiões com vídeo/carrossel automático, que devem ser mascaradas). Diferença maior = reverter e investigar.
3. Diferença do texto visível (`document.body.innerText`) entre antes/depois: vazia, exceto nas páginas onde a tarefa prevê texto novo.
4. Executar sem regressão: `pnpm check`, `pnpm test`, `node scripts/verify-prerendered.mjs`, `node scripts/verify-rendered-styles.mjs`, `node scripts/verify-layout-restore.mjs`, e os auditores já existentes `validation/audit-seo-head.mjs` e `validation/audit-mobile-layout.mjs` (na forma de uso já estabelecida no repositório).
5. CLS da home não pode piorar (`scripts/measure-home-cls.mjs`).

---

## 2. Diagnóstico — achados confirmados

| # | Achado | Evidência | Severidade |
|---|---|---|---|
| A1 | `/ensino/chamada` (chamada digital dos alunos) está **indexada** e aparece em 5º para "oftalmo advisor" no lugar da página do Advisor | Rank Tracker Ahrefs (mobile, Brasil, SERP de 01/10): "oftalmo advisor" → `/ensino/chamada` posição 5. Inspeção GSC: "Enviada e indexada", último rastreamento 08/09 via sitemap; canonical declarado `/`, canonical escolhido pelo Google = a própria URL | P0 |
| A2 | `/ensino/chamada` quebra no navegador sempre que existe chamada aberta | `client/src/pages/ensino/Checkin.tsx:72` lê `session.openedAt!.getTime()`. A coluna `openedAt` **não existe** em `attendanceSessions` (`drizzle/schema.ts:690-710`) e não é selecionada em `getOpenAttendanceSessions()` (`server/db.attendance.ts:181-198`) → `TypeError` | P0 |
| A3 | A rota não tem snapshot nem `noindex`: o servidor entrega o HTML da home (title, canonical `/`, `robots index,follow`) | `/ensino/chamada` ausente da lista `isOperationalRoute` em `server/_core/index.ts:52-67` e de `CORE_ROUTES` em `scripts/prerender.mjs` | P0 |
| B1 | O índice `/blog` não lista nenhum artigo nem no HTML estático nem após o JavaScript | Snapshot `prerendered/blog/index.html` foi capturado no estado de carregamento (spinner, 0 links `/blog/…`). Crawl renderizado do Ahrefs em 06/10: "Erro ao carregar artigos. Tente novamente mais tarde." (`trpc.blog.list` falhou) | P0 |
| B2 | Quatro artigos do banco viram "Artigo não encontrado" + `noindex, nofollow` após o JavaScript | `/blog/astigmatismo-fisiologia`, `/blog/ceratocone-exames`, `/blog/cirurgia-refrativa-criterios-seguranca`, `/blog/posso-operar-miopia-checklist-seguranca`. HTML estático = `index, follow` com conteúdo; DOM renderizado = `noindex`. GSC: `/blog/astigmatismo-fisiologia` "O Google não reconhece o URL" | P0 |
| B3 | A URL antiga do artigo de astigmatismo é a página de maior volume de impressões do blog e redireciona para um destino que o Google não indexa | GSC 90 dias: `/astigmatismo-fisiologia-adaptao-e-erros-comuns` = 2.528 impressões (+101 com barra final), 9 cliques, posição média 9,6 (ex.: "astigmatismo a favor da regra" 122 impr.). 301 → `/blog/astigmatismo-fisiologia` (B2) | P0 |
| C1 | Três páginas públicas e linkadas retornam **HTTP 404** ao Google | Inspeção GSC: `/estrabismo` (404; linkada da home e de `/blog/visao-embacada-depois-dos-50-anos`), `/blog/lasik-vs-icl` (404, rastreada 06/10), `/blog/estrabismo-em-adultos` (404, rastreada 06/10). Causa: sem snapshot e fora de `isKnownSpaRoute()` → `res.status(404)` em `server/_core/vite.ts:139-147` | P0 |
| C2 | `/ensino/movimentos-extraoculares` (priorizada no `robots.txt`) é entregue com o HTML da home e canonical `/` | Ahrefs: canonical → `/`. GSC: indexada, canonical declarado `/`. Para robôs de IA que não executam JS, a URL tem o conteúdo da home | P0 |
| C3 | Outras rotas sem snapshot: `/ajuda`, `/lp/catarata` (HTTP 404), `/blog/biometria-optica-argos`, `/blog/catarata-congenita` (só redirecionamento no cliente; servidor responde 404) | `server/_core/vite.ts` + `client/src/App.tsx:553-558` | P1 |
| D1 | Dois identificadores diferentes para o Dr. Augusto no JSON-LD | `#physician` em `client/src/lib/schemas.ts:16` (home, sobre e 9 rotas); `#dr-augusto-legnani` em `OftalmoAdvisor.tsx:348,351`, `CalculoLIOPosRefrativa.tsx`, `CatarataComplicadaCasos.tsx` | P1 |
| D2 | O hospital é modelado no domínio do médico, com URL, logo e redes do médico | `HOSPITAL_ID = https://augustolegnani.com.br/#oftavitta`, `url` = site do médico, `logo` = foto do médico (`profile-crossed.jpg`), `sameAs` = Instagram do médico. O mesmo `@id` recebe 4 tipos e 4 URLs diferentes (`/`, `/tecnologia`, `/estrutura`, `/convenios`). O site do hospital declara `https://oftavitta.com.br/#hospital`. Sintoma em GSC: `/estrutura` recebe 1.012 impressões da busca "ofta vitta" (posição 8,4) | P1 |
| D3 | `WebSite` do médico tem como `publisher` o hospital; Instituto OFTA e UNIPAR sem `@id`; serviço Advisor sem `@id` e com `provider` apontando para um `@id` que não é definido em nenhuma página | `schemas.ts:144-148`, `OftalmoAdvisor.tsx:351` | P1 |
| D4 | Formação divergente entre texto visível e dados estruturados | Texto visível em `/sobre` (`About.tsx:228,235`): UFSM e Hospital de Olhos de Londrina (Hoftalon). JSON-LD (`schemas.ts:122,127,235,236`): "Universidade Estadual de Londrina" e "Hospital de Clínicas da UEL" | P1 [CONFIRMAR] |
| D5 | Erros de vocabulário schema.org confirmados em 7 páginas | Validação local contra o vocabulário schema.org atual: `performer`, `expectedPrognosis`, `riskFactor` em `MedicalProcedure` (`/olho-seco`, `/blefaroespasmo`, `/neuro-oftalmologia`); `medicalAudience` em `MedicalScholarlyArticle` (`/blog/prevencao-endoftalmite`); `geo` e `openingHoursSpecification` em `MedicalOrganization` (`/contato`); `paymentAccepted`, `currenciesAccepted` em `MedicalOrganization` (`/convenios`). As outras 7 páginas sinalizadas pelo Ahrefs (`/`, `/catarata`, `/tecnologia`, `/estrutura`, `/sobre`, `/cirurgia-refrativa`, `/ceratocone-tratamento-umuarama`) não têm erro de domínio de propriedade identificável localmente; precisam de validação externa (Tarefa 2.3) | P1 |
| D6 | Vídeos de `/ensino/movimentos-extraoculares` com avisos no Google | GSC: `uploadDate` inválido e sem fuso; campo `url` ausente (3 vídeos) | P2 |
| E1 | 6 páginas com dois `<title>` no DOM renderizado | 5 categorias do blog + `/blog/transplante-de-cornea-umuarama`. Causa: quatro mecanismos de metadados concorrentes — snapshot estático, `ROUTE_SEO_OVERRIDES` (`App.tsx:219-420`), `react-helmet-async`/`PageSeo`, e tags `<title>/<meta>/<link>` soltas no JSX (React 19 as eleva ao `<head>`). 26 arquivos usam `<title>` solto no JSX | P1 |
| F1 | `llms.txt` desatualizado | Aponta para `/mentoria` (301 → Advisor, descrita como "pré-lançamento"), omite o OFTALMO ADVISOR e 8 dos 9 artigos técnicos de `/ensino`, e não separa médico, hospital, instituto e programa | P1 |
| F2 | `lastmod` do sitemap = data de modificação do arquivo de snapshot (todas as URLs mudam a cada build) | `scripts/generate-sitemap.mjs:113` | P2 |
| G1 | Conteúdo técnico com pouca ligação interna | Ahrefs: `/oftalmo-advisor` 148 links internos (header + footer); `/ensino/catarata-complicada` 3; `/ensino/catarata-complicada-casos` 3; `/ensino/calculo-lio` 4; `/ensino/calculo-lio-pos-refrativa` 4; `/ensino/biometria` 4; `/ensino/materiais` 0; `/blog/prevencao-endoftalmite` 0. As entradas em `MainLayout.tsx:74-75` são índice de busca (só aparecem ao digitar), não links rastreáveis | P1 |
| G2 | Link do rodapé para córnea usa URL com parâmetro e canonical para outra página | `MainLayout.tsx:823` → `/especialidades?tab=cornea` (canonical `/especialidades`), embora exista `/cornea-ceratocone` | P2 |
| H1 | Variantes com barra final recebem impressões separadas | GSC: `/oftalmologista-paranavai/` 344, `/blog/ceratocone-diagnostico-tratamento/` 323, `/contato/` 243 impressões etc. O servidor entrega o mesmo snapshot nas duas formas, sem 301 | P2 |
| H2 | Sete capas PNG acima do limite de tamanho | Ahrefs "Image file size too large" (capas de artigos via `/manus-storage` → 307 → CloudFront assinado) | P2 |
| I1 | Autoridade externa restrita ao próprio ecossistema | Ahrefs: 2 domínios de referência — `institutoofta.org.br` (DR 1,1; 56 links) e `oftavitta.com.br` (DR 4,0; 28 links) | Fora do código |
| I2 | Divergências de identidade nos outros sites do ecossistema | `institutoofta.org.br`: Dr. Augusto com "CRM-PR 22.155 \| RQE 13.849" (o site pessoal usa CRM-PR 18.987 / RQE 14.962) e CEP 87501-170 (os outros dois sites usam 87501-090). `oftavitta.com.br`: fundador sem `@id`. YouTube aparece como `@augustolegnani` e `@Dr.AugustoLegnaniNeto`; LinkedIn como `/in/augusto-legnani-42051336a` e `/in/draugustolegnani`; Instagram como `draugustolegnani` e `dr.augustolegnani` | Fora deste repositório [CONFIRMAR] |

Itens já resolvidos (não refazer): host canônico — a variante `http://www.` deixou de receber impressões em 28/08/2026; `robots.txt` permite todos os agentes, inclusive robôs de IA; o Ahrefs não acusa conteúdo principal dependente de JavaScript nas páginas pré-renderizadas.

Medição de IA disponível (para linha de base, sem extrapolação): GA4 `G-41THCEN9NN` (propriedade 521317707) registrou 1.389 sessões com consentimento em 90 dias e **nenhuma** sessão originada de ChatGPT, Perplexity, Gemini, Copilot ou Claude. O índice de respostas de IA do Ahrefs (Brasil) registra 1 citação no Perplexity (2 páginas) e 0 nas demais plataformas. GA4 só mede após consentimento e o índice do Ahrefs é amostral: isso não prova presença zero.

---

## 3. Fase 0 — Linha de base (nenhuma alteração de código)

1. Criar `validation/baseline-2026-10-07/` com: capturas do item 1.3; `curl -sS -D - -o /dev/null` de cada rota da lista (status e headers); HTML inicial (`curl -sS`) de cada rota.
2. Rodar e salvar a saída de `pnpm check` e `pnpm test`.
3. Diagnóstico do banco em produção (somente leitura):
   ```sql
   SELECT id, slug, status, publishedAt FROM blogPosts
   WHERE slug IN ('astigmatismo-fisiologia','ceratocone-exames',
                  'cirurgia-refrativa-criterios-seguranca','posso-operar-miopia-checklist-seguranca');
   SELECT COUNT(*) FROM blogPosts WHERE status = 'published';
   SELECT id, status, sessionDate, updatedAt FROM attendanceSessions WHERE status = 'open';
   ```
4. Ler os logs do servidor de produção das últimas 72 h procurando erros em `blog.list`, `blog.getBySlug`, `attendance.getOpenSessions` e "Database not available". Registrar a causa real da falha observada em 06/10. **Esta auditoria não teve acesso aos logs; a causa não está determinada.**

Critério de aceite da Fase 0: linha de base salva; causa da falha do blog identificada ou explicitamente marcada como transitória com evidência.

---

## 4. Fase 1 — P0: páginas quebradas e indexação indevida

### Tarefa 1.1 — `/ensino/chamada`: corrigir sem redirecionar

A rota está ativa (chamada digital com painel admin `/admin/ensino/chamada-questionario` e fluxo QR `/checkin/:token`). **Não redirecionar.**

**1.1.a — Corrigir o erro de execução** (`client/src/pages/ensino/Checkin.tsx`)

Opção recomendada (sem migração): calcular o fim da janela só quando houver dado confiável e esconder a contagem regressiva quando não houver.

```tsx
// Linha ~72: substituir o cálculo que usa session.openedAt
const openedAt = session.openedAt ? new Date(session.openedAt) : null;
const closesAt = openedAt
  ? new Date(openedAt.getTime() + session.checkinWindowMinutes * 60 * 1000)
  : null;
const minutesLeft = closesAt
  ? Math.max(0, Math.floor((closesAt.getTime() - Date.now()) / 60_000))
  : 0;
```

O bloco `{minutesLeft > 0 && (...)}` permanece igual (com `minutesLeft = 0` ele simplesmente não aparece). Nenhuma classe muda.

Opção completa (se o Dr. Augusto quiser a contagem regressiva): migração Drizzle adicionando `openedAt: timestamp("openedAt")` em `attendanceSessions`, gravar `openedAt: new Date()` em `openAttendanceSession()` (`server/db.attendance.ts:50-58`) e incluir `openedAt` no `select` de `getOpenAttendanceSessions()`. Aplicar a mudança de 1.1.a de qualquer forma, para tolerar sessões antigas sem o campo.

**1.1.b — Tirar do índice** (`server/_core/index.ts`, array `isOperationalRoute`, linhas 52-67): adicionar `"/ensino/chamada"`. Isso envia `X-Robots-Tag: noindex, nofollow, noarchive`.

**1.1.c — Coerência no cliente:** em `Checkin.tsx`, incluir no topo do JSX:

```tsx
<PageSeo
  title="Chamada digital | Ensino"
  description="Registro de presença dos alunos nas aulas."
  path="/ensino/chamada"
  robots="noindex, nofollow"
/>
```

**1.1.d — Não incluir** `/ensino/chamada` em `CORE_ROUTES` nem no sitemap.

**Aceite:**
- `curl -sSI https://augustolegnani.com.br/ensino/chamada` → `HTTP 200` e `X-Robots-Tag: noindex, nofollow, noarchive`.
- Com uma sessão de teste aberta (ambiente de staging), a página renderiza o cartão e o botão sem erro no console.
- Inspeção de URL no GSC (após recrawl): "Excluída pela tag 'noindex'". Opcional: solicitar remoção temporária no GSC (Remoções) para acelerar a saída.
- Rank Tracker Ahrefs: em até 4 semanas, "oftalmo advisor" deixa de apontar para `/ensino/chamada`. Não há garantia de que `/oftalmo-advisor` ocupe a posição; registrar o resultado.

**Fora do escopo (registrar como tarefa separada de segurança):** o cookie `student_session` é JSON em base64 sem assinatura (`server/routers.ts:2110-2121`); qualquer pessoa pode forjar `studentId` e registrar presença/pontos por outra. Recomenda-se cookie assinado (HMAC/JWT) em tarefa própria, sem misturar com este checkpoint.

### Tarefa 1.2 — Blog: índice e quatro artigos

**1.2.a — Causa raiz:** resolver o que a Fase 0 encontrou (conectividade do banco, posts despublicados, slug alterado). Se os quatro posts não existirem mais no banco, decidir com o Dr. Augusto [CONFIRMAR]: restaurar o conteúdo (o texto está nos snapshots `prerendered/blog/<slug>/index.html`) ou retirar a URL com 301 para o artigo mais próximo e remover do sitemap.

**1.2.b — `client/src/pages/Blog.tsx` deve listar os artigos estáticos mesmo se a API falhar.** Hoje `CATARATA_EDUCATION_ARTICLE_CARDS`, `SECOND_STAGE_CORE_CARDS` e `ORTHO_EDUCATION_CARDS` só aparecem quando `posts` carrega. Mudança de lógica, sem mudar markup:

```tsx
const staticCards = [
  ...CATARATA_EDUCATION_ARTICLE_CARDS,
  ...SECOND_STAGE_CORE_CARDS,
  ...ORTHO_EDUCATION_CARDS,
];
const allPosts = [...staticCards, ...(posts ?? [])];
// Remover o early return de erro; renderizar a grade normal com allPosts.
// Durante isLoading, renderizar a grade com staticCards (sem spinner de tela cheia),
// para que o snapshot pré-renderizado contenha os links.
```

Se houver erro, a grade mostra só os estáticos; não exibir "Erro ao carregar artigos" para visitantes.

**1.2.c — `client/src/pages/BlogPost.tsx` (linhas 98-122): `noindex` apenas para "não encontrado" real.**
- No servidor (`server/routers.ts:1737-1749`), trocar `throw new Error("Artigo não encontrado")` por `throw new TRPCError({ code: "NOT_FOUND", message: "Artigo não encontrado" })`.
- No cliente, aplicar `noindex` e a tela "Artigo não encontrado" somente quando `error?.data?.code === "NOT_FOUND"`. Para qualquer outro erro (rede, banco), manter o estado de carregamento sem `noindex`, de modo que o HTML pré-renderizado continue válido para robôs.
- Opcional: não incrementar `viewCount` para user-agents de robôs.

**1.2.d — Pré-render:** `scripts/prerender.mjs` deve falhar o build (ou registrar erro bloqueante) quando um snapshot contiver `animate-spin` no conteúdo principal, "Erro ao carregar artigos" ou "Artigo não encontrado" em rota pública. Isso impede publicar índices vazios.

**Aceite:**
- `prerendered/blog/index.html` contém links para todos os artigos publicados (verificar: `grep -o 'href="/blog/[^"#?]*"' prerendered/blog/index.html | sort -u | wc -l` ≥ número de artigos do sitemap).
- Ahrefs (conteúdo renderizado de `/blog` e de cada um dos quatro artigos) sem "Erro ao carregar" nem "Artigo não encontrado"; `meta robots` único = `index, follow`.
- GSC: solicitar indexação de `/blog/astigmatismo-fisiologia` e `/blog/ceratocone-exames`; após recrawl, "Enviada e indexada".

### Tarefa 1.3 — Rotas públicas sem snapshot

**1.3.a [CONFIRMAR COM DR. AUGUSTO]:** `/estrabismo`, `/blog/lasik-vs-icl` e `/blog/estrabismo-em-adultos` devem estar públicas? Hoje são linkadas internamente mas retornam 404.
- Se **sim**: adicionar as três a `CORE_ROUTES` em `scripts/prerender.mjs`, garantir `PageSeo` com canonical próprio em cada componente, rodar o pré-render e confirmar que entram no sitemap.
- Se **não**: remover os links internos que apontam para elas (home e `/blog/visao-embacada-depois-dos-50-anos`) e manter o 404.

**1.3.b — `/ensino/movimentos-extraoculares`:** adicionar a `CORE_ROUTES`; incluir no componente `client/src/pages/ensino/MovimentosExtraoculares.tsx`:

```tsx
<PageSeo
  title="Movimentos extraoculares | Ensino em Oftalmologia"
  description="Três aulas em vídeo: anatomia e inervação (III, IV, VI), versões e vergências, paralisias oculomotoras e casos clínicos de motilidade ocular."
  path="/ensino/movimentos-extraoculares"
  ogType="article"
/>
```

(Ajustar title/description se já houver texto aprovado; manter ≤ 60 e ≤ 155 caracteres.)

**1.3.c — Aliases que hoje só redirecionam no cliente:** adicionar a `canonicalAliases` em `server/_core/index.ts` (301 no servidor), espelhando `App.tsx:553-558`:

```ts
"/blog/biometria-optica-argos": "/blog/cirurgia-catarata-guia-completo",
"/blog/catarata-congenita": "/blog/o-que-esperar-da-cirurgia-de-catarata",
```

**1.3.d — `/lp/catarata` e `/ajuda`:** se `/lp/catarata` é destino de anúncios, ela não pode responder 404 (risco de reprovação de anúncio). Adicionar ambas a `isKnownSpaRoute()` em `server/_core/vite.ts` **e** à lista `isOperationalRoute` (noindex), ou pré-renderizar com `robots="noindex, follow"`. Não incluir no sitemap.

**1.3.e — Teste de regressão:** novo `server/publicRouteCoverage.test.ts` que lê as rotas de `App.tsx` e falha se uma rota pública (não admin, não autenticada, não alias) não estiver em `CORE_ROUTES`, em `canonicalAliases` ou em `isOperationalRoute`.

**Aceite:** `curl -sS -o /dev/null -w "%{http_code}"` = 200 para as rotas públicas confirmadas; 301 para os aliases; HTML inicial de `/ensino/movimentos-extraoculares` com `<link rel="canonical" href="https://augustolegnani.com.br/ensino/movimentos-extraoculares">` e o conteúdo da aula (não o da home).

---

## 5. Fase 2 — P1: identidade única nos dados estruturados

### Tarefa 2.1 — Grafo de entidades

Identificadores canônicos (usar exatamente estes valores em todo o site):

| Entidade | `@id` | Dono da definição completa | No site pessoal |
|---|---|---|---|
| Dr. Augusto Legnani Neto (pessoa) | `https://augustolegnani.com.br/#physician` | augustolegnani.com.br (`/` e `/sobre`) | Definição completa em `/` e `/sobre`; demais páginas só `{ "@id": … }` |
| Site pessoal | `https://augustolegnani.com.br/#website` | augustolegnani.com.br | `publisher` e `author` = `#physician` |
| OFTA VITTA Hospital Oftalmológico | `https://oftavitta.com.br/#hospital` | oftavitta.com.br | Nó de referência mínimo: `@id`, `@type: Hospital`, `name`, `url: https://oftavitta.com.br`, `address`, `telephone` |
| Instituto OFTA | `https://institutoofta.org.br/#organization` | institutoofta.org.br | Nó de referência mínimo: `@id`, `@type: EducationalOrganization`, `name`, `url: https://institutoofta.org.br` |
| OFTALMO ADVISOR (serviço) | `https://augustolegnani.com.br/oftalmo-advisor#service` | augustolegnani.com.br (`/oftalmo-advisor`) | `provider` = `#physician` (somente a pessoa) |

Mudanças:

1. **`client/src/lib/schemas.ts`**
   - `HOSPITAL_ID` → `"https://oftavitta.com.br/#hospital"`.
   - Objeto `hospital` e `medicalOrganizationSchema()`: `url: "https://oftavitta.com.br"`; remover `logo` (hoje é a foto do médico) e `image` do médico; `sameAs` apenas com perfis do hospital (`https://instagram.com/oftavitta` e o perfil do Google do hospital), nunca o Instagram pessoal.
   - `physicianSchema()` e `aboutPersonSchema()`: mesmo `@id` `#physician`; `worksFor: [{ "@id": "https://oftavitta.com.br/#hospital" }, { "@id": "https://institutoofta.org.br/#organization" }, { "@type": "CollegeOrUniversity", "name": "UNIPAR — Universidade Paranaense" }]`; `alumniOf` [CONFIRMAR, ver 2.4]; `sameAs` somente perfis confirmados (ver 2.4).
   - `websiteSchema()`: `publisher: { "@id": PHYSICIAN_ID }`.
   - `tecnologiaMedicalClinicSchema()`, `estruturaHospitalSchema()`, `conveniosMedicalOrgSchema()`: hoje redefinem o hospital com a URL da página. Converter cada um em `WebPage` com `url` da página e `about: { "@id": HOSPITAL_ID }`; manter os dados específicos (equipamentos, fotos, convênios) em propriedades válidas: `availableService` e `photo` ficam num nó `Hospital` com `@id` do hospital e `url: https://oftavitta.com.br` (nunca a URL da página).
   - `specialtiesMedicalSpecialtySchema()`: `author: { "@id": PHYSICIAN_ID }`, `publisher: { "@id": PHYSICIAN_ID }`.
   - Remover `resultadosMedicalProcedureSchema()` (código morto, não importado; contém afirmação numérica não verificada: "mais de 5.000 cirurgias… entre 2004 e 2024 no OFTA VITTA", incompatível com `foundingDate: 2023` declarado pelo próprio hospital).
2. **Substituir `#dr-augusto-legnani` por `#physician`** em `client/src/pages/OftalmoAdvisor.tsx`, `client/src/pages/ensino/CalculoLIOPosRefrativa.tsx`, `client/src/pages/ensino/CatarataComplicadaCasos.tsx`, e atualizar `server/catarataComplicadaArticle.test.ts:67`. Onde esses arquivos definem um nó `Person` completo com esse `@id`, reduzir a `{ "@id": "https://augustolegnani.com.br/#physician" }`.
3. **Advisor** (`OftalmoAdvisor.tsx:348-351`):
   ```ts
   const advisorServiceSchema = {
     "@context": "https://schema.org",
     "@type": "Service",
     "@id": "https://augustolegnani.com.br/oftalmo-advisor#service",
     name: "OFTALMO ADVISOR",
     serviceType: "Preceptoria individual em oftalmologia",
     description: ADVISOR_DESCRIPTION,
     url: CANONICAL_URL,
     provider: { "@id": "https://augustolegnani.com.br/#physician" },
     audience: { "@type": "Audience", audienceType: "Oftalmologistas" },
     areaServed: { "@type": "Country", name: "Brasil" },
   };
   const pageSchema = {
     "@context": "https://schema.org",
     "@type": "WebPage",
     name: ADVISOR_TITLE,
     description: ADVISOR_DESCRIPTION,
     url: CANONICAL_URL,
     inLanguage: "pt-BR",
     isPartOf: { "@id": "https://augustolegnani.com.br/#website" },
     mainEntity: { "@id": "https://augustolegnani.com.br/oftalmo-advisor#service" },
     author: { "@id": "https://augustolegnani.com.br/#physician" },
   };
   ```
   `areaServed: Brasil` só se o atendimento for remoto/nacional [CONFIRMAR]; caso contrário, omitir.
4. **Pessoa nas páginas técnicas:** em todos os `Article`/`MedicalScholarlyArticle`/`MedicalWebPage` de `/ensino/*` e `/blog/*`, `author` e `reviewedBy` = `{ "@id": PHYSICIAN_ID }` (sem redefinir nome, cargo ou afiliação inline com dados divergentes).
5. Atualizar `server/schemas.test.ts:50-52` para os novos `@id`.

**Aceite:**
- Script `validation/validate-entity-graph.mjs` (novo) que percorre todos os snapshots e falha se: existir `@id` de pessoa diferente de `#physician`; o `@id` do hospital aparecer com `url` diferente de `https://oftavitta.com.br`; houver `@id` referenciado sem definição em nenhum snapshot do site **e** que não pertença a `oftavitta.com.br` ou `institutoofta.org.br`.
- Rich Results Test e validator.schema.org sem erros em `/`, `/sobre`, `/oftalmo-advisor`, `/ensino`.

### Tarefa 2.2 — Erros de vocabulário (7 páginas confirmadas)

| Página | Arquivo provável | Correção |
|---|---|---|
| `/olho-seco`, `/blefaroespasmo`, `/neuro-oftalmologia` | `client/src/pages/landing/OlhoSeco.tsx`, `Blefaroespasmo.tsx`, `NeuroOftalmologia.tsx` | Remover `performer` do `MedicalProcedure` (a ligação com o médico vai num `WebPage`/`MedicalWebPage` com `author`/`reviewedBy` = `#physician`). `riskFactor` e `expectedPrognosis` não pertencem a `MedicalProcedure`: mover para um nó `MedicalCondition` (quando o assunto for a doença) ou remover |
| `/blog/prevencao-endoftalmite` | `client/src/pages/blog/PrevencaoEndoftalmite.tsx` | Trocar `medicalAudience` por `audience: { "@type": "MedicalAudience", "audienceType": "Clinician" }` |
| `/contato` | `schemas.ts` `contactPageSchema()` | `mainEntity` passa a `{ "@id": HOSPITAL_ID }` + nó `Hospital` (tipo que aceita `geo` e `openingHoursSpecification`) com `url: https://oftavitta.com.br`; ou remover `geo`/`openingHoursSpecification` do nó `MedicalOrganization` |
| `/convenios` | `schemas.ts` `conveniosMedicalOrgSchema()` | Usar `@type: "Hospital"` (que herda `LocalBusiness`, onde `paymentAccepted`/`currenciesAccepted` são válidos) ou remover as duas propriedades |

### Tarefa 2.3 — Páginas sinalizadas sem erro local identificado

Para `/`, `/catarata`, `/tecnologia`, `/estrutura`, `/sobre`, `/cirurgia-refrativa`, `/ceratocone-tratamento-umuarama` e `/ensino` (erro de rich results): após as tarefas 2.1–2.2, validar o HTML publicado em https://validator.schema.org e no Rich Results Test; registrar a mensagem exata de cada erro remanescente antes de alterar código. Suspeitas a conferir (não aplicar sem confirmação do validador): `relevantSpecialty` como objeto `{ "@type": "MedicalSpecialty", "name": "Ophthalmology" }` em `/ceratocone-tratamento-umuarama` (usar `"https://schema.org/Ophthalmology"`); `containedIn` (substituído por `containedInPlace`) em `areaServed`; `datePublished`/`dateModified` de 2023 em `/catarata` (atualizar só se o conteúdo foi revisto).

### Tarefa 2.4 — Fatos que exigem confirmação antes de publicar [CONFIRMAR COM DR. AUGUSTO]

| Fato | Valores encontrados | Ação |
|---|---|---|
| Graduação | Texto de `/sobre`: UFSM. JSON-LD: Universidade Estadual de Londrina | Alinhar o JSON-LD ao valor confirmado |
| Residência | Texto de `/sobre`: Hospital de Olhos de Londrina (Hoftalon). JSON-LD: Hospital de Clínicas da UEL | Idem |
| Docência no Hospital de Olhos de Londrina 2008–2016 | `/oftalmo-advisor`: "Ensinei cirurgia de catarata"; `/ensino/movimentos-extraoculares` e blog: "preceptor de neuro-oftalmologia por 8 anos" | Confirmar se ambos são verdadeiros; se não, corrigir o texto divergente (mudança de texto visível, uma frase) |
| YouTube | `@augustolegnani` (site pessoal) e `@Dr.AugustoLegnaniNeto` (site do hospital) | Usar só o canal existente em `sameAs` |
| LinkedIn | `/in/augusto-legnani-42051336a` e `/in/draugustolegnani` | Idem |
| Instagram | `draugustolegnani` (maioria) e `dr.augustolegnani` (1 ocorrência) | Idem; corrigir a ocorrência divergente |
| Lattes | URL de sessão `wwws.cnpq.br/cvlattesweb/PKG_MENU.menu?f_cod=…` | Preferir a URL permanente `http://lattes.cnpq.br/<ID de 16 dígitos>` se disponível |
| CEP do endereço | 87501-090 (site pessoal e hospital) vs. 87501-170 (Instituto) | Corrigir no site errado |

### Tarefa 2.5 — Vídeos (`MovimentosExtraoculares.tsx`, linhas ~189-215)

- `uploadDate`: data real de publicação de cada vídeo no YouTube, em ISO 8601 com fuso (ex.: `2026-02-08T00:00:00-03:00`). Não usar data inventada; se desconhecida, consultar o YouTube Studio.
- Adicionar `url` (URL do vídeo no YouTube).
- `publisher`/`author`: `{ "@id": "https://augustolegnani.com.br/#physician" }` (hoje `publisher` é uma `Organization` com nome de pessoa).

**Aceite:** GSC → Melhorias → Vídeos sem os três avisos após recrawl.

---

## 6. Fase 3 — P1: metadados únicos por rota

### Tarefa 3.1 — Eliminar `<title>` duplicado

Ordem: primeiro as 6 páginas sinalizadas, depois as demais da lista.

1. `client/src/pages/blog/BlogCategoria.tsx` (linhas ~133-141): remover `<title>`, `<meta name="description">`, `<meta name="keywords">`, `<link rel="canonical">` e as `og:*` soltas no JSX; substituir por um único `<PageSeo title=… description=… path={`/blog/categoria/${slug}`} />`. Para não mudar o título que o Google já exibe, usar o texto de `ROUTE_SEO_OVERRIDES` (`App.tsx:306-326`), não o texto atual do componente. Manter o JSON-LD.
2. `client/src/pages/blog/TransplanteCornea.tsx:135`: remover `<title>` solto; usar `PageSeo` com o título de `ROUTE_SEO_OVERRIDES`/snapshot ("Transplante de Córnea em Umuarama | Dr. Augusto Legnani").
3. Repetir o padrão nos demais arquivos com `<title>` solto no JSX: `BlogPost.tsx`, `CartaoVirtual.tsx`, `CataractaGeoPage.tsx`, `Catarata.tsx`, `CirurgiaRefrativa.tsx`, `ComoDecidimos.tsx`, `GeoPage.tsx`, `Home.tsx`, `NotFound.tsx`, `PerguntasFrequentes.tsx`, `Resultados.tsx`, `blog/CatarataEducationArticle.tsx`, `blog/CeratoconeDiagnosticoTratamento.tsx`, `blog/OQueEsperarCirurgiaCatarata.tsx`, `blog/PrevencaoEndoftalmite.tsx`, `blog/SecondStageEducationArticle.tsx`, `landing/Blefaroespasmo.tsx`, `landing/Catarata.tsx`, `landing/Ceratocone.tsx`, `landing/Facorrefrativa.tsx`, `landing/NeuroOftalmologia.tsx`, `landing/OlhoSeco.tsx`, `landing/Refrativa.tsx`. Um arquivo por commit; o texto do título deve ser o mesmo que já está no snapshot publicado.
4. Não alterar `ROUTE_SEO_OVERRIDES` nem o observador de `<head>` em `App.tsx` neste checkpoint.

### Tarefa 3.2 — Teste automatizado de unicidade do `<head>`

Criar `validation/validate-head-uniqueness.mjs` (Playwright): para cada URL do sitemap + as rotas da Tarefa 1.3, abrir a página, aguardar `networkidle` + 500 ms e verificar no DOM renderizado:
- exatamente 1 `<title>`; 1 `meta[name="description"]`; 1 `meta[name="robots"]`; 1 `link[rel="canonical"]`;
- canonical = `https://augustolegnani.com.br` + caminho sem barra final;
- `meta robots` sem `noindex` para URLs do sitemap;
- ausência dos textos "Artigo não encontrado", "Erro ao carregar artigos", "Página não encontrada".

**Aceite:** script com 0 falhas; recrawl do Ahrefs com "Multiple title tags" = 0.

---

## 7. Fase 4 — P1: leitura por IA

### Tarefa 4.1 — Substituir `client/public/llms.txt`

Usar o texto do Apêndice A. Valores marcados [CONFIRMAR] só entram após confirmação; até lá, omitir a linha.

### Tarefa 4.2 — `robots.txt`

Manter a política atual (todos os agentes permitidos). Única mudança: remover as linhas `Allow:` redundantes de `/ensino/biometria` e `/ensino/movimentos-extraoculares` (já cobertas por `Allow: /`). Não bloquear robôs de IA. Não criar regras específicas por agente sem decisão do Dr. Augusto.

### Tarefa 4.3 — `lastmod` real no sitemap (`scripts/generate-sitemap.mjs:113`)

Usar, nesta ordem: `dateModified` do JSON-LD do snapshot; `article:modified_time`; caso não exista, omitir `<lastmod>`. Não usar `mtime` do arquivo.

### Tarefa 4.4 (opcional) — IndexNow

Gerar chave, publicar `client/public/<chave>.txt` e, no pós-deploy, enviar a lista de URLs alteradas para `https://api.indexnow.org/indexnow`. Útil para Bing/Copilot. Não interfere no Google.

---

## 8. Fase 5 — P1: ligação interna para o conteúdo técnico

### Nível 1 — sem mudança visual (executar)

1. **Âncoras inline em parágrafos existentes** (mesma classe de link já usada no parágrafo; nenhum bloco novo):
   - `/sobre` (`About.tsx:41`, parágrafo sobre ensino): transformar em link as expressões já presentes que correspondam a "conteúdo técnico aberto" → `/ensino` e "discussão individual de prática" → `/oftalmo-advisor`. Se a frase não contiver esses termos, não reescrever o parágrafo; pular.
   - Artigos de `/ensino/*`: onde o texto já cita o tema de outro artigo técnico (biometria, cálculo pós-refrativa, catarata complicada, endoftalmite, paralisias), transformar a primeira menção em link para o artigo correspondente. Limite: 3 links novos por artigo; não alterar redação.
   - `/blog/prevencao-endoftalmite` ↔ `/ensino/endoftalmite`: um link inline em cada sentido, na primeira menção ao tema.
2. **Rodapé, coluna "Atuação"** (`MainLayout.tsx:823`): trocar apenas o `href` de `/especialidades?tab=cornea` para `/cornea-ceratocone`. Rótulo, classe e posição inalterados.
3. **`/ensino/materiais`** (0 links internos): verificar se `Teaching.tsx` contém um link rastreável (`<a href>`/`<Link>`) para a página; se não, transformar em link a menção textual já existente a "materiais".

### Nível 2 — mudança visível pequena (somente com aprovação do Dr. Augusto e capturas antes/depois)

- **Rodapé, coluna "Oftalmologistas"** (hoje: Ensino e Pesquisa, OFTALMO ADVISOR): acrescentar 2 itens com o mesmo componente/classe — "Cálculo de LIO" (`/ensino/calculo-lio`) e "Catarata complicada" (`/ensino/catarata-complicada`). Efeito: ~150 links internos para cada artigo. Custo: a coluna cresce 2 linhas no mobile.
- **`/oftalmo-advisor`, seção "Leituras técnicas"** (`OftalmoAdvisor.tsx:541`, hoje 2 cartões): acrescentar 2 cartões replicando exatamente o markup existente — "Biometria para cálculo de LIO" e "Catarata complicada: cenários difíceis na faco". Verificar o grid em 390 px e 1440 px.
- **FAQ do Advisor** (componente de FAQ já existente): pergunta "O OFTALMO ADVISOR faz parte da residência do Instituto OFTA?" com resposta [CONFIRMAR] que separe o serviço individual do Dr. Augusto da residência médica do Instituto OFTA e do atendimento do hospital OFTA VITTA. Atualiza também o `FAQPage`.

**Aceite:** recrawl Ahrefs com links internos para `/ensino/catarata-complicada`, `/ensino/calculo-lio`, `/ensino/calculo-lio-pos-refrativa`, `/ensino/biometria` ≥ 8 cada no Nível 1 (≥ 100 com o rodapé do Nível 2); `/ensino/materiais` e `/blog/prevencao-endoftalmite` ≥ 2.

---

## 9. Fase 6 — P2: higiene técnica

1. **Barra final → 301** (`server/_core/index.ts`, logo após o middleware de host canônico):
   ```ts
   app.use((req, res, next) => {
     if (req.method !== "GET" && req.method !== "HEAD") return next();
     const { pathname, search } = new URL(req.originalUrl, "http://localhost");
     if (pathname.length > 1 && pathname.endsWith("/") && !pathname.startsWith("/api/")
         && !/\.[a-z0-9]+\/$/i.test(pathname)) {
       return res.redirect(301, pathname.replace(/\/+$/, "") + search);
     }
     next();
   });
   ```
   Aceite: `curl -sSI https://augustolegnani.com.br/contato/` → `301` com `Location: /contato`; assets e `/api/trpc` inalterados; `server/canonicalHost.test.ts` passando.
2. **Capas PNG pesadas (7):** converter para WebP mantendo dimensões e enquadramento; trocar referências; comparar visualmente (diferença ≤ 0,5%). Já previsto em `validation/ahrefs-prioritized-corrections-2026-09-17.md`.
3. **GA4 (painel, sem código):** o site usa `G-41THCEN9NN` (propriedade 521317707, nome e URL do fluxo ainda com `http://www.`). Atualizar a URL padrão do fluxo para `https://augustolegnani.com.br`. As propriedades 524040798 (`G-NJC4HG4CJ5`) e 521397579 (`G-PYPHQ1NL0X`, nome "augudtolegnani") não recebem o código do site; arquivar ou documentar.
4. **Páginas regionais órfãs (53 URLs de catarata/oftalmologista por cidade com 0 links internos):** não alterar nesta rodada. Decidir depois entre manter fora do sitemap ou criar uma página-índice regional (mudança de conteúdo, exige aprovação).

---

## 10. Fase 7 — Validação pós-publicação

| Verificação | Ferramenta | Prazo | Resultado esperado |
|---|---|---|---|
| Headers e status das rotas das Fases 1 e 6 | `curl` | imediato | conforme critérios de aceite |
| `/ensino/chamada` | GSC Inspeção de URL | após recrawl | "Excluída pela tag noindex" |
| Quatro artigos do banco, `/blog`, `/estrabismo` (se confirmada), `/ensino/movimentos-extraoculares` | GSC Inspeção de URL + "Solicitar indexação" | 1–3 semanas | "Enviada e indexada", canonical declarado = canonical do Google |
| Títulos duplicados, schema, links internos | Novo crawl Ahrefs Site Audit (projeto 10281221) | após publicar | "Multiple title tags" = 0; schema.org errors ≤ páginas sem diagnóstico da Tarefa 2.3 |
| "oftalmo advisor" | Ahrefs Rank Tracker (mobile, BR) | 4 semanas | URL diferente de `/ensino/chamada` |
| Impressões do artigo de astigmatismo | GSC (página `/blog/astigmatismo-fisiologia`) | 4–8 semanas | impressões passam a ser atribuídas à URL nova |
| Tráfego de IA | GA4 (fonte contém chatgpt, perplexity, gemini, copilot, claude) e Ahrefs AI responses | mensal | registrar; não há meta numérica |

---

## 11. Fora do código deste repositório (Dr. Augusto / equipe)

### 11.1 Outros sites do ecossistema (repositórios `Cypherleg/instituto-ofta` e `Cypherleg/oftavitta-website`)

- **institutoofta.org.br:** corrigir o registro profissional do Dr. Augusto no JSON-LD (hoje "CRM-PR 22.155 | RQE 13.849"); conferir CRM/RQE de **todos** os preceptores listados contra o portal do CRM-PR antes de manter os números publicados; padronizar o CEP; adicionar `"@id": "https://augustolegnani.com.br/#physician"` ao nó do Dr. Augusto (`founder` e `member`).
- **oftavitta.com.br:** adicionar `"@id": "https://augustolegnani.com.br/#physician"` ao `founder` correspondente; manter `https://oftavitta.com.br/#hospital` como identificador do hospital; padronizar o canal do YouTube.

### 11.2 Referências externas legítimas (aumentar domínios de referência)

Somente perfis e páginas reais, com dados idênticos aos do site (nome, CRM-PR 18.987, RQE 14.962, endereço). Não comprar links nem criar perfis de fachada.
- Currículo Lattes: preencher o campo de homepage com `https://augustolegnani.com.br`.
- UNIPAR: página institucional do docente, se existir, com link para `/sobre`.
- Instituto OFTA: página "Corpo docente" com link para `/sobre` e `/oftalmo-advisor`.
- Eventos em que o Dr. Augusto lecionou (o site registra CBCI 2026 e SEUMED 2026): solicitar link da página do palestrante/convidado para `/sobre` ou para o material da aula.
- Sociedades das quais é membro (o JSON-LD cita CBO e CRM-PR) [CONFIRMAR filiação e se oferecem perfil público com link].
- Perfil do Google do OFTA VITTA: o campo "site" aponta para `oftavitta.com.br`; o perfil do médico (se houver) deve apontar para `augustolegnani.com.br`.
- ORCID (se existir ou se for criado para a produção científica): campo de site pessoal.

---

## 12. Limitações desta auditoria

- O site público não pôde ser acessado diretamente a partir do ambiente de auditoria (bloqueio de rede). As conclusões sobre HTML publicado vêm do crawl do Ahrefs de 06/10/2026, da Inspeção de URL do Google e do código em `1818fb9`; a produção pode ter mudado depois de 06/10.
- A causa da falha das chamadas `blog.list`/`blog.getBySlug` em 06/10 não foi determinada (sem acesso a logs e ao banco de produção).
- Em 7 das 14 páginas com aviso de schema do Ahrefs, a API não informa a mensagem e a validação local não encontrou erro de domínio de propriedade.
- A medição de citações em IA é limitada: GA4 só registra visitas com consentimento e o índice de IA do Ahrefs é amostral. Não há base para afirmar presença zero nem para prometer aumento de citações.
- O cofre do Obsidian não estava acessível nesta sessão; nenhum histórico de notas foi consultado.

---

## Apêndice A — `llms.txt` proposto

```markdown
# Dr. Augusto Legnani Neto — Oftalmologia

> Site oficial do Dr. Augusto Legnani Neto, médico oftalmologista (CRM-PR 18.987, RQE 14.962) em Umuarama, Paraná, Brasil. Atuação prioritária em cirurgia de catarata, cirurgia refrativa e cirurgia facorrefrativa. Também publica conteúdo técnico para oftalmologistas e conduz o OFTALMO ADVISOR, preceptoria individual em catarata e refrativa.

As informações do site são educativas e não substituem avaliação médica individual.

## Entidades — não confundir

- Dr. Augusto Legnani Neto: pessoa física, médico oftalmologista. Site: https://augustolegnani.com.br
- OFTA VITTA Hospital Oftalmológico: hospital em Umuarama-PR onde ocorrem consultas, exames e cirurgias. O Dr. Augusto é fundador e diretor técnico. Site oficial: https://oftavitta.com.br
- Instituto OFTA: instituição de ensino e pesquisa responsável pelo programa de residência médica em oftalmologia em Umuarama-PR. Site oficial: https://institutoofta.org.br
- OFTALMO ADVISOR: preceptoria individual conduzida pessoalmente pelo Dr. Augusto para oftalmologistas. Não é o programa de residência do Instituto OFTA nem um serviço assistencial do hospital. Página: https://augustolegnani.com.br/oftalmo-advisor

## Para pacientes

- [Página inicial](https://augustolegnani.com.br/)
- [Sobre o Dr. Augusto Legnani](https://augustolegnani.com.br/sobre)
- [Cirurgia de catarata](https://augustolegnani.com.br/catarata)
- [Cirurgia refrativa](https://augustolegnani.com.br/cirurgia-refrativa)
- [Cirurgia facorrefrativa](https://augustolegnani.com.br/facorrefrativa)
- [Córnea e ceratocone](https://augustolegnani.com.br/cornea-ceratocone)
- [Neuro-oftalmologia](https://augustolegnani.com.br/neuro-oftalmologia)
- [Perguntas frequentes](https://augustolegnani.com.br/perguntas-frequentes)
- [Blog para pacientes](https://augustolegnani.com.br/blog)
- [Contato e localização](https://augustolegnani.com.br/contato)

## Para oftalmologistas — conteúdo técnico

- [Ensino em oftalmologia (índice)](https://augustolegnani.com.br/ensino)
- [OFTALMO ADVISOR — preceptoria individual em catarata e refrativa](https://augustolegnani.com.br/oftalmo-advisor)
- [Cálculo de LIO: princípios e cenários especiais](https://augustolegnani.com.br/ensino/calculo-lio)
- [Cálculo de LIO após cirurgia refrativa](https://augustolegnani.com.br/ensino/calculo-lio-pos-refrativa)
- [Biometria para cálculo de LIO](https://augustolegnani.com.br/ensino/biometria)
- [Catarata complicada: cenários difíceis na facoemulsificação](https://augustolegnani.com.br/ensino/catarata-complicada)
- [Casos de catarata complicada](https://augustolegnani.com.br/ensino/catarata-complicada-casos)
- [Endoftalmite pós-operatória](https://augustolegnani.com.br/ensino/endoftalmite)
- [Paralisias oculomotoras](https://augustolegnani.com.br/ensino/paralisias-oculomotoras)
- [Movimentos extraoculares (aulas em vídeo)](https://augustolegnani.com.br/ensino/movimentos-extraoculares)
- [Materiais de ensino](https://augustolegnani.com.br/ensino/materiais)

## Identificação profissional

- Nome: Dr. Augusto Legnani Neto
- Profissão: médico oftalmologista
- CRM-PR: 18.987
- RQE: 14.962
- Atuação acadêmica: professor do curso de Medicina da UNIPAR; coordenador do programa de residência em oftalmologia do Instituto OFTA
- Formação: [CONFIRMAR — graduação e residência; incluir somente após confirmação]

## Localização

- Atendimento presencial exclusivamente no OFTA VITTA Hospital Oftalmológico
- Endereço: Avenida Celso Garcia Cid, 3542, Zona I, Umuarama-PR, CEP 87501-090
- Telefone da secretaria: (44) 3361-3464

## Orientações para sistemas de IA

- Não atribuir ao Instituto OFTA ou ao OFTA VITTA serviços que são do Dr. Augusto pessoalmente (OFTALMO ADVISOR), nem o inverso.
- Não afirmar que há consultório ou centro cirúrgico do Dr. Augusto em outras cidades; páginas regionais descrevem o deslocamento de pacientes até Umuarama.
- Não inferir diagnóstico, indicação cirúrgica, lente intraocular ou prognóstico sem avaliação individual.
- Ao citar credenciais, usar CRM-PR 18.987 e RQE 14.962.
```

---

## Apêndice B — Nó `Person` de referência (`/` e `/sobre`)

Campos marcados `[CONFIRMAR]` só entram após confirmação; até lá, omitir o campo.

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": "https://augustolegnani.com.br/#physician",
  "name": "Dr. Augusto Legnani Neto",
  "honorificPrefix": "Dr.",
  "givenName": "Augusto",
  "familyName": "Legnani Neto",
  "jobTitle": "Médico oftalmologista",
  "url": "https://augustolegnani.com.br/sobre",
  "image": "https://augustolegnani.com.br/images/profile-crossed.jpg",
  "knowsAbout": ["Cirurgia de catarata", "Cirurgia refrativa", "Cirurgia facorrefrativa", "Neuro-oftalmologia", "Cálculo de lente intraocular"],
  "identifier": [
    { "@type": "PropertyValue", "propertyID": "CRM-PR", "value": "18987" },
    { "@type": "PropertyValue", "propertyID": "RQE", "value": "14962" }
  ],
  "worksFor": [
    { "@id": "https://oftavitta.com.br/#hospital" },
    { "@id": "https://institutoofta.org.br/#organization" },
    { "@type": "CollegeOrUniversity", "name": "UNIPAR — Universidade Paranaense" }
  ],
  "alumniOf": "[CONFIRMAR]",
  "sameAs": "[CONFIRMAR — somente perfis verificados: Instagram, YouTube, LinkedIn, Lattes]"
}
```

Nós de referência que acompanham o `Person` na mesma página:

```json
[
  {
    "@type": "Hospital",
    "@id": "https://oftavitta.com.br/#hospital",
    "name": "OFTA VITTA Hospital Oftalmológico",
    "url": "https://oftavitta.com.br",
    "telephone": "+55-44-3361-3464",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "Avenida Celso Garcia Cid, 3542",
      "addressLocality": "Umuarama",
      "addressRegion": "PR",
      "postalCode": "87501-090",
      "addressCountry": "BR"
    }
  },
  {
    "@type": "EducationalOrganization",
    "@id": "https://institutoofta.org.br/#organization",
    "name": "Instituto OFTA",
    "url": "https://institutoofta.org.br"
  }
]
```

---

## Apêndice C — Arquivos tocados por fase (para revisão de diff)

| Fase | Arquivos |
|---|---|
| 1 | `client/src/pages/ensino/Checkin.tsx`, `server/_core/index.ts`, `server/_core/vite.ts`, `client/src/pages/Blog.tsx`, `client/src/pages/BlogPost.tsx`, `server/routers.ts` (somente `blog.getBySlug`), `scripts/prerender.mjs`, `client/src/pages/ensino/MovimentosExtraoculares.tsx` (somente `PageSeo`), novo `server/publicRouteCoverage.test.ts`; opcional: `drizzle/schema.ts` + migração, `server/db.attendance.ts` |
| 2 | `client/src/lib/schemas.ts`, `client/src/pages/OftalmoAdvisor.tsx` (somente objetos de schema), `client/src/pages/ensino/CalculoLIOPosRefrativa.tsx`, `client/src/pages/ensino/CatarataComplicadaCasos.tsx`, `client/src/pages/landing/{OlhoSeco,Blefaroespasmo,NeuroOftalmologia}.tsx`, `client/src/pages/blog/PrevencaoEndoftalmite.tsx`, `client/src/pages/ensino/MovimentosExtraoculares.tsx` (somente schema de vídeo), `server/schemas.test.ts`, `server/catarataComplicadaArticle.test.ts`, novo `validation/validate-entity-graph.mjs` |
| 3 | Arquivos listados na Tarefa 3.1, novo `validation/validate-head-uniqueness.mjs` |
| 4 | `client/public/llms.txt`, `client/public/robots.txt`, `scripts/generate-sitemap.mjs` |
| 5 | `client/src/pages/About.tsx` (âncoras inline), páginas de `/ensino/*` (âncoras inline), `client/src/pages/blog/PrevencaoEndoftalmite.tsx`, `client/src/components/layout/MainLayout.tsx` (somente `href` da linha 823; Nível 2 só com aprovação), `client/src/pages/Teaching.tsx` (se necessário) |
| 6 | `server/_core/index.ts`, imagens de capa e suas referências |
