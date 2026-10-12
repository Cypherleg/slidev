# Roteiro de demonstração (dados fictícios)

Tempo: cerca de 20 minutos. Tudo roda no computador de desenvolvimento ou num branch do Supabase, nunca com paciente real.
Envio de WhatsApp em **modo ensaio**: as mensagens são montadas e registradas, mas não saem.

## Preparar

```bash
cd jornada-cirurgica
npm ci
npm run pg:iniciar
JORNADA_DEV_RECRIAR=true npm run dev     # API local (8787) + interface (5173), banco recriado com a semente
```

Abrir `http://127.0.0.1:5173` num tablet ou no navegador em modo tablet.
Usuários fictícios (um por papel) aparecem na tela de entrada. PIN de todos: `135790`.

Semente (datas relativas ao dia da demonstração):

| Paciente fictício | Situação |
| --- | --- |
| Charlie Teste Lima · OLHO DIREITO · hoje, 1º | Pronto para o dia (D-7, checkpoints 1 e 2 e D-2 concluídos) |
| Bravo Teste Souza e Bravo Teste Sousa · hoje, 2º e 3º | Nomes parecidos no mesmo dia: nome da mãe exigido |
| Alfa Teste da Silva · OLHO ESQUERDO · hoje, 4º | 2º olho (1º operado há 30 dias) |
| Delta Teste Rocha · OLHO ESQUERDO · amanhã | Aguardando checkpoint 2 e D-2 |
| Eco Teste Martins · OLHO DIREITO · amanhã | Lente em quarentena (divergência plantada no checkpoint 2) |
| Foxtrot Teste Nunes · amanhã | D-7 em andamento |

## 1. D-7 (concierge) — fase 1

1. Entrar como **Ana Ficticia (Concierge)** → **Novo episódio**.
2. CPF de teste `900.000.101-38` → o Datasigh fictício devolve só os campos que tem; marcar "documento com foto conferido". Outros CPFs de teste: `900.000.102-19` (cadastro sem prontuário nem telefone), `900.000.103-08` (Datasigh fora do ar → cadastro manual "NÃO CONFERIDO NO DATASIGH"). CPF com dígito inválido é recusado.
3. Abrir o episódio: OLHO por extenso, cirurgião, tipo de cirurgia e de lente, data sugerida.
4. Aba **D-7**: responder A a G. Mostrar:
   - "olho dito pelo paciente" diferente do pedido → **ALERTA** automático;
   - α-bloqueador "já usou" → ALERTA (IFIS) e dot **I**; a regra do serviço aparece como informação, sem orientar suspensão;
   - alergia exige descrição da reação; "nenhuma alergia conhecida" é resposta explícita;
   - concluir o D-7 com alerta não comunicado é recusado; comunicar ao cirurgião (via, quem, quando).
5. Contatos: WhatsApp do paciente com anuência; marcar "confirmado por resposta do número". **Materiais**: prévia mostra textos e destino mascarado; enviar registra em ensaio.

## 2. Lente e D-2 (concierge e segunda conferente) — fase 2

1. Concierge, aba **Lente**: plano (dioptria exibida `+21,50 D`), foto do plano assinado, chegada e checkpoint 1.
2. Sair e entrar como **Carla Ficticia (Segunda conferente)** → episódio **Delta Teste Rocha** → **Lente**: o formulário do checkpoint 2 vem vazio; nada do plano aparece (nem na tela, nem nas respostas da API).
3. Digitar dioptria diferente → **quarentena**, hard stop e aviso ao cirurgião. Ninguém corrige o valor do outro.
4. Entrar como **Dr. Hugo Ficticio (Cirurgião)** → **Eco Teste Martins** → resolver a quarentena por escrito (manter plano ou novo plano) e ver o que precisa ser refeito.
5. **D-2**: confirmações, TCLE, observações e **etiquetas** (botão "Copiar" por etiqueta: peito, pulseira com dots e alertas por extenso, caixa da lente).

## 3. Dia da cirurgia (enfermagem, circulante, cirurgião, anestesista) — fase 3

1. **Dia cirúrgico** de hoje: ordem, horário, OLHO por extenso, dots com letra, alerta de nome parecido (Bravo Souza/Sousa) e de 2º olho (Alfa).
2. **Sala** de Charlie Teste Lima (entrar como **Elisa Ficticia (Enfermagem)**):
   - Admissão: marcar "acompanhante presente = não" → **hard stop**; o Sign In fica bloqueado. Corrigir quando o acompanhante chega.
   - **Trocar quem marca (PIN)** para o cirurgião e marcar o sítio; tentar o midriático antes da marcação → recusado (ordem).
   - Sign In e Time Out: tela de leitura em voz alta; quem leu e quem confirmou (confirmador por PIN).
   - Time Out: circulante digita a leitura da caixa (cega). Leitura diferente → a cirurgia não começa (quase-evento).
   - Sign Out e alta (exige anestesia concluída).
3. **Imprimir**: registro do episódio para assinar; **checklists em branco** abrem mesmo sem login (contingência).

## 4. Avisos e página do paciente — fase 4

1. Na sala, **Avisos à família**: a cada bloco concluído aparece a mensagem em **ensaio** (sem olho, sem dado clínico; sem previsão enquanto os tempos não forem configurados).
2. Registrar uma **intercorrência** → avisos suspensos, com o pedido para uma pessoa falar com a família; nenhuma mensagem nova é gerada.
3. Página do paciente: `http://127.0.0.1:8787/dev/links` lista os links gerados; abrir um → vídeo de exemplo, orientação, quiz (12 perguntas) e link do TCLE. A página não mostra o olho.

## 5. O que falta e indicadores — fase 5

1. **Pendências**: filtro por data e papel; cada item diz de quem depende e desde quando.
2. **Véspera** (cirurgião): episódios de amanhã, alertas sem conduta, lentes não conferidas, termos não assinados.
3. **Gestão → Indicadores** (gestora): indicadores 1, 3, 4, 5, 6, 7 e quiz na 1ª tentativa; 2 e 8 como registro manual.

## Testes automáticos que reproduzem o roteiro

```bash
npm test             # domínio, banco, API e componentes
npm run test:e2e     # navegador (tablet): lista do dia, conferência cega, sala, página do paciente, checklist em branco
```
