// Gestão (gestora): membros, modelos de checklist, materiais, configuração, indicadores e fila de mensagens.
// O servidor aplica o papel (RLS e API); a tela só orienta.

import { Navigate, NavLink, Route, Routes } from 'react-router'
import { useSessaoOpcional } from '../../app/sessao.tsx'
import { Aviso } from '../../componentes/base/index.tsx'
import { ROTAS } from '../../rotas.ts'
import { useTitulo } from './comum/carga.ts'
import Configuracao from './Configuracao.tsx'
import Indicadores from './Indicadores.tsx'
import Materiais from './Materiais.tsx'
import Membros from './Membros.tsx'
import Mensagens from './Mensagens.tsx'
import Modelos from './Modelos.tsx'
import './comum/apoio.css'

const SECOES = [
  { chave: 'membros', rotulo: 'Membros' },
  { chave: 'modelos', rotulo: 'Modelos de checklist' },
  { chave: 'materiais', rotulo: 'Materiais' },
  { chave: 'config', rotulo: 'Configuração' },
  { chave: 'indicadores', rotulo: 'Indicadores' },
  { chave: 'mensagens', rotulo: 'Mensagens' },
] as const

export default function Gestao() {
  useTitulo('Gestão · OFTA VITTA')
  const sessao = useSessaoOpcional()
  // Quem marca agora (login ou PIN) precisa do papel de gestora; o servidor confere de novo.
  const semPapel = Boolean(sessao?.dados) && !sessao!.papeis.includes('gestora')

  return (
    <main className="pagina apoio">
      <h1>Gestão</h1>
      <nav className="submenu nao-imprimir" aria-label="Seções da gestão">
        {SECOES.map(s => (
          <NavLink key={s.chave} to={ROTAS.gestao(s.chave)}>
            {s.rotulo}
          </NavLink>
        ))}
      </nav>
      {semPapel ? (
        <Aviso tipo="atencao" titulo="Área da gestora">
          Quem está marcando agora não tem o papel de gestora. Entre com o PIN da gestora para continuar.
        </Aviso>
      ) : (
        <Routes>
          <Route index element={<Navigate to="membros" replace />} />
          <Route path="membros" element={<Membros />} />
          <Route path="modelos" element={<Modelos />} />
          <Route path="materiais" element={<Materiais />} />
          <Route path="config" element={<Configuracao />} />
          <Route path="indicadores" element={<Indicadores />} />
          <Route path="mensagens" element={<Mensagens />} />
          <Route path="*" element={<p role="alert">Seção não encontrada. Escolha uma seção acima.</p>} />
        </Routes>
      )}
    </main>
  )
}
