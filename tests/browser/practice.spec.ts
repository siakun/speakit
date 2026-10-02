import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function chooseTopic(page: Page, text: string) {
  await page.getByRole('button', { name: '연습할 질문 선택' }).tap();
  await page.getByRole('searchbox', { name: '질문 검색' }).fill(text);
  await page.locator('.search-result').first().tap();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

test('카드 뒤집기, 직접 점검, 꼬리 질문, 책갈피와 재접속', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await chooseTopic(page, '샘플 개념 01');
  await expect(page.locator('[data-active="true"] .question-content h1')).toContainText('샘플 개념 01');
  await mkdir('.captures', { recursive: true });
  await page.screenshot({ path: `.captures/${testInfo.project.name}-question.png` });
  await page.getByRole('button', { name: '다시 볼 질문에 저장', exact: true }).tap();
  await page.getByRole('button', { name: /^답변 확인:/ }).tap();
  await expect(page.getByRole('heading', { name: '답변에서 짚어야 할 내용' })).toBeVisible();
  await page.getByRole('checkbox', { name: '한 문장 정의', exact: true }).check();
  await expect(page.locator('[data-active="true"] .check-count')).toHaveText('1/5');
  await page.screenshot({ path: `.captures/${testInfo.project.name}-answer.png` });
  await page.locator('[data-active="true"] .followup-link').first().tap();
  await expect(page.locator('[data-active="true"] .card-overline')).toHaveText('FOLLOW-UP');
  await page.getByRole('button', { name: /^답변 확인:/ }).tap();
  await expect(page.locator('[data-active="true"] .followup-answer')).toContainText('관련 기준');
  await page.getByRole('button', { name: '기초질문 기준으로 돌아가기' }).tap();
  await page.reload();
  await expect(page.locator('[data-active="true"] .question-content h1')).toContainText('샘플 개념 01');
  await expect(page.getByRole('button', { name: '다시 볼 질문에서 해제', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^답변 확인:/ }).tap();
  await expect(page.getByRole('checkbox', { name: '한 문장 정의', exact: true })).toBeChecked();
  expect(errors).toEqual([]);
});

test('오류를 포함한 비교 답변과 빈 꼬리 답변의 구분', async ({ page }) => {
  await page.goto('/');
  await chooseTopic(page, '샘플 비교 01');
  await page.getByRole('button', { name: /^답변 확인:/ }).tap();
  await page.getByRole('button', { name: /1질문 3답변/ }).tap();
  await expect(page.getByRole('dialog')).toContainText('정답이 아니며');
  await page.getByText('답변 C: 직관형', { exact: true }).tap();
  await expect(page.getByRole('dialog')).toContainText('바로잡을 부분');
  await page.getByRole('button', { name: '닫기', exact: true }).tap();
  await page.getByText('꼬리 질문 더 보기', { exact: false }).tap();
  await page.locator('[data-active="true"] .extra-question').first().tap();
  await page.getByRole('button', { name: /^답변 확인:/ }).tap();
  await expect(page.locator('[data-active="true"] .followup-answer')).toContainText('아직 작성되지 않았습니다');
});

test('회차 중 중복 방지, 이전 이동, 마지막 질문 뒤 재시작', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '연습할 질문 선택' }).tap();
  await page.locator('.library-row').filter({ hasText: /^샘플 응용/ }).tap();
  const count = Number((await page.locator('.position').innerText()).split('/')[1]);
  const seen: string[] = [];
  for (let index = 0; index < count; index++) {
    const text = await page.locator('[data-active="true"] .question-content h1').innerText();
    expect(seen).not.toContain(text);
    seen.push(text);
    await page.getByRole('button', { name: '다음 질문', exact: true }).tap();
    await expect(page.locator('.card-viewport')).toHaveAttribute('data-index', String(index + 1));
  }
  await expect(page.getByText('이번 연습을 마쳤습니다')).toBeVisible();
  await page.waitForTimeout(280);
  await page.getByRole('button', { name: '이전 질문', exact: true }).tap();
  await expect(page.locator('[data-active="true"] .question-content h1')).toHaveText(seen.at(-1)!);
  await page.waitForTimeout(280);
  await page.getByRole('button', { name: '다음 질문', exact: true }).tap();
  await page.getByRole('button', { name: '다시 섞어서 연습' }).tap();
  await expect(page.locator('.position')).toContainText('01');
});

