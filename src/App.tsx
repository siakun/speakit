import { memo, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import Markdown from 'react-markdown';
import Icon from './Icon';
import Sheet from './Sheet';
import CardCarousel, { type CardCarouselHandle } from './CardCarousel';
import { eligible, restore, shuffle, storageKey } from './store';
import type { Deck } from './deckFile';
import type { Followup, PracticeStore, Topic } from './types';

interface CardView { revealed: boolean; followup: Followup | null }
interface Props { deck: Deck; notice: string; onChooseFile: () => void; onForget: () => void }
// Chrome은 2MB를 넘는 주소를 열지 않는다. 링크는 만들되 열리지 않을 수 있다고 알린다.
const chromeUrlLimit = 2 * 1024 * 1024;
function InlineParagraph({ children }: { children?: ReactNode }) { return <>{children}</>; }
// 터치 도중 렌더링되어도 텍스트 노드가 교체되지 않도록 마크다운 컴포넌트의 identity를 유지한다.
const inlineComponents = { p: InlineParagraph };
function RichText({ text }: { text: string }) {
  return <div className="rich-text"><Markdown skipHtml>{text.replace(/<br\s*\/?\s*>/gi, '\n\n').replace(/<u>(.*?)<\/u>/gis, '**$1**')}</Markdown></div>;
}
const QuestionText = memo(function QuestionText({ text }: { text: string }) {
  return <Markdown skipHtml allowedElements={['p', 'code', 'strong', 'em']} unwrapDisallowed components={inlineComponents}>{text}</Markdown>;
});

// 덱이 바뀌면 상위에서 key를 바꿔 새로 마운트하므로, 덱에서 파생한 값은 마운트하는 동안 그대로다.
export default function App({ deck, notice, onChooseFile, onForget }: Props) {
  const { topics } = deck;
  const topicMap = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics]);
  const categories = useMemo(() => [...new Set(topics.map((topic) => topic.category))], [topics]);
  const [store, setStore] = useState(() => restore(topics));
  const [cardViews, setCardViews] = useState<Record<string, CardView>>({});
  const [sheet, setSheet] = useState<'library' | 'examples' | 'help' | null>(null);
  const [query, setQuery] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [complete, setComplete] = useState(false);
  // 질문이 한 장뿐이면 다시 섞어도 순서가 같다. 회차의 정체성은 질문 배열과 분리한다.
  const [sessionKey, setSessionKey] = useState(0);
  const [targetIndex, setTargetIndex] = useState(store.index);
  const [visibleSlides, setVisibleSlides] = useState([store.index]);
  const [linkStatus, setLinkStatus] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLButtonElement>(null);
  const answerRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const carouselRef = useRef<CardCarouselHandle>(null);
  const topic = topicMap.get(store.order[store.index]);
  const revealed = topic ? cardViews[topic.id]?.revealed ?? false : false;
  const followup = topic ? cardViews[topic.id]?.followup ?? null : null;
  const isSaved = topic ? store.saved.includes(topic.id) : false;
  // 슬롯 크기는 유지하고 화면 근처의 내용만 만든다. 연속 입력으로 목적지가 멀어지면
  // 현재 보이는 카드부터 목적지까지 준비해, 지나가는 중간 카드가 비지 않도록 한다.
  const renderStart = Math.max(0, Math.min(targetIndex, ...visibleSlides) - 1);
  const renderEnd = Math.min(store.order.length, Math.max(targetIndex, ...visibleSlides) + 1);

  function updateVisibleSlides(indices: number[]) {
    setVisibleSlides((previous) => previous.length === indices.length && previous.every((value, index) => value === indices[index]) ? previous : indices);
  }

  function setRevealed(value: boolean) {
    if (topic) setCardViews((previous) => ({ ...previous, [topic.id]: { followup: previous[topic.id]?.followup ?? null, revealed: value } }));
  }
  function setFollowup(value: Followup | null) {
    if (topic) setCardViews((previous) => ({ ...previous, [topic.id]: { revealed: previous[topic.id]?.revealed ?? false, followup: value } }));
  }

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(store)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [store]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [topic?.id]);

  useEffect(() => {
    let active = true;
    const restoreQuestionFocus = Boolean(document.activeElement?.closest('.card-back'));
    const animations = stageRef.current?.getAnimations({ subtree: true }) ?? [];
    Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(() => {
      if (!active) return;
      if (revealed) answerRef.current?.focus({ preventScroll: true });
      else if (restoreQuestionFocus) questionRef.current?.focus({ preventScroll: true });
    });
    return () => { active = false; };
  }, [revealed, topic?.id]);

  function resetCard() {
    setCardViews({});
    setComplete(false);
    scrollRef.current?.scrollTo(0, 0);
  }

  function navigate(direction: 'next' | 'previous') {
    carouselRef.current?.move(direction);
  }

  function selectCard(index: number) {
    setTargetIndex(index);
    if (index === store.order.length) { setComplete(true); return; }
    setComplete(false);
    setStore((previous) => ({ ...previous, index }));
  }

  function settleCard(index: number) {
    const id = store.order[index];
    // 이동 중에는 떠나는 카드의 뒷면도 보존하고, 화면 밖으로 나간 뒤에만 초기화한다.
    setCardViews((previous) => Object.keys(previous).some((key) => key !== id) ? (previous[id] ? { [id]: previous[id] } : {}) : previous);
  }

  function startSession(category: string, mode: PracticeStore['mode'], selectedId?: string) {
    const order = shuffle(eligible(topics, category, mode, store.saved));
    if (selectedId && order.includes(selectedId)) order.unshift(...order.splice(order.indexOf(selectedId), 1));
    setStore((previous) => ({ ...previous, category, mode, order, index: 0 }));
    setSessionKey((previous) => previous + 1);
    setTargetIndex(0);
    setVisibleSlides([0]);
    resetCard();
    setSheet(null);
    setQuery('');
  }

  function toggleSaved() {
    if (!topic) return;
    // 복습 중 표시를 해제해도 현재 카드는 유지한다. 다음 회차를 만들 때 필터를 다시 적용한다.
    setStore((previous) => ({ ...previous, saved: previous.saved.includes(topic.id) ? previous.saved.filter((id) => id !== topic.id) : [...previous.saved, topic.id] }));
  }

  function toggleCriterion(id: string) {
    if (!topic) return;
    setStore((previous) => {
      const values = previous.checked[topic.id] ?? [];
      return { ...previous, checked: { ...previous.checked, [topic.id]: values.includes(id) ? values.filter((value) => value !== id) : [...values, id] } };
    });
  }

  function openFollowup(value: Followup) {
    setFollowup(value);
    setRevealed(false);
    scrollRef.current?.scrollTo(0, 0);
  }

  const found = useMemo(() => {
    const needle = query.toLocaleLowerCase().trim();
    return topics.filter((item) => `${item.category} ${item.title} ${item.question}`.toLocaleLowerCase().includes(needle));
  }, [query, topics]);

  async function copyLink() {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      setLinkStatus(`링크를 복사했습니다. 주소 길이는 ${url.length.toLocaleString('ko-KR')}자입니다.${url.length > chromeUrlLimit ? ' 2MB가 넘어 Chrome에서는 열리지 않습니다.' : ''}`);
    } catch {
      setLinkStatus('링크를 복사하지 못했습니다. 주소창의 주소를 직접 복사해 주세요.');
    }
  }

  const deckLabel = store.category === 'all' ? '전체 분야' : store.category;

  return <div className="app-shell">
    <header className="app-header">
      <div className="wordmark"><Icon name="cards" size={19} /><span>기초질문</span></div>
      <button className="deck-button" onClick={() => setSheet('library')} aria-label="연습할 질문 선택">{store.mode === 'saved' ? '다시 볼 질문' : deckLabel}<Icon name="down" size={16} /></button>
    </header>

    <main className="study-area">
      {storageError && <p className="storage-notice" role="status">기록을 저장하지 못했습니다. 이 화면에서는 계속 연습할 수 있습니다.</p>}
      {notice && <p className="storage-notice" role="alert">{notice}</p>}
      {!topic ? <section className="empty-state"><Icon name="bookmark" size={32} /><h1>다시 볼 질문을 모아 보세요</h1><p>카드의 책갈피를 누르면<br />여기서 모아 연습할 수 있습니다.</p><button className="primary-button" onClick={() => startSession('all', 'all')}>전체 질문으로 연습</button></section>
      : <>
        <div className="card-context" style={complete ? { visibility: 'hidden' } : undefined}>
          {followup ? <button className="context-back" onClick={() => { setFollowup(null); setRevealed(true); }}><span className="rotate"><Icon name="chevron" size={16} /></span>기초질문으로</button> : <span className="eyebrow">{topic.category}</span>}
          <button className={`icon-button bookmark-button ${isSaved ? 'selected' : ''}`} onClick={toggleSaved} aria-label={isSaved ? '다시 볼 질문에서 해제' : '다시 볼 질문에 저장'} aria-pressed={isSaved}><Icon name="bookmark" size={19} /></button>
        </div>
        <CardCarousel key={sessionKey} ref={carouselRef} initialIndex={store.index} activeIndex={complete ? store.order.length : store.index} disabled={Boolean(sheet || followup)} onTargetChange={selectCard} onSettle={settleCard} onVisibleChange={updateVisibleSlides}>
          {store.order.map((id, index) => {
            const item = topicMap.get(id)!;
            const active = !complete && index === store.index;
            const slideRevealed = cardViews[id]?.revealed ?? false;
            const slideFollowup = cardViews[id]?.followup ?? null;
            const title = slideFollowup?.question ?? item.question;
            const checked = (store.checked[id] ?? []).filter((key) => item.checklist.some((criterion) => criterion.id === key));
            return <div className="card-slide" key={id} data-active={active} data-topic={id} aria-hidden={!active} inert={!active}>
              {(active || slideRevealed || (index >= renderStart && index <= renderEnd)) && <section ref={active ? stageRef : undefined} className="card-stage">
          <div className={`card-flipper ${slideRevealed ? 'is-flipped' : ''}`}>
            <QuestionFront title={title} position={index + 1} followup={Boolean(slideFollowup)} hidden={slideRevealed} buttonRef={active ? questionRef : undefined} onReveal={active ? () => { setRevealed(true); scrollRef.current?.scrollTo(0, 0); } : undefined} />
            <div className="card-face card-back" aria-hidden={!slideRevealed} inert={!slideRevealed}>
              <button ref={active ? answerRef : undefined} className="answer-question" data-card-turn onClick={() => setRevealed(false)} aria-label="질문으로 돌아가기"><span><QuestionText text={title} /></span><Icon name="turn" size={17} /></button>
              <div className="answer-scroll" ref={active ? scrollRef : undefined} tabIndex={slideRevealed && active ? 0 : -1} aria-label="답변 기준과 꼬리 질문">
                {(active || slideRevealed) && (slideFollowup ? <div className="followup-answer"><p className="eyebrow">{slideFollowup.label ? `관련 기준 / ${slideFollowup.label}` : '답변'}</p>{slideFollowup.answer ? <RichText text={slideFollowup.answer} /> : <><p>이 꼬리 질문의 답변은 아직 작성되지 않았습니다.</p><p className="muted">기초질문의 평가 기준과 비교해 보세요.</p></>}<button className="secondary-button" onClick={() => { setFollowup(null); setRevealed(true); }}>기초질문 기준으로 돌아가기</button></div>
                : <Answer topic={item} checked={checked} toggleCriterion={toggleCriterion} openFollowup={openFollowup} openExamples={() => setSheet('examples')} />)}
              </div>
            </div>
          </div>
        </section>}
            </div>;
          })}
          <div className="card-slide" data-active={complete} aria-hidden={!complete} inert={!complete}>
            <section className="empty-state completion-card"><span className="completion-mark"><Icon name="check" size={26} /></span><p className="eyebrow">이번 연습을 마쳤습니다</p><h1>한 번 더 말하면,<br />조금 더 또렷해집니다.</h1><p>{store.order.length}개의 질문을 모두 넘겼습니다.</p><button className="primary-button" onClick={() => startSession(store.category, store.mode)}><Icon name="shuffle" size={18} />다시 섞어서 연습</button>{store.saved.length > 0 && <button className="text-button" onClick={() => startSession('all', 'saved')}>다시 볼 질문 {store.saved.length}개</button>}</section>
          </div>
        </CardCarousel>
        <div className="under-card"><span>{complete ? '오른쪽으로 쓸어 넘기면 질문으로 돌아갑니다.' : followup ? '내 답변에서 나온 말을 더 깊이 설명해 보세요.' : revealed ? '말한 내용과 기준을 천천히 대조해 보세요.' : '좌우로 쓸어 넘기면 다른 질문으로 이동합니다.'}</span></div>
      </>}
    </main>

    <footer className="study-footer">
      <button className="icon-button nav-button rotate" aria-label="이전 질문" disabled={!topic || targetIndex === 0 || Boolean(followup)} onClick={() => navigate('previous')}><Icon name="chevron" size={20} /></button>
      <div className="position" aria-live="polite" aria-atomic="true"><span>{String(topic ? Math.min(targetIndex + 1, store.order.length) : 0).padStart(2, '0')}</span><span className="position-divider">/</span><span>{String(store.order.length).padStart(2, '0')}</span></div>
      <button className="icon-button nav-button" aria-label="다음 질문" disabled={!topic || targetIndex === store.order.length || Boolean(followup)} onClick={() => navigate('next')}><Icon name="chevron" size={20} /></button>
    </footer>

    {sheet && <Sheet title={sheet === 'library' ? '연습할 질문' : sheet === 'examples' ? '답변에 따라 달라지는 질문' : '이렇게 연습해 보세요'} close={() => setSheet(null)}>
      {sheet === 'library' && <>
        <label className="search-field"><Icon name="search" size={18} /><input type="search" placeholder="질문이나 개념 검색" aria-label="질문 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        {query.trim() ? <div className="search-results"><p className="section-caption">질문 {found.length}개</p>{found.map((item) => <button className="search-result" key={item.id} onClick={() => startSession(item.category, 'all', item.id)}><span className="eyebrow">{item.category}</span><span>{item.question}</span></button>)}{found.length === 0 && <p className="muted no-results">일치하는 질문이 없습니다.</p>}</div>
        : <><div className="library-group">
          <LibraryRow label="전체 질문" count={topics.length} active={store.category === 'all' && store.mode === 'all'} onClick={() => startSession('all', 'all')} />
          <LibraryRow label="다시 볼 질문" count={store.saved.length} active={store.mode === 'saved'} onClick={() => startSession('all', 'saved')} icon="bookmark" />
        </div><p className="section-caption">분야별 연습</p><div className="library-group">{categories.map((category) => <LibraryRow key={category} label={category} count={topics.filter((item) => item.category === category).length} active={store.category === category && store.mode === 'all'} onClick={() => startSession(category, 'all')} />)}</div>
        <div className="library-tools"><button className="text-button" onClick={() => startSession(store.category, store.mode)}><Icon name="shuffle" size={17} />현재 질문 다시 섞기</button><button className="icon-button" aria-label="연습 방법" onClick={() => setSheet('help')}><Icon name="info" size={19} /></button></div>
        <p className="section-caption">질문 파일: {deck.title}</p>
        <div className="library-group">
          <button className="library-row" onClick={() => void copyLink()}><Icon name="link" size={17} /><span>공유 링크 복사</span></button>
          {/* 불러오기에 실패하면 본문에 알리므로 시트를 먼저 닫는다. 파일 선택 창은 이 탭 입력을 처리하는 동안 열어야 브라우저가 막지 않는다. */}
          <button className="library-row" onClick={() => { setSheet(null); onChooseFile(); }}><Icon name="upload" size={17} /><span>다른 질문 파일 불러오기</span></button>
          <button className="library-row" onClick={onForget}><Icon name="close" size={17} /><span>이 기기에서 지우기</span></button>
        </div>
        {linkStatus && <p className="muted link-status" role="status">{linkStatus}</p>}</>}
      </>}
      {sheet === 'examples' && topic && <div className="examples"><p className="sheet-intro">세 답변은 서로 다른 말하기 방식의 예시입니다. 정답이 아니며, 각 답변의 누락과 오류까지 함께 살펴보세요. 실무형 경험담은 가상의 사례입니다.</p>{topic.examples.map((example) => <details key={example.title} className="example"><summary>{example.title}<Icon name="down" size={17} /></summary><blockquote><RichText text={example.answer} /></blockquote><RichText text={example.metadata} /></details>)}{topic.answerDraft && <details className="example"><summary>작성 중인 답변 노트<Icon name="down" size={17} /></summary><p className="muted">질문 파일에 적힌 초안입니다. 완성된 답안인지는 평가 기준과 함께 확인해 주세요.</p><RichText text={topic.answerDraft} /></details>}</div>}
      {sheet === 'help' && <div className="help-content"><p className="sheet-intro">읽어서 아는 지식을, 말로 설명할 수 있는 지식으로.</p><ol><li><strong>질문만 보고 말합니다.</strong><p>면접관에게 설명하듯 문장을 끝까지 말해 보세요.</p></li><li><strong>카드를 탭해 대조합니다.</strong><p>답변에 담았던 평가 항목을 체크합니다. 체크는 직접 한 자기 점검이며 자동 평가가 아닙니다.</p></li><li><strong>부족했던 부분을 이어 말합니다.</strong><p>각 항목의 꼬리 질문을 누르면 그 질문으로 연습합니다. 다음에 다시 보고 싶다면 책갈피에 저장해 주세요.</p></li></ol><p className="muted">질문은 한 회차 안에서 중복 없이 무작위로 나옵니다. 불러온 질문 파일, 책갈피, 체크한 항목과 현재 위치는 이 브라우저에 저장됩니다. 질문은 사이트 서버로 보내지 않고 주소의 # 뒤에만 담기므로, 공유 링크를 받은 사람은 질문을 모두 볼 수 있습니다. 브라우저 데이터를 지우면 기록도 사라집니다.</p></div>}
    </Sheet>}
  </div>;
}

