
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/**
 * React 앱을 지정된 DOM 노드에 마운트하는 함수입니다.
 * DOM 요소의 존재 여부를 한 번 더 확인하여 런타임 에러를 방지합니다.
 */
const mountApp = () => {
  const rootElement = document.getElementById('root');
  
  if (!rootElement) {
    console.warn("MidiStage: Root element '#root' not found. Retrying on next tick...");
    return;
  }

  try {
    // StrictMode 를 쓰지 않는다. 개발 모드에서 이펙트와 렌더를 두 번 돌리는데,
    // 이 앱은 키를 누를 때마다 트리 전체가 다시 그려져서 라이브 연주 반응이 눈에 띄게 느려진다.
    const root = ReactDOM.createRoot(rootElement);
    root.render(<App />);
  } catch (error) {
    console.error("MidiStage: Failed to initialize React application:", error);
  }
};

/**
 * 브라우저의 DOM 구문 분석이 완료되었는지 확인합니다.
 * 이미 완료되었다면 즉시 실행하고, 그렇지 않다면 DOMContentLoaded 이벤트를 기다립니다.
 */
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  mountApp();
} else {
  document.addEventListener('DOMContentLoaded', mountApp);
}
