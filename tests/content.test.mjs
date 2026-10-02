import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadDeck, parseTopic } from '../scripts/content.mjs';
import { CONTENT_DIR, SAMPLE_CONTENT_DIR } from '../scripts/content-config.mjs';

const fixture = `# 예시
## 기초질문
> 어떤 차이가 있나요?
## 평가 체크리스트
<!-- INTENT: 화면에 공개하지 않는 작성 근거 -->
- [ ] **차이**: 두 개념의 차이를 설명할 수 있는가?
  - 알아야 할 내용: 첫 개념과 둘째 개념은 다릅니다.
  - 빠뜨리면: 둘째 개념은 언제 쓰나요?
## 1질문 3답변
### 답변 A: 원리형
> 비교용 설명입니다.
- 바로잡을 부분: 잘못된 전제를 구분합니다.
## 꼬리 질문
### 둘째 개념은 언제 쓰나요?
`;

test('비교 답변을 정답으로 승격하지 않고 작성 주석을 제외한다', () => {
  const topic = parseTopic(fixture, '분야/예시.md');
  assert.equal(topic.id, '분야/예시');
  assert.equal(topic.question, '어떤 차이가 있나요?');
  assert.equal(topic.answerDraft, '');
  assert.equal(topic.examples[0].answer, '비교용 설명입니다.');
  assert.match(topic.examples[0].metadata, /바로잡을 부분/);
  assert.equal(topic.followups[0].answer, '');
  assert.ok(!JSON.stringify(topic).includes('작성 근거'));
});

test('CRLF에서도 질문과 평가 기준을 동일하게 읽는다', () => {
  assert.deepEqual(parseTopic(fixture, '분야/예시.md'), parseTopic(fixture.replaceAll('\n', '\r\n'), '분야/예시.md'));
});

test('평가 기준 누락은 불완전한 카드 대신 빌드 오류로 알린다', () => {
  assert.throws(() => parseTopic(fixture.replace('  - 알아야 할 내용: 첫 개념과 둘째 개념은 다릅니다.\n', ''), '분야/예시.md'), /설명 또는 꼬리 질문/);
  assert.throws(() => parseTopic('# 빈 노트', '분야/빈 노트.md'), /기초질문/);
});

// 지정한 질문 노트와 샘플 덱을 모두 확인한다. 샘플 덱은 브라우저 검사의 기준이라 노트를 지정해도 함께 깨지지 않아야 한다.
for (const root of new Set([CONTENT_DIR, SAMPLE_CONTENT_DIR])) {
  test(`${root === SAMPLE_CONTENT_DIR ? '샘플 덱' : '지정한 질문 노트'}의 질문, 체크 항목과 비교 답변을 빠짐없이 읽는다`, async () => {
    const { topics, files } = await loadDeck(root);
    assert.equal(topics.length, files.length);
    assert.equal(new Set(topics.map((topic) => topic.id)).size, topics.length);
    for (let index = 0; index < topics.length; index++) {
      const topic = topics[index];
      const source = (await readFile(files[index], 'utf8')).replaceAll('\r\n', '\n');
      assert.equal(topic.checklist.length, [...source.matchAll(/^- \[[ x]\] \*\*/gm)].length, topic.id);
      assert.equal(topic.examples.length, 3, topic.id);
      assert.ok(topic.examples.every((example) => example.answer.length > 0), topic.id);
      assert.ok(topic.followups.length > 0, topic.id);
      assert.ok(topic.checklist.every((item) => item.detail && item.followup), topic.id);
    }
  });
}
