# Notas do agente web-clínico

Interface principal da equipe (D-7, lente, D-2, dia da cirurgia). React 19 + react-router 7 + Vite.
Português do Brasil, tablet primeiro, alvos de toque de 48 px ou mais, sem emojis, marca "OFTA".

## Como rodar

```
npm run pg:iniciar
npm run dev:api            # API local (porta 8787)
npm run dev:web            # http://127.0.0.1:5173 (proxy /functions/v1 e /dev → 8787)
npx vitest run web/src     # testes de componente (jsdom por comentário no arquivo)
npx tsc -p tsconfig.json --noEmit
npx vite build --config web/vite.config.ts
```

Para não disputar portas com outros agentes, a verificação manual deste agente usou API em 8790 e Vite em 5180:
`JORNADA_DEV_PORTA=8790 JORNADA_DEV_BANCO=jornada_dev_webclinico JORNADA_ORIGENS_PERMITIDAS=http://127.0.0.1:5180 npx tsx dev/servidor.ts`
e `JORNADA_API_LOCAL=http://127.0.0.1:8790 npx vite --config web/vite.config.ts --port 5180`.

Variável opcional da interface: `VITE_INATIVIDADE_MIN` (minutos sem toque até bloquear o aparelho; padrão 10). Parâmetro técnico, a validar com a gestora.

## Telas (rotas)

| Rota | Arquivo | O que faz |
| --- | --- | --- |
| `/entrar` | `app/Entrar.tsx` | Dev: lista de usuários fictícios. Supabase: e-mail e senha; segundo fator (TOTP) quando pedido. |
| `/` | `telas/inicio/Inicio.tsx` | Atalhos por papel, cirurgias de hoje (resumo), alertas abertos (cirurgião e gestora), busca de episódio. |
| `/novo` | `telas/episodio/NovoEpisodio.tsx` | CPF → `paciente.buscar_cpf` → conferência com documento com foto (só os campos devolvidos) → `paciente.cadastrar` (ou paciente existente, com episódios anteriores e aviso de 2º olho) → `episodio.abrir` (olho em botões grandes por extenso, cirurgião da lista, cirurgia, tipo de LIO, data sugerida). Datasigh `nao_encontrado`/`indisponivel`/`nao_configurado` → cadastro manual marcado "NÃO CONFERIDO NO DATASIGH". |
| `/episodio/:id?aba=d7\|lente\|d2\|d0\|historico&ir=<âncora>` | `telas/episodio/Episodio.tsx` | Cabeçalho fixo de identificação, hard stops, "o que falta" (com "Ir para"), abas. |
| aba D-7 | `AbaD7.tsx` + `paineis/*` | Agenda (`episodio.agendar`), checklist `d7`, alertas (comunicar; conduta só cirurgião), contatos e autorizações, teach-back, TCLE, concluir D-7, materiais (prévia antes do envio; modo ensaio explícito). |
| aba Lente | `AbaLente.tsx` | Situação, quarentena em destaque (resolução escrita do cirurgião), plano (concierge) com foto do plano ao lado, chegada + checklist `cp1`, checkpoint 2 CEGO (conferente) + checklist `cp2`, troca no D0 (cirurgião). |
| aba D-2 | `AbaD2.tsx` | Situação da lente, checklist `d2`, TCLE, etiquetas (copiar + `etiqueta.copiada`). |
| aba D0 | `AbaD0.tsx` | Resumo dos seis blocos, atalho para a sala e para a impressão. |
| aba Histórico | `AbaHistorico.tsx` | Linha do tempo legível montada da visão (blocos concluídos com quem/quando/fora de hora, comunicações, condutas, lente sem valores, TCLE, materiais, avisos, intercorrências). |
| `/dia/:data` (`/dia` e `/dia/hoje` redirecionam) | `telas/dia/ListaDia.tsx` | Lista do dia com ordem, horário, paciente, nascimento, olho por extenso, cirurgião, estado, dots, alertas por extenso, contadores, homônimo/nome parecido, etapa da lente, avisos suspensos; botões Sala e Episódio. |
| `/sala/:id` | `telas/dia/Sala.tsx` | Tablet: identificação grande, hard stops, seis blocos, leitura em voz alta (Sign In e Time Out), leitura cega da LIO no Time Out, avisos à família, intercorrência, quase-evento, suspender/cancelar, contingência em papel. |
| `/meu-pin` | `app/App.tsx` (`MeuPin`) + `componentes/pin/DefinirPin.tsx` | O usuário do login define ou troca o próprio PIN (`membro.definir_pin`, sem ator). |

