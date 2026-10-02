import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { loadDeck } from './content.mjs';
import { DECK_FORMAT, DECK_VERSION, parseDeck, serializeDeck } from '../src/deckFile.ts';

// 마크다운 질문 노트 폴더를 앱이 불러오는 질문 파일(JSON)로 변환한다. 출력 경로를 빼면 형식만 검사하고 파일은 저장하지 않는다.
// 앱이 파일을 읽을 때와 같은 parseDeck을 거치므로, 여기서 통과한 파일은 앱에서도 열린다.
const [source, output] = process.argv.slice(2);
if (!source) {
  console.error('사용법: npm run deck:export -- <질문 노트 폴더> [질문 파일.json]');
  process.exit(1);
}

const root = path.resolve(source);
const { topics } = await loadDeck(root);
const deck = serializeDeck(parseDeck({ format: DECK_FORMAT, version: DECK_VERSION, title: path.basename(root), topics }));

// 앱은 브라우저의 deflate-raw와 base64url로 링크를 만든다. 압축 수준이 같지 않을 수 있어 길이는 근삿값이다.
const linkLength = deflateRawSync(JSON.stringify(deck)).toString('base64url').length;
console.log(`${deck.title}: 질문 ${deck.topics.length}개, 분야 ${new Set(deck.topics.map((topic) => topic.category)).size}개`);
console.log(`공유 링크의 질문 데이터: 약 ${linkLength.toLocaleString('ko-KR')}자`);

if (output) {
  // 다시 내보냈을 때 바뀐 질문만 diff에 드러나도록 들여쓰기한 JSON으로 저장한다. 링크에는 공백 없이 담는다.
  await writeFile(output, `${JSON.stringify(deck, null, 2)}\n`);
  console.log(`저장: ${path.resolve(output)}`);
}
