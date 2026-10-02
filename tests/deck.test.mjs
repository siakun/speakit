import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDeck, SAMPLE_CONTENT_DIR } from '../scripts/content.mjs';
import { DECK_FORMAT, DECK_VERSION, DeckError, decodeDeck, encodeDeck, parseDeck, readDeckText, serializeDeck } from '../src/deckFile.ts';

const header = { format: DECK_FORMAT, version: DECK_VERSION };
const sample = async () => parseDeck({ ...header, title: '샘플 덱', topics: (await loadDeck(SAMPLE_CONTENT_DIR)).topics });
const minimalTopic = {
  category: '분야',
  title: '주제',
  question: '무엇인가요?',
  checklist: [{ label: '정의', criterion: '정의를 말할 수 있는가?', detail: '설명', followup: '정의해 주시겠어요?' }],
};

test('공유 링크로 인코딩한 덱을 손실 없이 되돌린다', async () => {
  const deck = await sample();
  const payload = await encodeDeck(deck);
  // 주소에서 퍼센트 인코딩 없이 그대로 남는 문자만 사용한다.
  assert.match(payload, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeDeck(payload), deck);
});

test('잘리거나 바뀐 링크는 손상된 덱 대신 오류로 알린다', async () => {
  const payload = await encodeDeck(await sample());
  await assert.rejects(decodeDeck(payload.slice(0, Math.floor(payload.length / 2))), DeckError);
  await assert.rejects(decodeDeck('%%%'), DeckError);
});

test('질문 파일의 형식과 필수 값을 확인하고 위치를 알린다', () => {
  assert.throws(() => readDeckText('{'), /JSON 형식이 아닙니다/);
  assert.throws(() => parseDeck({ format: 'other', version: 1, topics: [minimalTopic] }), /speakit 질문 파일이 아닙니다/);
  assert.throws(() => parseDeck({ ...header, topics: [] }), /질문이 없습니다/);
  assert.throws(() => parseDeck({ ...header, topics: [{ ...minimalTopic, question: ' ' }] }), /topics\[0\]\.question/);
  assert.throws(() => parseDeck({ ...header, topics: [minimalTopic, minimalTopic] }), /topics\[1\]\.id: 질문 id가 겹칩니다/);
  const doubled = { ...minimalTopic, checklist: [...minimalTopic.checklist, ...minimalTopic.checklist] };
  assert.throws(() => parseDeck({ ...header, topics: [doubled] }), /checklist\[1\]\.label/);
});

test('손으로 쓴 파일에서 빠진 선택 값은 기본값으로 채운다', () => {
  const { title, topics: [topic] } = parseDeck({ ...header, topics: [minimalTopic] });
  assert.equal(title, '질문 파일');
  assert.equal(topic.id, '분야/주제');
  assert.deepEqual([topic.examples, topic.followups, topic.answerDraft, topic.references], [[], [], '', '']);
});

test('파일과 링크에는 다시 계산할 수 있는 항목 id를 넣지 않는다', async () => {
  const deck = await sample();
  const serialized = serializeDeck(deck);
  assert.ok(serialized.topics.every((topic) => topic.checklist.every((item) => !('id' in item))));
  assert.deepEqual(parseDeck(serialized), deck);
});