As telas do agente web-apoio são importadas sob demanda (`React.lazy`) pelos caminhos combinados.
A página do paciente (`/p/:token`) fica fora da casca e sem sessão.

## Casca (`app/`)

- `sessao.tsx`: `ProvedorSessao` / `useSessao()` → `estado`, `dados` (`SessaoDados`), `ator` (PIN), `quem` (quem marca agora), `papeis` (do ator, se houver; senão do login), `recarregar`, `sair`, `encerrarAtor`.
- `Casca.tsx`: cabeçalho com o nome do login, navegação pelos papéis de quem marca, faixa "Ambiente de demonstração" e "MODO ENSAIO", aviso fixo "Marcando como: <ator> (<papel>)" com validade do PIN, bloqueio por inatividade (encerra o ator e pede PIN ou novo login).
- `erros.tsx`: `useTratarErro()` padroniza `ErroChamada`:
  - `nao_autenticado`: se havia ator por PIN, descarta só o PIN (pode ser o token do PIN expirado); senão sai e vai para `/entrar` guardando a rota.
  - `conflito_versao`: recarrega a visão e avisa "Outra pessoa alterou este episódio" (os rascunhos do checklist ficam na tela para repetir).
  - `hard_stop`: lista `detalhes.hardStops` (aceita objetos `HardStop` ou códigos) e recarrega a visão.
  - `indisponivel`: "Servidor indisponível: siga o checklist em papel", com link para os checklists em branco.
  - `ordem`, `conferencia_cega`, `sem_permissao`, `limite_taxa`, `validacao`: mensagem do servidor (genérica, sem dado de paciente).
- `notificacoes.tsx`: avisos flutuantes (erros ficam até fechar; sucesso some em 5 s).

## Componentes reutilizáveis (`componentes/`)

- `base/index.tsx` (exports estáveis usados pelo web-apoio): `Botao` (novas props opcionais: `motivo` mostra o porquê do bloqueio, `rotuloAria`, `grande`, `id`), `Cartao` (`id`, `destaque`), `Aviso`, `OlhoDestaque` (`enorme`), `Dots` (`legenda`, `semTextoVazio`; lista acessível "A: Alergia"), `Carregando`, `Campo` (`obrigatorio`), e novos `Selo`, `EscolhaUnica` (rádios grandes). Importa `estilos.css`.
- `formato.ts` (também usado pelo web-apoio; manter estável): `formatarDioptria` ("+21,50 D"), `formatarEixo`, `formatarData` (data de calendário sem fuso; instante em America/Sao_Paulo), `formatarDataHora`, `formatarHora`, `hojeLocal`, `somarDias`, `dataValida`, `dataComDiaDaSemana`, `formatarNumero`, `lerNumero`, `digitos`, `mascararCpfDigitado`, `cpfValido`. Espelham as funções de exibição do domínio; ficaram locais porque o `dominio/index.ts` ainda tinha stubs durante a construção. Trocar por reexportação do domínio quando ele estiver completo, se o orquestrador preferir uma fonte única.
- `rotulos.ts`: rótulos de modelos, situação de bloco, etapa da lente, campos de lente, vias, tipos de contato, TCLE, estados de mensagem, gatilhos, causas de cancelamento, teach-back, severidade, hard stops; `rotuloPapeis`, `rotuloTransicao`.
- `permissoes.ts`: `permissao(visao, papeis, acao, {alvo, papeis})` usa primeiro `EpisodioVisao.permissoes` e, sem chave, a matriz da ARQUITETURA §4.4 só para explicar o motivo. `permissaoResponder`/`permissaoConcluir` por modelo.
- `checklist/RenderizadorChecklist.tsx`: renderizador GENÉRICO de `ModeloChecklist`, todos os `TipoResposta` (`checklist/CampoResposta.tsx`), validação por tipo (`checklist/valores.ts`). Ver "Decisões" abaixo.
- `identificacao/CabecalhoIdentificacao.tsx`: cabeçalho fixo (nome completo, nascimento + idade, prontuário, mãe, cirurgião, data/horário/ordem, estado por texto, OLHO por extenso, dots com letra, alertas por extenso, homônimo, nome parecido, "EXIGE NOME DA MÃE", 2º olho, "NÃO CONFERIDO NO DATASIGH"; variante `sala` com olho enorme, legenda dos dots e "verbalizar alergias, α-bloqueador e anticoagulação para TODO paciente").
- `lente/CamposLente.tsx` (campos com sinal explícito e prévia "+21,50 D"), `lente/FormularioCego.tsx` (checkpoint 2: não recebe nenhum valor; sempre começa vazio), `lente/FormularioLeituraTimeOut.tsx` (leitura da caixa), `lente/ValoresLenteExibicao.tsx` (só o que o servidor enviou; resultado confere/diverge com campos).
- `pin/TrocaPin.tsx` (modo `ator` → `definirAtor`; modo `confirmador` → só devolve o token para `bloco.concluir.confirmadorToken`), `pin/DefinirPin.tsx`.
- `episodio/ListaHardStops.tsx` (como resolver, quem resolve, o que bloqueia; formulário de resolução escrita só para quem tem competência; sem "prosseguir assim mesmo"), `episodio/SituacaoBloco.tsx`.
- `teste/fixtures.ts`: visão FICTÍCIA para testes.

