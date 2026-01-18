
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
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
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
