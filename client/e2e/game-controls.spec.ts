import { expect, test, type Page } from '@playwright/test'

async function seedNickname(page: Page, nick = '测试员') {
  await page.addInitScript((name) => {
    window.localStorage.setItem('speak-scroll-nickname', name)
  }, nick)
}

async function startMockRound(page: Page, level = 'easy') {
  await seedNickname(page)
  await page.goto(`/play?level=${level}&mockMic=1`)
  await expect(page.getByRole('heading', { name: '准备开麦' })).toBeVisible()
  await page.getByRole('button', { name: /开麦/ }).click()
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.word-card img')).toBeVisible()
}

test.describe('关卡选择', () => {
  test('首页可选三关并带 level 进入准备页', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Speak Scroll' })).toBeVisible()
    await expect(page.getByRole('radio', { name: /启蒙/ })).toBeVisible()
    await expect(page.getByRole('radio', { name: /冲刺/ })).toBeVisible()
    await expect(page.getByRole('radio', { name: /怪词/ })).toBeVisible()

    await page.getByPlaceholder('例如：龙仔').fill('自动测')
    await page.getByRole('radio', { name: /启蒙/ }).click()
    await expect(page.getByRole('button', { name: /开始 · 第1关/ })).toBeVisible()
    await page.getByRole('button', { name: /开始 · 第1关/ }).click()

    await expect(page).toHaveURL(/\/play\?level=easy/)
    await expect(page.getByRole('heading', { name: '准备开麦' })).toBeVisible()
    await expect(page.getByText('回首页')).toBeVisible()
  })

  test('准备页可切换关卡并更新倒计时', async ({ page }) => {
    await seedNickname(page)
    await page.goto('/play?level=normal')
    await expect(page.locator('.timer-stat')).toHaveText('1:00')

    await page.getByRole('radio', { name: /启蒙/ }).click()
    await expect(page).toHaveURL(/level=easy/)
    await expect(page.locator('.timer-stat')).toHaveText('1:30')
    await expect(page.locator('.level-stat')).toHaveText('1')
  })
})

test.describe('暂停与回主页 (mockMic)', () => {
  test('开麦后可暂停、继续', async ({ page }) => {
    await startMockRound(page, 'easy')

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
    await startMockRound(page, 'easy')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '暂停菜单' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '暂停菜单' })).toHaveCount(0)
  })

  test('暂停后回到主页', async ({ page }) => {
    await startMockRound(page, 'easy')
    await page.getByRole('button', { name: '暂停' }).click()
    await page.getByRole('button', { name: '回到主页' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'Speak Scroll' })).toBeVisible()
  })

  test('对局 HUD 主页按钮可回首页', async ({ page }) => {
    await startMockRound(page, 'hard')
    await page.getByRole('button', { name: '主页' }).click()
    await expect(page).toHaveURL('/')
  })
})
