import { test, expect } from '@playwright/test';
import { loadDeck } from '../../scripts/content.mjs';
import { SAMPLE_CONTENT_DIR } from '../../scripts/content-config.mjs';

test('긴 질문의 작은 화면, 가로 화면과 데스크톱 배치', async ({ page }, testInfo) => {
  const { topics } = await loadDeck(SAMPLE_CONTENT_DIR);
  const longest = topics.toSorted((a, b) => b.question.length - a.question.length)[0];
  await page.addInitScript((id) => localStorage.setItem('cs-speaking-cards:v1', JSON.stringify({ version: 1, category: 'all', mode: 'all', order: [id], index: 0, saved: [], checked: {} })), longest.id);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^답변 확인:/ })).toBeVisible();
  for (const [width, height] of [[320, 568], [390, 844], [430, 932], [844, 390], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    const bounds = await page.evaluate(() => {
      const face = document.querySelector('[data-active="true"] .card-front')!.getBoundingClientRect();
      const question = document.querySelector('[data-active="true"] .question-content h1')!.getBoundingClientRect();
      const hint = document.querySelector('[data-active="true"] .tap-hint')!.getBoundingClientRect();
      return { cardTop: face.top, cardBottom: face.bottom, questionTop: question.top, questionBottom: question.bottom, hintTop: hint.top, hintBottom: hint.bottom, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(bounds.overflow, `${width} 가로 넘침`).toBe(false);
    expect(bounds.questionTop, `${width} 질문 상단`).toBeGreaterThan(bounds.cardTop);
    expect(bounds.questionBottom, `${width} 질문 하단`).toBeLessThanOrEqual(bounds.hintTop);
    expect(bounds.hintBottom, `${width} 조작 안내 하단`).toBeLessThanOrEqual(bounds.cardBottom);
    await page.screenshot({ path: `.captures/${testInfo.project.name}-${width}x${height}.png`, scale: 'css' });
  }
});

test('긴 꼬리 질문에서 코드 표기와 터치 영역 유지', async ({ page }, testInfo) => {
  const { topics } = await loadDeck(SAMPLE_CONTENT_DIR);
  const entries = topics.flatMap((topic) => topic.followups.map((question, index) => ({ topic, question, index })));
  const longest = entries.toSorted((a, b) => b.question.question.length - a.question.question.length)[0];
  await page.addInitScript((id) => localStorage.setItem('cs-speaking-cards:v1', JSON.stringify({ version: 1, category: 'all', mode: 'all', order: [id], index: 0, saved: [], checked: {} })), longest.topic.id);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.getByRole('button', { name: /^답변 확인:/ }).tap();
  await page.getByText('꼬리 질문 더 보기', { exact: false }).tap();
  await page.locator('[data-active="true"] .extra-question').nth(longest.index).tap();
  const text = await page.locator('[data-active="true"] .question-content h1').innerText();
  expect(text).not.toContain('`');
  const bounds = await page.evaluate(() => ({ cardBottom: document.querySelector('[data-active="true"] .card-front')!.getBoundingClientRect().bottom, hintBottom: document.querySelector('[data-active="true"] .tap-hint')!.getBoundingClientRect().bottom }));
  expect(bounds.hintBottom).toBeLessThanOrEqual(bounds.cardBottom);
  await page.screenshot({ path: `.captures/${testInfo.project.name}-long-followup.png`, scale: 'css' });
  await page.getByRole('button', { name: /^답변 확인:/ }).tap();
  await expect(page.locator('[data-active="true"] .followup-answer')).toBeVisible();
});

test('저장이 차단되어도 현재 연습을 계속 진행', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('blocked', 'QuotaExceededError'); }; });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('기록을 저장하지 못했습니다');
  await page.getByRole('button', { name: /^답변 확인:/ }).tap();
  await expect(page.getByRole('heading', { name: '답변에서 짚어야 할 내용' })).toBeVisible();
});