## Decisões de interface

1. **Salvar por seção vs. item a item.** D-7, lente e D-2 salvam por seção (lote `checklist.responder`). Na sala, cada item alterado mostra "Registrar agora" (hora real, regra 5), além do botão da seção. Nunca marca sozinho ao tocar: tocar prepara, "Registrar" grava (evita marcação acidental, que não pode ser desfeita).
2. **Só o que mudou é enviado.** Correção é novo registro (o servidor conta `correcoes`). Confirmação registrada não pode ser desmarcada (não existe valor falso).
3. **Nenhum campo em branco**: itens de `BlocoVisao.faltam` em destaque, lista com âncoras no topo; validação por tipo antes de enviar (alergia com reação, medicamento com nome comercial e os campos de GLP-1 e de insulina, pessoa com `camposPessoa`).
4. **Campos novos do modelo (agente domínio)** são exibidos: `exigidoQuando` ("Responder quando..." / "Obrigatório: ..."), `exigeSim`, `exigeBlocosConcluidos` (bloqueia o item), `foraDeHoraApos` ("Será registrado FORA DE HORA"). O contexto (homônimo, lente tórica, dot D, blocos concluídos) vem da visão, com as mesmas regras do domínio.
5. **Campos extras do medicamento** (GLP-1 e insulina): reconhecidos pelos ids estáveis `D7.glp1` e `D7.insulina` de `dominio/modelos/ids.ts`, com reserva pelo texto do item.
6. **Conferência cega na tela**: para quem não tem papel que veja o checkpoint 1 (concierge, cirurgião, gestora), as seções de plano e chegada nem são montadas, mesmo que a visão trouxesse valores; o formulário do checkpoint 2 não recebe props de valores; `autoComplete="off"` em todos os campos de lente (o navegador de um aparelho compartilhado não pode sugerir o que outra pessoa digitou). A tela não busca nada além de `episodio.obter`.
7. **Sinal da dioptria sempre escolhido** (botões + e −) e prévia formatada antes de registrar; validade da caixa com dia ou só mês/ano.
8. **Leitura em voz alta** (Sign In, Time Out): instrução "leia da caixa, da biometria original e da pulseira, não da tela"; "Quem leu" escolhido da lista de membros ativos; "Quem confirmou" entra com o PIN (outra pessoa, o leitor é excluído da lista); o botão "Concluir" só habilita com os dois e lista os motivos quando não pode.
9. **Avisos à família**: botão de atraso desabilitado quando os avisos estão suspensos ("fale com a família"). Minutos em branco = aviso sem previsão.
10. **Etiquetas**: `navigator.clipboard.writeText`, com reserva `execCommand('copy')`; `etiqueta.copiada` só é registrada quando a cópia deu certo; como a ação não devolve a visão, a tela recarrega o episódio (a versão muda).
11. **Foto do plano**: reduzida no navegador para no máximo 2000 px (JPEG 0,88) antes do `anexo.enviar`, para não mandar 5 MB em base64 pelo tablet.
12. **Inatividade**: após `VITE_INATIVIDADE_MIN` sem toque, o aparelho bloqueia, encerra o PIN ativo (`ator.encerrar`) e pede PIN de quem vai usar ou novo login.
13. **PIN**: definir exige 6 dígitos (decisão A8) e recusa sequências e dígitos repetidos [S]; a troca aceita 4 a 8 dígitos (o servidor decide). Erro do `ator.pin` nunca derruba a sessão do aparelho.
14. **Tipo de LIO** na abertura: "monofocal", "torica" ou texto livre ("outra"); compatível com `lioMonofocal`/`lenteTorica` do domínio (comparação normalizada).
15. Telas do web-apoio e a página do paciente carregadas sob demanda (pacote principal ~420 kB).

