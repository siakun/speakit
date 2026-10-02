import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { summarizeFrameIntervals } from '../../src/FrameMonitor';

// 모바일 WebKit의 자동화 API에는 휠 입력이 없어 같은 화면 크기의 데스크톱에서 휠을 검증한다.
// Chromium의 제스처 검사는 모바일 컨텍스트와 실제 touchmove 입력을 유지한다.
const gestureTest = test.extend({
  page: async ({ page, browser, browserName, baseURL }, use) => {
    if (browserName !== 'webkit') { await use(page); return; }
    const wheelPage = await browser.newPage({ baseURL, viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: true });
    try { await use(wheelPage); } finally { await wheelPage.close(); }
  },
});

async function prepare(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#sample');
  await page.getByRole('button', { name: '연습할 질문 선택' }).tap();
  await page.getByRole('searchbox').fill('샘플 개념 01');
  await page.locator('.search-result').first().tap();
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-scroll-engine', 'native');
  expect(await page.locator('.card-viewport').evaluate(element => getComputedStyle(element).scrollSnapType)).toBe('x mandatory');
}

// 모바일 Chrome에는 실제 touchmove를 전달하고, WebKit에는 네이티브 가로 휠 입력을 전달한다.
// scrollLeft를 테스트 코드에서 바꾸면 브라우저의 제스처 처리를 검증할 수 없다.
async function drag(page: Page, browserName: string, from: number, to: number) {
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y: 440, id: 0 }] });
    for (let step = 1; step <= 10; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + (to - from) * step / 10, y: 440, id: 0 }] });
      await page.waitForTimeout(16);
    }
    return async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    };
  }
  await page.mouse.move(195, 440);
  await page.mouse.wheel(from - to, 0);
  await page.waitForTimeout(40);
  return async () => {};
}

gestureTest('기본 스크롤 중 이웃 카드가 함께 이동하고 한 장으로 정렬', async ({ page, browserName }, testInfo) => {
  await prepare(page);
  const slides = page.locator('.card-slide');
  const start = (await slides.nth(0).boundingBox())!.x;
  const original = await slides.nth(0).locator('h1').innerText();
  const incoming = await slides.nth(1).locator('h1').innerText();
  const release = await drag(page, browserName, 300, 95);
  const geometry = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('.card-viewport')!;
    const slides = viewport.querySelectorAll('.card-slide');
    const current = slides[0].getBoundingClientRect();
    const next = slides[1].getBoundingClientRect();
    return { left: current.left, right: current.right, nextLeft: next.left, gap: next.left - current.right, scroll: viewport.scrollLeft, transform: document.querySelector<HTMLElement>('.card-track')!.style.transform };
  });
  expect(geometry.scroll).toBeGreaterThan(50);
  // 손가락을 누른 채인 터치와 달리 휠 한 번은 브라우저 설정에 따라 즉시 정렬될 수 있다.
  if (browserName === 'chromium') expect(geometry.right).toBeGreaterThan(0);
  expect(geometry.nextLeft).toBeLessThan(390);
  expect(geometry.gap).toBeCloseTo(32, 0);
  expect(geometry.left).toBeCloseTo(start - geometry.scroll, 0);
  expect(geometry.transform).toBe('');
  await mkdir('.captures', { recursive: true });
  await page.screenshot({ path: `.captures/${testInfo.project.name}-native-input.png`, scale: 'css' });
  await release();
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-index', '1');
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-motion', 'idle');
  expect(Math.abs((await slides.nth(1).boundingBox())!.x - start)).toBeLessThan(1);
  await expect(slides.nth(0).locator('h1')).toHaveText(original);
  await expect(slides.nth(1).locator('h1')).toHaveText(incoming);
  await page.screenshot({ path: `.captures/${testInfo.project.name}-native-settled.png`, scale: 'css' });
});

