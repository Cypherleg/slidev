import { describe, expect, it } from 'vitest'
import { corrigirQuiz, perguntasQuiz, podeResponderQuiz, proximaAcaoQuiz, questoesErradas } from '../../supabase/functions/_shared/dominio/index.ts'

const CERTAS: Record<number, string> = { 1: 'OD', 2: 'F', 3: 'a', 4: 'b', 5: 'F', 6: 'F', 7: 'b', 8: 'd', 9: 'F', 10: 'b', 11: 'F' }

describe('quiz (POP §6)', () => {
  it('12 perguntas; 4 críticas (1, 6, 7, 10); a 12 não pontua; sem gabarito', () => {
    const p = perguntasQuiz()
    expect(p).toHaveLength(12)
    expect(p.filter((x) => x.critica).map((x) => x.numero)).toEqual([1, 6, 7, 10])
    expect(p.filter((x) => x.pontua)).toHaveLength(11)
    expect(p[11]).toMatchObject({ numero: 12, pontua: false, tipo: 'quem_instila' })
    expect(JSON.stringify(p)).not.toMatch(/gabarito|resposta|correta/i)
    expect(p[0].opcoes.map((o) => o.rotulo)).toEqual(['Direito', 'Esquerdo'])
  })

  it('aprova com as 4 críticas e pelo menos 9 de 11', () => {
    expect(corrigirQuiz(CERTAS, 'OD')).toMatchObject({ acertos: 11, criticasOk: true, aprovado: true, olhoInformado: 'OD', olhoConfere: true })
    const duasErradas = { ...CERTAS, 2: 'V', 3: 'c' }
    expect(corrigirQuiz(duasErradas, 'OD')).toMatchObject({ acertos: 9, aprovado: true })
    const tresErradas = { ...CERTAS, 2: 'V', 3: 'c', 4: 'a' }
    expect(corrigirQuiz(tresErradas, 'OD')).toMatchObject({ acertos: 8, aprovado: false })
  })

  it('reprova se errar uma crítica, mesmo com 10 acertos', () => {
    expect(corrigirQuiz({ ...CERTAS, 7: 'a' }, 'OD')).toMatchObject({ acertos: 10, criticasOk: false, aprovado: false })
  })

  it('pergunta 1 é conferida contra o olho do episódio', () => {
    expect(corrigirQuiz(CERTAS, 'OE')).toMatchObject({ olhoInformado: 'OD', olhoConfere: false, aprovado: false })
    expect(corrigirQuiz({ ...CERTAS, 1: 'OE' }, 'OE')).toMatchObject({ olhoConfere: true, aprovado: true })
    expect(corrigirQuiz({ ...CERTAS, 1: '' }, 'OD')).toMatchObject({ olhoInformado: null, olhoConfere: null, aprovado: false })
  })

  it('pergunta 12 registra quem instila e não pontua', () => {
    const t = corrigirQuiz({ ...CERTAS, 12: 'outra' }, 'OD', { eu: false, nome: 'Cuidador Teste' })
    expect(t).toMatchObject({ acertos: 11, quemInstila: { eu: false, nome: 'Cuidador Teste' } })
  })

  it('perguntas erradas (indicador complementar)', () => {
    expect(questoesErradas({ ...CERTAS, 2: 'V', 10: 'a' }, 'OD')).toEqual([2, 10])
  })

  it('se reprovar: 1ª reprovação → rever vídeo; 2ª ou erro do olho → contato humano', () => {
    const rep = corrigirQuiz({ ...CERTAS, 7: 'a' }, 'OD')
    const ok = corrigirQuiz(CERTAS, 'OD')
    const olho = corrigirQuiz(CERTAS, 'OE')
    expect(proximaAcaoQuiz([])).toBeNull()
    expect(proximaAcaoQuiz([rep])).toBe('rever_video_e_tentar_de_novo')
    expect(podeResponderQuiz([rep])).toBe(true)
    expect(proximaAcaoQuiz([rep, rep])).toBe('aguardar_contato_da_equipe')
    expect(podeResponderQuiz([rep, rep])).toBe(false)
    expect(proximaAcaoQuiz([olho])).toBe('aguardar_contato_da_equipe')
    expect(proximaAcaoQuiz([rep, ok])).toBe('concluido')
  })
})
