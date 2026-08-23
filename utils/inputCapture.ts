import { useEffect } from 'react';

/**
 * KeyboardEvent.key 를 매핑에 적는 이름으로. 공백은 ' ' 라서 trim 에 지워지므로 'space' 로,
 * 나머지는 소문자(ArrowLeft → arrowleft, Escape → escape). Settings 의 Learn 과 매칭 양쪽이 같이 쓴다.
 */
export function normalizeKey(key: string): string {
  if (key === ' ' || key === 'Spacebar') return 'space';
  return key.toLowerCase();
}

// 키보드/MIDI 입력을 "직접" 받아야 하는 모드(매핑 러닝 등)가 켜져 있는 동안
// 라이브 트리거를 잠시 멈추기 위한 아주 작은 전역 스위치.
//
// 러닝 UI는 Settings 와 editor/MappingEditor 두 군데에 흩어져 있고 App 과 형제 관계라
// props 로 끌어올리면 Editor 를 관통해야 한다. 상태가 boolean 하나뿐이고 렌더에
// 반영할 필요도 없어서(이벤트 발생 시점에 읽기만 하면 된다) 모듈 스코프에 둔다.
const activeCaptures = new Set<string>();

export function beginInputCapture(id: string): void {
  activeCaptures.add(id);
}

export function endInputCapture(id: string): void {
  activeCaptures.delete(id);
}

/** 지금 입력을 가로채는 모드가 하나라도 켜져 있나 */
export function isInputCaptured(): boolean {
  return activeCaptures.size > 0;
}

let seq = 0;

/**
 * `active` 인 동안 라이브 트리거를 막는다.
 * 러닝 모드를 켜고 끄는 컴포넌트에서 `useInputCapture(learning !== null)` 처럼 쓴다.
 * 언마운트 시에도 반드시 풀리므로 러닝 중 탭을 옮겨도 스위치가 켜진 채 남지 않는다.
 */
export function useInputCapture(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const id = `capture-${++seq}`;
    beginInputCapture(id);
    return () => endInputCapture(id);
  }, [active]);
}

/**
 * 지금 포커스가 글자를 입력받는 곳에 있나.
 * 곡 이름이나 노트 번호를 타이핑하는 중에 그 글쇠가 연주로 나가면 안 된다.
 * (MIDI 는 타이핑과 겹치지 않으므로 이 검사를 적용하지 않는다)
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return el.isContentEditable === true;
}