gestureTest('처음 카드의 경계와 연속 버튼 입력, 이동 중 반대 방향 입력', async ({ page, browserName }) => {
  await prepare(page);
  await page.mouse.move(195, 440);
  await page.mouse.wheel(-300, 0);
  await page.waitForTimeout(250);
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-index', '0');
  await expect(page.getByRole('button', { name: '이전 질문', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: '다음 질문', exact: true }).tap();
  await page.getByRole('button', { name: '이전 질문', exact: true }).tap();
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-index', '0');
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-motion', 'idle');
  await expect.poll(() => page.locator('.card-viewport').evaluate(element => element.scrollLeft)).toBeLessThan(1);

  await page.getByRole('button', { name: '다음 질문', exact: true }).tap();
  await expect.poll(() => page.locator('.card-viewport').evaluate(element => element.scrollLeft)).toBeGreaterThan(10);
  if (browserName === 'webkit') await expect(page.locator('.card-viewport')).toHaveAttribute('data-motion', 'idle');
  const release = await drag(page, browserName, 80, 325);
  await release();
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-index', '0');
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-motion', 'idle');
});

test('나가는 답변을 보존하면서 들어오는 질문 활성화', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: /^답변 확인:/ }).tap();
  await expect(page.getByRole('heading', { name: '답변에서 짚어야 할 내용' })).toBeVisible();
  const outgoing = page.locator('.card-slide').first();
  await page.evaluate(() => {
    const viewport = document.querySelector('.card-viewport')!;
    const outgoing = viewport.querySelector('.card-slide')!;
    const flipper = outgoing.querySelector('.card-flipper')!;
    const observer = new MutationObserver(() => {
      if (!flipper.classList.contains('is-flipped') && outgoing.getBoundingClientRect().right > viewport.getBoundingClientRect().left + 1) viewport.setAttribute('data-answer-cleared-early', 'true');
    });
    observer.observe(flipper, { attributes: true, attributeFilter: ['class'] });
    viewport.addEventListener('scrollend', () => setTimeout(() => observer.disconnect(), 100), { once: true });
  });
  await page.getByRole('button', { name: '다음 질문', exact: true }).tap();
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-index', '1');
  await expect(page.locator('.card-slide').nth(1)).not.toHaveAttribute('inert');
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-motion', 'idle');
  await expect(outgoing.locator('.card-flipper')).not.toHaveClass(/is-flipped/);
  await expect(page.locator('.card-viewport')).not.toHaveAttribute('data-answer-cleared-early');
  await page.getByRole('button', { name: /^답변 확인:/ }).tap();
  await expect(page.getByRole('heading', { name: '답변에서 짚어야 할 내용' })).toBeVisible();
});

test('화면 근처의 내용만 렌더링하고 연속 이동 중에도 빈 카드가 없음', async ({ page }) => {
  await prepare(page);
  expect(await page.locator('.card-slide').count()).toBeGreaterThan(8);
  await expect(page.locator('.card-stage')).toHaveCount(2);
  const emptyFrames = await page.evaluate(async () => {
    const viewport = document.querySelector<HTMLElement>('.card-viewport')!;
    const next = document.querySelector<HTMLButtonElement>('button[aria-label="다음 질문"]')!;
    for (let count = 0; count < 8; count++) next.click();
    const empty: number[] = [];
    const startedAt = performance.now();
    return new Promise<number[]>((resolve) => {
      function inspect() {
        const bounds = viewport.getBoundingClientRect();
        viewport.querySelectorAll<HTMLElement>('.card-slide').forEach((slide, index) => {
          const rect = slide.getBoundingClientRect();
          if (rect.right > bounds.left + 1 && rect.left < bounds.right - 1 && !slide.firstElementChild) empty.push(index);
        });
        if ((viewport.dataset.index === '8' && viewport.dataset.motion === 'idle') || performance.now() - startedAt > 5000) resolve(empty);
        else requestAnimationFrame(inspect);
      }
      requestAnimationFrame(inspect);
    });
  });
  expect(emptyFrames).toEqual([]);
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-index', '8');
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-motion', 'idle');
  await expect(page.locator('.card-stage')).toHaveCount(3);
  await page.getByRole('button', { name: '이전 질문', exact: true }).tap();
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-motion', 'idle');
  await page.getByRole('button', { name: /^답변 확인:/ }).tap();
  await expect(page.getByRole('heading', { name: '답변에서 짚어야 할 내용' })).toBeVisible();
});

