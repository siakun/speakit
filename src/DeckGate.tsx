import { useEffect, useRef, useState } from 'react';
import App from './App';
import Icon from './Icon';
import { DeckError, decodeDeck, encodeDeck, parseDeck, readDeckText, type Deck } from './deckFile';
import { storageKey } from './store';

// 질문은 사이트에 들어 있지 않다. 덱은 주소의 조각(#deck=), 이 기기에 저장한 덱, 사용자가 고른 파일에서만 만든다.
// 조각(# 뒤)은 브라우저가 서버로 보내지 않으므로 질문 데이터는 사이트 호스팅을 거치지 않는다.
const deckStorageKey = 'speakit:deck';
const linkPrefix = '#deck=';
const sampleHash = '#sample';

type Source = { kind: 'sample' } | { kind: 'link'; payload: string };
interface Loaded { deck: Deck; key: number }

function sourceFromHash(hash: string): Source | null {
  if (hash === sampleHash) return { kind: 'sample' };
  if (hash.startsWith(linkPrefix) && hash.length > linkPrefix.length) return { kind: 'link', payload: hash.slice(linkPrefix.length) };
  return null;
}

function hashOf(source: Source) {
  return source.kind === 'sample' ? sampleHash : linkPrefix + source.payload;
}

async function loadSource(source: Source): Promise<Deck> {
  if (source.kind === 'link') return decodeDeck(source.payload);
  return parseDeck((await import('virtual:sample-deck')).default);
}

export default function DeckGate() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef(0);

  function show(source: Source, deck: Deck) {
    // 주소에 덱을 담아 두면 주소를 그대로 복사해 다른 기기에서 열 수 있다.
    const hash = hashOf(source);
    if (location.hash !== hash) history.replaceState(null, '', hash);
    // 홈 화면 바로가기처럼 # 없이 열어도 이어서 연습하도록 이 기기에도 저장한다. 저장하지 못해도 이번 화면에서는 연습할 수 있다.
    try { localStorage.setItem(deckStorageKey, hash); } catch { /* 저장 공간이 막힌 브라우저 */ }
    setLoaded((previous) => ({ deck, key: (previous?.key ?? 0) + 1 }));
    setError('');
  }

  async function open(work: () => Promise<{ source: Source; deck: Deck }>, fallback: string) {
    // 링크를 연속으로 열면 마지막 요청의 결과만 화면에 반영한다.
    const id = ++request.current;
    setPending(true);
    try {
      const { source, deck } = await work();
      if (id === request.current) show(source, deck);
    } catch (cause) {
      if (id === request.current) setError(cause instanceof DeckError ? cause.message : fallback);
    } finally {
      if (id === request.current) setPending(false);
    }
  }

  function openSource(source: Source) {
    return open(async () => ({ source, deck: await loadSource(source) }), '질문을 불러오지 못했습니다.');
  }

  function openFile(file: File) {
    return open(async () => {
      const deck = readDeckText(await file.text());
      return { source: { kind: 'link', payload: await encodeDeck(deck) }, deck };
    }, '파일을 읽지 못했습니다.');
  }

  function forget() {
    // 질문 id에는 질문 제목이 들어가므로 덱을 지울 때 책갈피와 체크 기록도 함께 지운다.
    try { localStorage.removeItem(deckStorageKey); localStorage.removeItem(storageKey); } catch { /* 저장 공간이 막힌 브라우저 */ }
    history.replaceState(null, '', location.pathname + location.search);
    request.current++;
    setLoaded(null);
    setPending(false);
    setError('');
  }

  useEffect(() => {
    let stored: Source | null = null;
    try { stored = sourceFromHash(localStorage.getItem(deckStorageKey) ?? ''); } catch { /* 저장 공간이 막힌 브라우저 */ }
    const initial = sourceFromHash(location.hash) ?? stored;
    if (initial) void openSource(initial);
    else setPending(false);
    // 같은 탭의 주소창에 다른 공유 링크를 붙여 넣으면 새로 고침 없이 조각만 바뀐다.
    const onHashChange = () => {
      const source = sourceFromHash(location.hash);
      if (source) void openSource(source);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const chooseFile = () => fileInput.current?.click();

  return <>
    <input ref={fileInput} className="visually-hidden" type="file" accept=".json,application/json" tabIndex={-1} aria-hidden="true"
      onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void openFile(file); }} />
    {loaded ? <App key={loaded.key} deck={loaded.deck} notice={error} onChooseFile={chooseFile} onForget={forget} />
    : <div className="app-shell">
      <header className="app-header"><div className="wordmark"><Icon name="cards" size={19} /><span>기초질문</span></div></header>
      <main className="study-area">
        <section className="empty-state deck-start">
          {pending ? <p role="status">질문을 불러오는 중입니다.</p> : <>
            <Icon name="upload" size={32} />
            <h1>질문 파일을 불러와 주세요</h1>
            <p>질문과 답변은 이 사이트에 들어 있지 않습니다.<br />고른 JSON 파일은 이 브라우저와 주소 안에만 담깁니다.</p>
            {error && <p className="deck-error" role="alert">{error}</p>}
            <button className="primary-button" onClick={chooseFile}>질문 파일 불러오기</button>
            <button className="text-button" onClick={() => void openSource({ kind: 'sample' })}>샘플 덱으로 둘러보기</button>
          </>}
        </section>
      </main>
    </div>}
  </>;
}
