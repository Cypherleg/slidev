-- =============================================================================
-- Jornada Cirúrgica — Migration 3/4: matriz `permissoes_evento`
-- Transcrição EXATA de docs/ARQUITETURA.md §4.4 (teste: tests/banco/matriz.test.ts).
--
-- * modelo nulo = vale para o tipo inteiro.
-- * checklist.item_respondido e bloco.concluido têm uma linha por modelo (sem linha nula):
--   o banco exige dados->>'modelo' e o confere.
-- * papeis vazio = somente jornada_sistema (autor_papel 'paciente').
-- * A matriz é recarregada por inteiro (reaplicável e sem linhas sobrando).
-- =============================================================================

delete from jornada_cirurgica.permissoes_evento;

insert into jornada_cirurgica.permissoes_evento (tipo, modelo, papeis) values
  -- Paciente e episódio
  ('paciente.cadastrado',          null, array['concierge','gestora']),
  ('paciente.corrigido',           null, array['concierge','gestora']),
  ('episodio.aberto',              null, array['concierge','gestora']),
  ('episodio.agendado',            null, array['concierge','gestora','cirurgiao']),
  ('episodio.corrigido',           null, array['concierge','gestora','cirurgiao']),

  -- Checklists: item respondido, por modelo
  ('checklist.item_respondido', 'd7',        array['concierge']),
  ('checklist.item_respondido', 'cp1',       array['concierge']),
  ('checklist.item_respondido', 'cp2',       array['conferente']),
  ('checklist.item_respondido', 'd2',        array['conferente','concierge']),
  ('checklist.item_respondido', 'admissao',  array['enfermagem']),
  ('checklist.item_respondido', 'sign_in',   array['circulante','enfermagem','cirurgiao','anestesista']),
  ('checklist.item_respondido', 'anestesia', array['anestesista']),
  ('checklist.item_respondido', 'time_out',  array['circulante','cirurgiao']),
  ('checklist.item_respondido', 'sign_out',  array['circulante','cirurgiao','anestesista']),
  ('checklist.item_respondido', 'alta',      array['enfermagem','cirurgiao']),

  -- Checklists: bloco concluído, por modelo (mesma regra)
  ('bloco.concluido', 'd7',        array['concierge']),
  ('bloco.concluido', 'cp1',       array['concierge']),
  ('bloco.concluido', 'cp2',       array['conferente']),
  ('bloco.concluido', 'd2',        array['conferente','concierge']),
  ('bloco.concluido', 'admissao',  array['enfermagem']),
  ('bloco.concluido', 'sign_in',   array['circulante','enfermagem','cirurgiao','anestesista']),
  ('bloco.concluido', 'anestesia', array['anestesista']),
  ('bloco.concluido', 'time_out',  array['circulante','cirurgiao']),
  ('bloco.concluido', 'sign_out',  array['circulante','cirurgiao','anestesista']),
  ('bloco.concluido', 'alta',      array['enfermagem','cirurgiao']),

  -- Alertas
  ('alerta.comunicado',            null, array['concierge','conferente','enfermagem','circulante','gestora','cirurgiao']),
  ('alerta.conduta_registrada',    null, array['cirurgiao']),

  -- Contatos e orientações
  ('contato.salvo',                null, array['concierge','conferente','enfermagem','gestora']),
  ('contato.removido',             null, array['concierge','conferente','enfermagem','gestora']),
  ('contato.confirmado',           null, array['concierge','conferente','gestora']),
  ('orientacoes.teach_back',       null, array['concierge','enfermagem']),

  -- Lente
  ('lente.plano_registrado',       null, array['concierge']),
  ('lente.chegada_registrada',     null, array['concierge']),
  ('lente.cp2_registrado',         null, array['conferente']),
  ('lente.cp2_resultado',          null, array['conferente']),
  ('lente.quarentena_aberta',      null, array['concierge','conferente','circulante','cirurgiao']),
  ('lente.quarentena_resolvida',   null, array['cirurgiao']),
  ('lente.troca_d0',               null, array['cirurgiao']),
  ('lente.time_out_resultado',     null, array['circulante']),

  -- Anexos, TCLE, materiais, etiquetas
  ('anexo.adicionado',             null, array['concierge','cirurgiao','gestora']),
  ('tcle.status',                  null, array['concierge','conferente','enfermagem','gestora']),
  ('material.enviado',             null, array['concierge','gestora']),
  ('link_paciente.criado',         null, array['concierge','gestora']),
  ('etiqueta.copiada',             null, array['conferente','concierge','enfermagem']),

  -- Hard stops, intercorrências, suspensão
  ('hardstop.resolvido',           null, array['concierge','conferente','enfermagem','circulante','anestesista','cirurgiao','gestora']),
  ('intercorrencia.registrada',    null, array['enfermagem','circulante','anestesista','cirurgiao']),
  ('episodio.suspenso',            null, array['cirurgiao','gestora']),
  ('episodio.cancelado',           null, array['cirurgiao','gestora']),
  ('avisos.atraso_solicitado',     null, array['concierge','enfermagem','circulante','gestora','cirurgiao']),
  ('mensagem.enfileirada',         null, array['concierge','conferente','enfermagem','circulante','anestesista','cirurgiao','gestora']),
  ('quase_evento.registrado',      null, array['concierge','conferente','enfermagem','circulante','anestesista','cirurgiao','gestora']),

  -- Gestão
  ('membro.alterado',              null, array['gestora']),
  ('config.alterada',              null, array['gestora']),
  ('modelo.publicado',             null, array['gestora']),
  ('material.catalogo_alterado',   null, array['gestora']),

  -- Página do paciente: somente jornada_sistema (autor_papel 'paciente')
  ('material.aberto',              null, array[]::text[]),
  ('quiz.respondido',              null, array[]::text[]);
