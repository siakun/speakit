import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// 평소 학습 화면에는 진단 UI와 상시 애니메이션 루프를 추가하지 않는다.
if (new URLSearchParams(location.search).get('fps') === '1') {
  let active = true;
  let dispose: (() => void) | undefined;
  void import('./FrameMonitor').then(({ mountFrameMonitor }) => { if (active) dispose = mountFrameMonitor(); });
  import.meta.hot?.dispose(() => { active = false; dispose?.(); });
}
