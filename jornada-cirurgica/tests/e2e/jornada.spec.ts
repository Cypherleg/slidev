// Ponta a ponta no navegador (tablet), contra o servidor local com semente FICTÍCIA.
// O banco `jornada_e2e` é recriado a cada execução (playwright.config.ts).
import { expect, type Page, test } from '@playwright/test'

const API = 'http://127.0.0.1:8787'

function dataLocal(diasAPartirDeHoje: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + diasAPartirDeHoje * 86_400_000))
}

async function entrarComo(page: Page, nome: RegExp) {
  await page.goto('/entrar')
  await page.getByRole('button', { name: nome }).click()
  await page.waitForURL(u => !u.pathname.startsWith('/entrar'))
}

async function abrirEpisodioDaLista(page: Page, data: string, paciente: string) {
  await page.goto(`/dia/${data}`)
  const linha = page.locator('li, article, tr, section').filter({ hasText: paciente }).last()
  await linha.getByRole('link', { name: 'Episódio' }).click()
  await page.waitForURL(/\/episodio\//)
}

test.describe.serial('Jornada cirúrgica (dados fictícios)', () => {
  test('lista do dia: olho por extenso, ordem e alerta de nome parecido', async ({ page }) => {
    await entrarComo(page, /Ana Ficticia/)
    await page.goto(`/dia/${dataLocal(0)}`)
    const charlie = page.locator('li, article, tr, section').filter({ hasText: 'Charlie Teste Lima' }).last()
    await expect(charlie).toContainText('OLHO DIREITO')
    await expect(charlie).toContainText('Nascimento 01/12/1955')
    await expect(page.getByText(/Homônimo ou nome parecido no dia: 2 episódios/)).toBeVisible()
    const alfa = page.locator('li, article, tr, section').filter({ hasText: 'Alfa Teste da Silva' }).last()
    await expect(alfa).toContainText(/2º OLHO — 1º operado em \d{2}\/\d{2}\/\d{4}/)
  })

  test('conferência cega: a segunda conferente não vê o plano e a divergência vai para quarentena', async ({ page }) => {
    const respostas: string[] = []
    page.on('response', async r => {
      if (r.url().includes('/functions/v1/')) {
        try {
          respostas.push(await r.text())
        } catch {
          /* resposta sem corpo */
        }
      }
    })
    await entrarComo(page, /Carla Ficticia/)
    await abrirEpisodioDaLista(page, dataLocal(1), 'Delta Teste Rocha')
    const url = new URL(page.url())
    url.searchParams.set('aba', 'lente')
    await page.goto(url.toString())
    await expect(page.getByText('Checkpoint 2: conferência independente (cega)')).toBeVisible()

    // Valores do plano e da chegada (semente: LIO Teste Monofocal XY, +19,50 D, lote LOTE-TESTE-001).
    const plantados = ['LIO Teste Monofocal XY', '19,50', '19.5', 'LOTE-TESTE-001']
    const texto = await page.locator('body').innerText()
    for (const v of plantados) {
      expect(texto, `tela não pode mostrar ${v}`).not.toContain(v)
      expect(respostas.some(r => r.includes(v)), `API não pode devolver ${v}`).toBe(false)
    }

    // Digita de novo, a partir da biometria original, com dioptria divergente (+20,50).
    const form = page.locator('form').filter({ hasText: 'Registrar checkpoint 2' })
    await form.getByRole('button', { name: 'OLHO ESQUERDO' }).click()
    await form.getByLabel('Modelo da LIO').fill('LIO Teste Monofocal XY')
    await form.getByRole('button', { name: 'Dioptria: sinal positivo' }).click()
    await form.getByLabel('Dioptria: valor sem sinal').fill('20,50')
    await form.getByRole('radiogroup', { name: 'Lente tórica?' }).getByRole('radio', { name: 'Não' }).check()
    await form.getByRole('button', { name: 'Registrar checkpoint 2' }).click()

    await expect(page.getByText(/quarentena/i).first()).toBeVisible()
    await expect(page.getByText(/diverg/i).first()).toBeVisible()
    // Mesmo depois de registrar, os valores do checkpoint 1 continuam fora da tela da conferente.
    expect(await page.locator('body').innerText()).not.toContain('19,50')
  })

  test('sala: identificação em destaque, seis blocos e verbalização para todo paciente', async ({ page }) => {
    await entrarComo(page, /Elisa Ficticia/)
    await page.goto(`/dia/${dataLocal(0)}`)
    const charlie = page.locator('li, article, tr, section').filter({ hasText: 'Charlie Teste Lima' }).last()
    await charlie.getByRole('link', { name: 'Sala' }).click()
    await page.waitForURL(/\/sala\//)
    await expect(page.getByText('OLHO DIREITO').first()).toBeVisible()
    const blocos = page.getByRole('navigation', { name: 'Blocos do dia da cirurgia' })
    await expect(blocos.getByRole('button', { name: /^Admissão Disponível/ })).toBeVisible()
    // Ordem obrigatória: os blocos seguintes começam bloqueados.
    for (const bloco of ['Sign In', 'Anestesia', 'Time Out', 'Sign Out', 'Alta']) {
      await expect(blocos.getByRole('button', { name: new RegExp(`^${bloco} Bloqueado`) })).toBeVisible()
    }
    await expect(page.getByRole('heading', { name: /Admissão/ }).first()).toBeVisible()
    await expect(page.getByText(/alergias.*α-bloqueador.*anticoagula/i).first()).toBeVisible()
    await expect(page.getByText(/prosseguir assim mesmo/i)).toHaveCount(0)
  })

  test('página do paciente: sem login, sem o olho, com o quiz', async ({ page, request }) => {
    const links = (await (await request.get(`${API}/dev/links`)).json()) as { url: string }[]
    expect(links.length).toBeGreaterThan(0)
    const caminho = new URL(links[0].url).pathname
    await page.goto(caminho)
    await expect(page.getByText(/Qual olho o senhor ou a senhora vai operar/)).toBeVisible()
    const texto = await page.locator('body').innerText()
    expect(texto).not.toMatch(/OLHO (DIREITO|ESQUERDO)/)
    expect(texto).not.toMatch(/Oftá/)
    // A pergunta 1 começa sem resposta marcada.
    const marcados = await page.locator('input[type="radio"]:checked').count()
    expect(marcados).toBe(0)
  })

  test('contingência: checklist em branco abre sem sessão', async ({ browser }) => {
    const contexto = await browser.newContext()
    const page = await contexto.newPage()
    await page.goto('/impressao/branco/time_out')
    await expect(page.getByText(/Alguém tem alguma preocupação/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Imprimir/ })).toBeVisible()
    await contexto.close()
  })
})
