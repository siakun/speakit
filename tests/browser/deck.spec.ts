import { test, expect, devices, type Page } from '@playwright/test';
import { loadDeck, SAMPLE_CONTENT_DIR } from '../../scripts/content.mjs';

interface DeckUpload { name: string; mimeType: string; buffer: Buffer }

// 샘플 덱의 일부를 다른 제목의 질문 파일로 만들어, 샘플이 아니라 고른 파일이 열렸는지 구분한다.
async function deckFile(count: number): Promise<DeckUpload> {
  const { topics } = await loadDeck(SAMPLE_CONTENT_DIR);
  const deck = { format: 'speakit-deck', version: 1, title: '불러온 덱', topics: topics.slice(0, count) };
  return { name: 'deck.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(deck)) };
}

async function chooseFile(page: Page, file: DeckUpload) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '질문 파일 불러오기' }).tap();
  await (await chooser).setFiles(file);
}

const startHeading = (page: Page) => page.getByRole('heading', { name: '질문 파일을 불러와 주세요' });

test('불러온 질문 파일을 주소에 담고, 저장소가 빈 다른 기기에서 그 주소만으로 연다', async ({ page, browser }) => {
  await page.goto('/');
  await expect(startHeading(page)).toBeVisible();
  await chooseFile(page, await deckFile(3));
  await expect(page.getByRole('button', { name: /^답변 확인:/ })).toBeVisible();
  expect(new URL(page.url()).hash).toMatch(/^#deck=[\w-]+$/);

  const other = await browser.newContext({ ...devices['iPhone 13'] });
  try {
    const remote = await other.newPage();
    await remote.goto(page.url());
    await remote.getByRole('button', { name: '연습할 질문 선택' }).tap();
    await expect(remote.getByText('질문 파일: 불러온 덱')).toBeVisible();
    await expect(remote.locator('.library-row').filter({ hasText: '전체 질문' })).toContainText('3');
  } finally {
    await other.close();
  }
});

test('홈 화면 바로가기처럼 # 없이 열어도 이 기기에 저장한 덱으로 이어서 연습한다', async ({ page }) => {
  await page.goto('/');
  await chooseFile(page, await deckFile(2));
  await expect(page.getByRole('button', { name: /^답변 확인:/ })).toBeVisible();
  const { hash } = new URL(page.url());
  await page.goto('/?from=home');
  await expect(page.getByRole('button', { name: /^답변 확인:/ })).toBeVisible();
  expect(new URL(page.url()).hash).toBe(hash);
});

test('형식이 다른 파일과 잘린 링크는 오류를 알리고 시작 화면에 머문다', async ({ page }) => {
  await page.goto('/');
  await chooseFile(page, { name: 'wrong.json', mimeType: 'application/json', buffer: Buffer.from('{"topics":[]}') });
  await expect(page.getByRole('alert')).toContainText('speakit 질문 파일이 아닙니다');
  await page.goto('/#deck=AAAA');
  await expect(page.getByRole('alert')).toContainText('링크가 잘리지 않았는지');
  await expect(startHeading(page)).toBeVisible();
});

test('이 기기에서 지우면 덱과 연습 기록을 함께 지우고 시작 화면으로 돌아간다', async ({ page }) => {
  await page.goto('/#sample');
  await page.getByRole('button', { name: '다시 볼 질문에 저장', exact: true }).tap();
  await page.getByRole('button', { name: '연습할 질문 선택' }).tap();
  await page.getByRole('button', { name: '이 기기에서 지우기' }).tap();
  await expect(startHeading(page)).toBeVisible();
  expect(await page.evaluate(() => [location.hash, localStorage.length])).toEqual(['', 0]);
  await page.reload();
  await expect(startHeading(page)).toBeVisible();
});

test('공유 링크 복사는 덱이 담긴 현재 주소 전체를 복사한다', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', '클립보드 읽기 권한은 Chromium에서만 부여할 수 있습니다.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await chooseFile(page, await deckFile(3));
  await page.getByRole('button', { name: '연습할 질문 선택' }).tap();
  await page.getByRole('button', { name: '공유 링크 복사' }).tap();
  await expect(page.getByRole('status')).toContainText('링크를 복사했습니다');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
});