test('질문 한 장의 회차 재시작도 첫 카드로 이동', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '다시 볼 질문에 저장', exact: true }).tap();
  await page.getByRole('button', { name: '연습할 질문 선택' }).tap();
  await page.locator('.library-row').filter({ hasText: '다시 볼 질문' }).tap();
  await page.getByRole('button', { name: '다음 질문', exact: true }).tap();
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-index', '1');
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-motion', 'idle');
  await page.getByRole('button', { name: '다시 섞어서 연습' }).tap();
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-index', '0');
  const card = (await page.locator('.card-slide').first().boundingBox())!;
  const viewport = (await page.locator('.card-viewport').boundingBox())!;
  const inset = await page.locator('.card-viewport').evaluate(element => parseFloat(getComputedStyle(element).scrollPaddingLeft));
  expect(Math.abs(card.x - viewport.x - inset)).toBeLessThan(1);
  await page.getByRole('button', { name: /^답변 확인:/ }).tap();
  await expect(page.getByRole('heading', { name: '답변에서 짚어야 할 내용' })).toBeVisible();
});

test('모바일 레이아웃, 검색 결과 없음과 빈 복습 목록', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.locator('[data-active="true"] .card-front')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const next = await page.getByRole('button', { name: '다음 질문', exact: true }).boundingBox();
  expect(next!.width).toBeGreaterThanOrEqual(44);
  expect(next!.y + next!.height).toBeLessThanOrEqual(568);
  await page.getByRole('button', { name: '연습할 질문 선택' }).tap();
  await page.getByRole('searchbox', { name: '질문 검색' }).fill('없는질문12345');
  await expect(page.getByText('일치하는 질문이 없습니다.')).toBeVisible();
  await page.getByRole('searchbox', { name: '질문 검색' }).fill('');
  await page.screenshot({ path: `.captures/${testInfo.project.name}-library-small.png` });
  await page.locator('.library-row').filter({ hasText: '다시 볼 질문' }).tap();
  await expect(page.getByRole('heading', { name: '다시 볼 질문을 모아 보세요' })).toBeVisible();
  await page.getByRole('button', { name: '전체 질문으로 연습' }).tap();
  await expect(page.getByRole('button', { name: /^답변 확인:/ })).toBeVisible();
});

test('실제 터치로 좌우 스와이프, 뒤집기와 시트 닫기', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP 터치 입력은 Chromium에서만 제공됩니다.');
  await page.goto('/');
  await chooseTopic(page, '샘플 개념 01');
  const original = await page.locator('[data-active="true"] .question-content h1').innerText();
  const cdp = await page.context().newCDPSession(page);
  // 브라우저 기본 스크롤에 실제 touchmove까지 전달한다.
  async function drag(from: [number, number], to: [number, number]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1], id: 0 }] });
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from[0] + (to[0] - from[0]) * step / 8, y: from[1] + (to[1] - from[1]) * step / 8, id: 0 }] });
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await drag([290, 360], [80, 360]);
  await expect(page.locator('[data-active="true"] .question-content h1')).not.toHaveText(original);
  await expect(page.locator('[data-active="true"] .card-flipper')).not.toHaveClass(/is-flipped/);
  await page.waitForTimeout(450);
  await drag([80, 360], [290, 360]);
  await expect(page.locator('[data-active="true"] .question-content h1')).toHaveText(original);
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: /^답변 확인:/ }).tap();
  await expect(page.locator('[data-active="true"] .card-flipper')).toHaveClass(/is-flipped/);
  await expect(page.locator('.position')).toContainText('01');
  await page.getByRole('button', { name: '연습할 질문 선택' }).tap();
  await page.locator('.sheet-panel').evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const handle = await page.locator('.sheet-grab').boundingBox();
  await cdp.send('Input.synthesizeScrollGesture', { x: 190, y: handle!.y + 12, yDistance: 123, speed: 650, gestureSourceType: 'touch', preventFling: true });
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('답변의 실제 세로 터치 스크롤과 카드 이동 구분', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP 터치 입력은 Chromium에서만 제공됩니다.');
  await page.goto('/');
  await chooseTopic(page, '샘플 개념 01');
  await page.getByRole('button', { name: /^답변 확인:/ }).tap();
  await expect(page.getByRole('heading', { name: '답변에서 짚어야 할 내용' })).toBeVisible();
  await page.locator('[data-active="true"] .card-flipper').evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const cdp = await page.context().newCDPSession(page);
  // 세로 스크롤은 scrollTop을 직접 바꾸지 않고 브라우저의 네이티브 터치 처리로 확인한다.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 540, id: 0 }] });
  for (let step = 1; step <= 8; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y: 540 - 250 * step / 8, id: 0 }] });
    await page.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.locator('[data-active="true"] .answer-scroll').evaluate((element) => element.scrollTop)).toBeGreaterThan(60);
  await expect(page.locator('[data-active="true"] .card-flipper')).toHaveClass(/is-flipped/);
  await expect(page.locator('.position')).toContainText('01');
});
