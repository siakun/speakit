import type { Topic } from './types.ts';

// 질문 파일(JSON)의 형식과 공유 링크 인코딩을 이 파일에서만 정한다. 앱, 변환 스크립트, 검사가 함께 사용하므로
// Node가 타입만 지우고 바로 실행할 수 있는 문법(enum, namespace 없이)으로 유지한다.
// 질문은 사이트에 들어 있지 않으므로 앱이 받는 질문은 사용자가 고른 파일이나 링크에 담긴 이 형식뿐이다.
export const DECK_FORMAT = 'speakit-deck';
export const DECK_VERSION = 1;

export interface Deck {
  title: string;
  topics: Topic[];
}

export class DeckError extends Error {
  name = 'DeckError';
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new DeckError(`${path}: 객체가 필요합니다.`);
}

function readText(value: unknown, path: string, optional = false): string {
  if (typeof value === 'string' && (optional || value.trim())) return value;
  if (optional && (value === undefined || value === null)) return '';
  throw new DeckError(`${path}: ${optional ? '문자열' : '비어 있지 않은 문자열'}이 필요합니다.`);
}

function readList<T>(value: unknown, path: string, readItem: (item: unknown, itemPath: string) => T): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new DeckError(`${path}: 배열이 필요합니다.`);
  return value.map((item, index) => readItem(item, `${path}[${index}]`));
}

// 손으로 쓴 파일도 받을 수 있도록 오류 메시지에 문제가 된 값의 위치를 적는다.
export function parseDeck(value: unknown): Deck {
  const root = readRecord(value, '질문 파일');
  if (root.format !== DECK_FORMAT || root.version !== DECK_VERSION) {
    throw new DeckError(`speakit 질문 파일이 아닙니다. format이 "${DECK_FORMAT}"이고 version이 ${DECK_VERSION}인 JSON이 필요합니다.`);
  }
  const ids = new Set<string>();
  const topics = readList(root.topics, 'topics', (item, path): Topic => {
    const topic = readRecord(item, path);
    const category = readText(topic.category, `${path}.category`);
    const title = readText(topic.title, `${path}.title`);
    const id = readText(topic.id, `${path}.id`, true) || `${category}/${title}`;
    // 책갈피와 체크 기록을 질문 id로 저장하므로 id가 겹치면 기록이 섞인다.
    if (ids.has(id)) throw new DeckError(`${path}.id: 질문 id가 겹칩니다(${id}).`);
    ids.add(id);
    const labels = new Set<string>();
    return {
      id,
      category,
      title,
      question: readText(topic.question, `${path}.question`),
      checklist: readList(topic.checklist, `${path}.checklist`, (entry, entryPath) => {
        const criterion = readRecord(entry, entryPath);
        const label = readText(criterion.label, `${entryPath}.label`);
        if (labels.has(label)) throw new DeckError(`${entryPath}.label: 한 질문 안에서 항목 이름이 겹칩니다(${label}).`);
        labels.add(label);
        return {
          id: label,
          label,
          criterion: readText(criterion.criterion, `${entryPath}.criterion`),
          detail: readText(criterion.detail, `${entryPath}.detail`),
          followup: readText(criterion.followup, `${entryPath}.followup`),
        };
      }),
      examples: readList(topic.examples, `${path}.examples`, (entry, entryPath) => {
        const example = readRecord(entry, entryPath);
        return { title: readText(example.title, `${entryPath}.title`), answer: readText(example.answer, `${entryPath}.answer`), metadata: readText(example.metadata, `${entryPath}.metadata`, true) };
      }),
      followups: readList(topic.followups, `${path}.followups`, (entry, entryPath) => {
        const followup = readRecord(entry, entryPath);
        return { question: readText(followup.question, `${entryPath}.question`), answer: readText(followup.answer, `${entryPath}.answer`, true) };
      }),
      answerDraft: readText(topic.answerDraft, `${path}.answerDraft`, true),
      references: readText(topic.references, `${path}.references`, true),
    };
  });
  if (!topics.length) throw new DeckError('질문 파일에 질문이 없습니다.');
  return { title: readText(root.title, 'title', true).trim() || '질문 파일', topics };
}

export function readDeckText(text: string): Deck {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new DeckError('JSON 형식이 아닙니다.'); }
  return parseDeck(value);
}

// 파일과 링크에는 다시 계산할 수 있는 값(평가 항목의 id)을 넣지 않는다.
export function serializeDeck(deck: Deck) {
  return {
    format: DECK_FORMAT,
    version: DECK_VERSION,
    title: deck.title,
    topics: deck.topics.map(({ id, category, title, question, checklist, examples, followups, answerDraft, references }) => ({
      id,
      category,
      title,
      question,
      checklist: checklist.map(({ label, criterion, detail, followup }) => ({ label, criterion, detail, followup })),
      examples,
      followups,
      answerDraft,
      references,
    })),
  };
}

async function transform(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  // 한 번에 넘기는 인자 수가 엔진 한도를 넘지 않도록 나눠서 문자열로 바꾼다.
  for (let index = 0; index < bytes.length; index += 0x2000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x2000));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

// 링크 데이터는 압축한 JSON을 URL에서 퍼센트 인코딩이 필요 없는 base64url로 바꾼 것이다.
// 한글 JSON을 그대로 넣으면 퍼센트 인코딩 때문에 열 배 가까이 길어진다. 압축은 브라우저 내장 deflate-raw만 사용한다.
export async function encodeDeck(deck: Deck): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(serializeDeck(deck)));
  return toBase64Url(await transform(json, new CompressionStream('deflate-raw')));
}

export async function decodeDeck(payload: string): Promise<Deck> {
  let value: unknown;
  try {
    const json = new TextDecoder().decode(await transform(fromBase64Url(payload), new DecompressionStream('deflate-raw')));
    value = JSON.parse(json);
  } catch {
    throw new DeckError('링크에 담긴 질문 데이터를 읽지 못했습니다. 복사하거나 보내는 과정에서 링크가 잘리지 않았는지 확인해 주세요.');
  }
  return parseDeck(value);
}
