import { useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';

export interface CardCarouselHandle {
  move: (direction: 'next' | 'previous') => void;
}

interface Props {
  ref: Ref<CardCarouselHandle>;
  initialIndex: number;
  activeIndex: number;
  disabled: boolean;
  onTargetChange: (index: number) => void;
  onSettle: (index: number) => void;
  onVisibleChange: (indices: number[]) => void;
  children: ReactNode;
}

// 손가락 추종, 관성과 스냅은 브라우저의 스크롤 엔진에 맡긴다. JS는 카드 선택과
// 렌더링 범위만 동기화하며, rAF나 transform으로 스크롤 애니메이션을 구동하지 않는다.
export default function CardCarousel({ ref, initialIndex, activeIndex, disabled, onTargetChange, onSettle, onVisibleChange, children }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const startIndex = useRef(initialIndex);
  const latest = useRef({ disabled, onTargetChange, onSettle, onVisibleChange });
  latest.current = { disabled, onTargetChange, onSettle, onVisibleChange };
  const controls = useRef<{ move: CardCarouselHandle['move']; stop: () => void } | null>(null);
  const [motion, setMotion] = useState('idle');

  useImperativeHandle(ref, () => ({ move: (direction) => controls.current?.move(direction) }), []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current!;
    const slides = Array.from(viewport.querySelectorAll<HTMLElement>('.card-slide'));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let positions: number[] = [];
    let width = 0;
    let selected = startIndex.current;
    let destination: number | null = null;
    let scrolling = false;
    let settleTimer = 0;
    const visible = new Set<number>();

    function select(index: number) {
      if (index === selected) return;
      selected = index;
      latest.current.onTargetChange(index);
    }

    function nearest() {
      // 같은 크기의 카드 간격은 리사이즈 때만 측정하고 스크롤 중에는 캐시를 사용한다.
      const step = positions[1] ?? viewport.clientWidth;
      return Math.max(0, Math.min(slides.length - 1, Math.round(viewport.scrollLeft / step)));
    }

    function finish() {
      window.clearTimeout(settleTimer);
      destination = null;
      scrolling = false;
      select(nearest());
      setMotion('idle');
      latest.current.onSettle(selected);
    }

    function scheduleSettle() {
      // 종료 통지가 없거나 취소된 스크롤에도 대응한다. 이벤트가 멎고 실제 스냅 위치에
      // 도달했을 때만 상태를 확정하며, 손가락 위치나 애니메이션 자체는 제어하지 않는다.
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        const index = nearest();
        if (Math.abs(viewport.scrollLeft - positions[index]) < 1 && (destination === null || destination === index)) finish();
      }, 180);
    }

    function onScroll() {
      if (!scrolling) { scrolling = true; setMotion('scrolling'); }
      // 버튼 연속 입력 중에는 목적지를 유지하고, 지나가는 카드로 선택을 되돌리지 않는다.
      if (destination === null) select(nearest());
      scheduleSettle();
    }

    function onTouchStart() {
      // 진행 중인 버튼 이동을 손으로 다시 잡으면 현재 위치에서 선택을 이어간다.
      if (destination !== null) { destination = null; select(nearest()); }
    }

    function onWheel() {
      if (destination !== null) { destination = null; select(nearest()); }
    }

    function stop() {
      viewport.scrollTo({ left: positions[selected], behavior: 'auto' });
      finish();
    }

    function measure() {
      // 주소창 때문에 높이만 달라질 때는 진행 중인 스크롤을 건드리지 않는다.
      if (width === viewport.clientWidth) return;
      width = viewport.clientWidth;
      const first = slides[0].offsetLeft;
      positions = slides.map((slide) => slide.offsetLeft - first);
      stop();
    }

    controls.current = {
      stop,
      move(direction) {
        if (latest.current.disabled) return;
        const index = Math.max(0, Math.min(slides.length - 1, (destination ?? selected) + (direction === 'next' ? 1 : -1)));
        destination = index;
        select(index);
        const aligned = Math.abs(viewport.scrollLeft - positions[index]) < 1;
        scrolling = true;
        setMotion('scrolling');
        viewport.scrollTo({ left: positions[index], behavior: reducedMotion.matches || aligned ? 'auto' : 'smooth' });
        if (reducedMotion.matches || aligned) finish();
        else scheduleSettle();
      },
    };

    measure();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const index = slides.indexOf(entry.target as HTMLElement);
        if (entry.isIntersecting && entry.intersectionRatio > 0) visible.add(index);
        else visible.delete(index);
      }
      latest.current.onVisibleChange(visible.size ? [...visible].sort((a, b) => a - b) : [selected]);
    }, { root: viewport });
    slides.forEach((slide) => observer.observe(slide));
    const resize = new ResizeObserver(measure);
    resize.observe(viewport);
    viewport.addEventListener('scroll', onScroll, { passive: true });
    // 지원되는 브라우저에서는 터치 이벤트 추정보다 기본 스크롤 엔진의 완료 통지를 따른다.
    viewport.addEventListener('scrollend', finish);
    viewport.addEventListener('wheel', onWheel, { passive: true });
    viewport.addEventListener('touchstart', onTouchStart, { passive: true });
    return () => {
      controls.current = null;
      window.clearTimeout(settleTimer);
      observer.disconnect();
      resize.disconnect();
      viewport.removeEventListener('scroll', onScroll);
      viewport.removeEventListener('scrollend', finish);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('touchstart', onTouchStart);
    };
  }, []);

  useLayoutEffect(() => { if (disabled) controls.current?.stop(); }, [disabled]);

  return <div ref={viewportRef} className="card-viewport" data-motion={motion} data-index={activeIndex} data-disabled={disabled} data-scroll-engine="native" aria-label="면접 질문 카드">
    <div className="card-track">{children}</div>
  </div>;
}