test('중간 카드 재접속과 화면 너비 변경 뒤에도 같은 카드에 정렬', async ({ page }) => {
  await prepare(page);
  for (let count = 0; count < 3; count++) await page.getByRole('button', { name: '다음 질문', exact: true }).tap();
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-motion', 'idle');
  const title = await page.locator('[data-active="true"] h1').innerText();
  await page.reload();
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-index', '3');
  await expect(page.locator('[data-active="true"] h1')).toHaveText(title);
  for (const width of [390, 320, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => {
      const viewport = document.querySelector('.card-viewport')!;
      const card = viewport.querySelector('[data-active="true"]')!;
      return Math.abs(card.getBoundingClientRect().left - viewport.getBoundingClientRect().left - parseFloat(getComputedStyle(viewport).scrollPaddingLeft));
    })).toBeLessThan(1);
  }
});

test('동작 줄이기와 scrollend 미지원 환경에서 카드 선택 확정', async ({ page }) => {
  await page.addInitScript(() => {
    for (let prototype = HTMLElement.prototype; prototype; prototype = Object.getPrototypeOf(prototype)) {
      if (Object.prototype.hasOwnProperty.call(prototype, 'onscrollend')) Reflect.deleteProperty(prototype, 'onscrollend');
    }
  });
  await prepare(page);
  expect(await page.locator('.card-viewport').evaluate(element => 'onscrollend' in element)).toBe(false);
  await page.getByRole('button', { name: '다음 질문', exact: true }).tap();
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-index', '1');
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-motion', 'idle');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '다음 질문', exact: true }).tap();
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-index', '2');
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-motion', 'idle');
});

test('진단은 요청한 주소에서만 표시하고 JS 콜백과 스크롤 fps를 구분', async ({ page }) => {
  await page.goto('/#sample');
  await expect(page.locator('[data-frame-monitor]')).toHaveCount(0);
  await page.goto('/?fps=1#sample');
  const monitor = page.locator('[data-frame-monitor]');
  await expect(monitor).toHaveAttribute('data-current-hz', /^[1-9]\d*$/);
  await expect(monitor).toContainText('브라우저 기본 스크롤');
  await expect(monitor).toContainText('스크롤 fps는 측정하지 않습니다.');
  await page.getByRole('button', { name: '다음 질문', exact: true }).tap();
  await expect(page.locator('.card-viewport')).toHaveAttribute('data-motion', 'idle');
  await expect(monitor).not.toHaveAttribute('data-motion-hz');
  await page.goto('/#sample');
  await expect(page.locator('[data-frame-monitor]')).toHaveCount(0);
});

test('짧은 표본은 제외하고 충분한 구간의 콜백 지연을 집계', () => {
  expect(summarizeFrameIntervals([7])).toBeNull();
  expect(summarizeFrameIntervals(Array(12).fill(7))).toBeNull();
  expect(summarizeFrameIntervals([0, -1, NaN, Infinity])).toBeNull();
  expect(summarizeFrameIntervals(Array(60).fill(1000 / 60))?.hz).toBe(60);
  expect(summarizeFrameIntervals(Array(120).fill(1000 / 120))?.hz).toBe(120);
  const delayed = summarizeFrameIntervals([...Array(54).fill(1000 / 60), ...Array(6).fill(50)])!;
  expect(delayed.hz).toBe(50);
  expect(delayed.p95).toBe(50);
});
