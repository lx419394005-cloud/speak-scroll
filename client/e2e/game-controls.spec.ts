import { expect, test, type Page } from '@playwright/test'

async function seedNickname(page: Page, nick = '测试员') {
  await page.addInitScript((name) => {
    window.localStorage.setItem('speak-scroll-nickname', name)
  }, nick)
}

async function startMockRound(page: Page, level = 'beasts') {
  await seedNickname(page)
  await page.goto(`/play?level=${level}&mockMic=1`)
  await expect(page.getByRole('button', { name: '开麦开始' })).toBeVisible()
  await page.getByRole('button', { name: '开麦开始' }).click()
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.word-card img')).toBeVisible()
}

test.describe('关卡选择', () => {
  test('首页可选三关并带 level 进入准备页', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Speak Scroll' })).toBeVisible()
    await expect(page.getByRole('radio', { name: /奇兽/ })).toBeVisible()
    await expect(page.getByRole('radio', { name: /怪果/ })).toBeVisible()
    await expect(page.getByRole('radio', { name: /旅途/ })).toBeVisible()
    await expect(page.getByRole('radio', { name: /行囊/ })).toBeVisible()
    await expect(page.getByRole('radio', { name: /乱斗/ })).toBeVisible()

    await page.getByPlaceholder('例如：龙仔').fill('自动测')
    await page.getByRole('radio', { name: /奇兽/ }).click()
    await expect(page.getByRole('button', { name: /开始 · 奇兽/ })).toBeVisible()
    await page.getByRole('button', { name: /开始 · 奇兽/ }).click()

    await expect(page).toHaveURL(/\/play\?level=beasts/)
    await expect(page.getByRole('button', { name: '开麦开始' })).toBeVisible()
    await expect(page.getByRole('link', { name: '换关卡' })).toBeVisible()
  })

  test('准备页展示当前关卡，换关卡回首页', async ({ page }) => {
    await seedNickname(page)
    await page.goto('/play?level=fruits')
    await expect(page.locator('.timer-stat')).toHaveText('30 秒')
    await expect(page.locator('.ready-level-title')).toHaveText('怪果')
    await expect(page.getByRole('radio', { name: /奇兽/ })).toHaveCount(0)

    await page.getByRole('link', { name: '换关卡' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('radio', { name: /奇兽/ })).toBeVisible()
  })
})

test.describe('暂停与回主页 (mockMic)', () => {
  test('开麦后可暂停、继续', async ({ page }) => {
    await startMockRound(page, 'beasts')

    await page.getByRole('button', { name: '暂停' }).click()
    await expect(page.getByRole('dialog', { name: '暂停菜单' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible()
    await expect(page.getByRole('button', { name: '继续游戏' })).toBeVisible()
    await expect(page.getByRole('button', { name: '回到主页' })).toBeVisible()

    await page.getByRole('button', { name: '继续游戏' }).click()
    await expect(page.getByRole('dialog', { name: '暂停菜单' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '暂停' })).toBeVisible()
  })

  test('Esc 可切换暂停', async ({ page }) => {
    await startMockRound(page, 'beasts')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '暂停菜单' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '暂停菜单' })).toHaveCount(0)
  })

  test('暂停后回到主页', async ({ page }) => {
    await startMockRound(page, 'beasts')
    await page.getByRole('button', { name: '暂停' }).click()
    await page.getByRole('button', { name: '回到主页' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'Speak Scroll' })).toBeVisible()
  })

  test('对局 HUD 主页按钮可回首页', async ({ page }) => {
    await startMockRound(page, 'voyage')
    await page.getByRole('button', { name: '主页' }).click()
    await expect(page).toHaveURL('/')
  })
})

test.describe('结算揭晓英文 (mockMic)', () => {
  test('对局中说错不显示英文，时间到才揭晓', async ({ page }) => {
    await startMockRound(page, 'beasts')

    await expect(page.getByText(/再试/).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.play-area .word-reveal')).toHaveCount(0)
  })
})
