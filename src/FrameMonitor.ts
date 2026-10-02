// 기본 스크롤은 JS 콜백과 독립적으로 표시된다. 이 진단은 메인 스레드의 콜백
// 주기만 관찰하고, 그 수치를 스크롤의 실제 fps로 표시하지 않는다.
export function summarizeFrameIntervals(intervals: number[]) {
  const samples = intervals.filter((interval) => Number.isFinite(interval) && interval > 0);
  const duration = samples.reduce((sum, interval) => sum + interval, 0);
  if (samples.length < 8 || duration < 250) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    hz: Math.round(1000 * samples.length / duration),
    p95: sorted[Math.ceil(sorted.length * .95) - 1],
    samples: samples.length,
    duration,
  };
}

export function mountFrameMonitor() {
  const panel = document.createElement('output');
  panel.dataset.frameMonitor = '';
  panel.setAttribute('aria-label', '프레임 진단');
  panel.setAttribute('aria-live', 'off');
  panel.style.cssText = 'position:fixed;top:max(8px,env(safe-area-inset-top));right:8px;z-index:1000;pointer-events:none;white-space:pre;font:10px/1.7 ui-monospace,monospace;color:#eee;background:#191919ed;border:1px solid #555;border-radius:8px;padding:7px 10px;font-variant-numeric:tabular-nums';
  const note = '\n가로 이동: 브라우저 기본 스크롤\n스크롤 fps는 측정하지 않습니다.';
  panel.textContent = `JS 콜백 측정 중${note}`;
  document.body.append(panel);

  const intervals: number[] = [];
  let previousTime = 0;
  let publishedAt = 0;
  let frame = 0;

  function tick(time: number) {
    if (previousTime) intervals.push(time - previousTime);
    if (time - publishedAt >= 1000) {
      const result = summarizeFrameIntervals(intervals);
      if (result) panel.dataset.currentHz = String(result.hz);
      else delete panel.dataset.currentHz;
      panel.textContent = `JS 콜백 ${result ? `${result.hz} Hz / p95 ${result.p95.toFixed(1)} ms` : '측정 구간 부족'}${note}`;
      intervals.length = 0;
      publishedAt = time;
    }
    previousTime = time;
    frame = requestAnimationFrame(tick);
  }

  function visibilityChanged() {
    cancelAnimationFrame(frame);
    previousTime = 0;
    publishedAt = performance.now();
    intervals.length = 0;
    if (!document.hidden) frame = requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', visibilityChanged);
  visibilityChanged();
  return () => {
    cancelAnimationFrame(frame);
    document.removeEventListener('visibilitychange', visibilityChanged);
    panel.remove();
  };
}