## Lacunas no contrato (para o orquestrador)

1. **Chaves de `EpisodioVisao.permissoes` não estão no contrato.** O domínio (`projecao.ts`) usa `"<acao>"`, `"<acao>:<modelo>"` (checklist.responder, bloco.concluir) e `"hardstop.resolver:<codigo>"`; a tela procura `acao:alvo` e cai para `acao`. Sugestão: fixar essas formas no `contrato.ts`.
2. **`etiqueta.copiada` devolve `{ ok: true }`** e não a visão, mas grava evento (muda a versão): a tela precisa recarregar. Sugestão: devolver `EpisodioVisao` como as demais ações com `versao`.
3. **Não há ação de histórico/eventos do episódio.** A aba Histórico monta a linha do tempo só com o que a visão traz (blocos concluídos, comunicações, condutas etc.); correções de itens aparecem só como contagem. Sugestão: `episodio.historico` (eventos visíveis ao ator, sem valores de lente).
4. **`ItemModelo` não marca quais campos extras de medicamento exibir** (GLP-1, insulina): a tela usa os ids de `dominio/modelos/ids.ts`. Sugestão: `camposMedicamento?: ('glp1' | 'insulina')[]`.
5. **`ResultadoBuscaCpf.pacienteExistente` não diz se o cadastro foi conferido no Datasigh**; a tela assume conferido para continuar. Sugestão: incluir `conferidoDatasigh`.
6. **`alerta.comunicar` exige `cirurgiaoId`** mas não há lista de cirurgiões na visão: a tela chama `membros.ativos { papel: 'cirurgiao' }`.
7. **Segundo fator**: `auth.ts` não tem cadastro (enroll) de TOTP; sem fator cadastrado a tela só orienta a procurar a gestora.
8. **`detalhes.hardStops` do erro `hard_stop`** não tem tipo no contrato; a tela aceita lista de `HardStop` ou de códigos.
9. **Observações do D-2** dependem de existir item de texto no modelo `d2` (não há ação própria para observação livre).

## Testes

- `componentes/checklist/RenderizadorChecklist.test.tsx` (11): cada tipo de resposta (confirmação, sim/não, opção, múltipla, texto, data, hora, número, olho com "não sabe", medicamento com GLP-1, alergia com reação obrigatória, pessoa), olho por extenso, "não usa"/"sem alergia", ajuda/pendência do POP/autor/hora/fora de hora/correções, faltam em destaque, papéis e `depoisDe`, modo imediato, confirmação não desmarcável, somente leitura, `exigidoQuando`/`exigeSim`/`exigeBlocosConcluidos`/`foraDeHoraApos`.
- `componentes/identificacao/CabecalhoIdentificacao.test.tsx` (6): dois identificadores, olho por extenso (nunca a sigla), dots com letra e nome acessível, variante sala, alertas por extenso, homônimo, nome parecido, nome da mãe, "NÃO CONFERIDO NO DATASIGH".
- `telas/episodio/Cp2Cego.test.tsx` (4): a tela da conferente não renderiza nenhum valor do plano/chegada (nem foto) mesmo se a visão trouxesse; formulário vazio; envio de `lente.cp2` com valores tipados; sinal obrigatório e formulário limpo após registrar; a concierge vê o plano.
