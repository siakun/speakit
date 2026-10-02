import { useEffect, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';

export default function Sheet({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const origin = useRef(0);
  const dismissTouch = useRef(false);
  const [drag, setDrag] = useState(0);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); previous?.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    // iPhone의 키보드는 레이아웃 높이와 별개로 화면을 가린다. 보이는 영역 안에서만 시트를 배치한다.
    const viewport = window.visualViewport;
    const resize = () => {
      if (!dialog.current || !viewport) return;
      dialog.current.style.height = `${viewport.height}px`;
      dialog.current.style.top = `${viewport.offsetTop}px`;
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    return () => { viewport?.removeEventListener('resize', resize); viewport?.removeEventListener('scroll', resize); };
  }, []);

  return <dialog ref={dialog} className="sheet" aria-labelledby="sheet-title" onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === dialog.current) close(); }}>
    <div className="sheet-panel" style={{ transform: `translateY(${drag}px)` }}>
      <div className="sheet-grab" aria-hidden="true"
        onPointerDown={(event) => { dismissTouch.current = false; origin.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setDrag(Math.max(0, event.clientY - origin.current)); }}
        onPointerUp={(event) => { if (event.clientY - origin.current > 70) { if (event.pointerType === 'touch') dismissTouch.current = true; else setTimeout(close, 0); } setDrag(0); }}
        onTouchEnd={() => { if (dismissTouch.current) setTimeout(close, 0); dismissTouch.current = false; }}
        onTouchCancel={() => { dismissTouch.current = false; setDrag(0); }}
        onPointerCancel={() => setDrag(0)}><span /></div>
      <div className="sheet-heading"><h2 id="sheet-title">{title}</h2><button className="icon-button close-button" aria-label="닫기" onClick={close}><Icon name="close" /></button></div>
      <div className="sheet-body">{children}</div>
    </div>
  </dialog>;
}