const QuestionFront = memo(function QuestionFront({ title, position, followup = false, hidden = false, buttonRef, onReveal }: { title: string; position: number; followup?: boolean; hidden?: boolean; buttonRef?: Ref<HTMLButtonElement>; onReveal?: () => void }) {
  return <div className="card-face card-front" aria-hidden={hidden} inert={hidden}>
    <span className="card-overline">{followup ? 'FOLLOW-UP' : 'QUESTION'}</span>
    <button ref={buttonRef} data-card-turn className="question-turn" tabIndex={onReveal ? 0 : -1} onClick={onReveal} aria-label={`답변 확인: ${title}`}>
      <div className="question-content"><h1 className={title.length > 85 ? 'long-question' : ''}><QuestionText text={title} /></h1><p>소리 내어 설명해 보세요.</p></div>
      <span className="tap-hint"><Icon name="turn" size={17} />탭하여 답변 확인</span>
    </button>
    <span className="card-corner" aria-hidden="true">{followup ? <Icon name="branch" size={15} /> : String(position).padStart(2, '0')}</span>
  </div>;
});

function Answer({ topic, checked, toggleCriterion, openFollowup, openExamples }: { topic: Topic; checked: string[]; toggleCriterion: (id: string) => void; openFollowup: (value: Followup) => void; openExamples: () => void }) {
  return <>
    <div className="answer-heading"><h2>답변에서 짚어야 할 내용</h2><span className="check-count" aria-live="polite">{checked.length}/{topic.checklist.length}</span></div>
    <p className="answer-intro">말했던 내용에 체크해 보세요.</p>
    <div className="criteria">{topic.checklist.map((criterion) => <section className={`criterion ${checked.includes(criterion.id) ? 'is-checked' : ''}`} key={criterion.id}>
      <label className="criterion-label"><input type="checkbox" checked={checked.includes(criterion.id)} onChange={() => toggleCriterion(criterion.id)} /><span className="checkbox-mark"><Icon name="check" size={13} /></span><span>{criterion.label}</span></label>
      <RichText text={criterion.detail} />
      <button className="followup-link" onClick={() => openFollowup({ question: criterion.followup, answer: criterion.detail, label: criterion.label })}><Icon name="branch" size={16} /><span><QuestionText text={criterion.followup} /></span><Icon name="chevron" size={14} /></button>
    </section>)}</div>
    <details className="more-followups"><summary>꼬리 질문 더 보기 <span>{topic.followups.length}</span><Icon name="down" size={17} /></summary><div>{topic.followups.map((item) => <button className="extra-question" key={item.question} onClick={() => openFollowup(item)}><span><QuestionText text={item.question} /></span><Icon name="chevron" size={16} /></button>)}</div></details>
    <button className="examples-button" onClick={openExamples}><span><strong>1질문 3답변</strong><small>내 답변의 키워드는 어떤 질문으로 이어질까요?</small></span><Icon name="chevron" size={18} /></button>
    {topic.references && <details className="references"><summary>참고자료</summary><RichText text={topic.references} /></details>}
  </>;
}

function LibraryRow({ label, count, active, onClick, icon }: { label: string; count: number; active: boolean; onClick: () => void; icon?: 'bookmark' }) {
  return <button className={`library-row ${active ? 'active' : ''}`} onClick={onClick}>{icon && <Icon name={icon} size={17} />}<span>{label}</span><span className="row-count">{count}</span>{active ? <Icon name="check" size={17} /> : <span className="row-spacer" />}</button>;
}
