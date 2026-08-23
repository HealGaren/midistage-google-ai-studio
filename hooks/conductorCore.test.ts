import { describe, it, expect, beforeEach } from 'vitest';
import { ConductorCore, CHORD_GRACE_MS } from './conductorCore';
import { buildChartEvents } from '../utils/chart';
import { makeSong, fakeClock, settings, BEAT_MS } from '../test/fixtures';

function setup(over: Partial<typeof settings> = {}) {
  const song = makeSong();
  const events = buildChartEvents(song);
  const clock = fakeClock();
  const steps: [string, number][] = [];
  const core = new ConductorCore(song, events, { ...settings, ...over }, { now: clock.now, setSequenceStep: (id, i) => steps.push([id, i]) });
  core.setAutoStart(true);
  return { song, events, clock, core, steps };
}

describe('ConductorCore — 시작/정지', () => {
  it('멈춘 상태 + autoStart 꺼짐이면 입력을 무시한다(다른 탭에서 연습)', () => {
    const { core } = setup();
    core.setAutoStart(false);
    expect(core.onPress('m-a')).toBeNull();
    expect(core.isRunning()).toBe(false);
  });
  it('첫 히트로 시작하고 anchor 가 그 노트의 박이 된다', () => {
    const { core, clock } = setup();
    clock.advance(5000);
    expect(core.onPress('m-a')?.beat).toBe(0);
    expect(core.isRunning()).toBe(true);
    expect(core.getRawPos()).toBeCloseTo(0, 5);
  });
});

describe('ConductorCore — 스냅과 템포', () => {
  it('늦게 누르면 위치가 그 노트로 당겨지고(스냅), 일찍 눌러도 마찬가지', () => {
    const { core, clock } = setup();
    core.onPress('m-a'); core.onPress('m-j');           // beat 0
    clock.advance(BEAT_MS * 1.5);                       // 실제로는 1.5박 흘렀지만
    expect(core.onPress('m-j')?.beat).toBe(1);          // 다음 RH 노트(1박)에 매칭
    expect(core.getRawPos()).toBeCloseTo(1, 5);         // 위치는 1박으로 스냅
    clock.advance(BEAT_MS * 0.5);                       // 0.5박 뒤 = 일찍
    expect(core.onPress('m-j')?.beat).toBe(2);
    expect(core.getRawPos()).toBeCloseTo(2, 5);
  });
  it('느리게 치면 템포가 천천히 내려온다(gentle), off 면 고정', () => {
    for (const [follow, expectLower] of [['gentle', true], ['off', false]] as const) {
      const { core, clock } = setup({ tempoFollow: follow });
      core.onPress('m-j');
      for (let i = 1; i <= 5; i++) { clock.advance(BEAT_MS * 1.3); core.onPress('m-j'); }
      if (expectLower) expect(core.getBpm()).toBeLessThan(67); else expect(core.getBpm()).toBe(67);
      expect(core.getBpm()).toBeGreaterThan(67 * 0.5);
    }
  });
  it('같은 박의 두 번째 손(화음)은 시계를 다시 맞추지 않는다', () => {
    const { core, clock } = setup();
    core.onPress('m-a');
    clock.advance(200);
    core.onPress('m-j');                                 // 같은 박 0, 200ms 늦음
    expect(core.getRawPos()).toBeCloseTo(200 / BEAT_MS, 3); // anchor 는 첫 손 기준 그대로
  });
  it('너무 이른 노트(early window 밖)는 무시된다', () => {
    const { core } = setup();
    core.onPress('m-j');                                 // beat 0
    // 레인 a 의 다음 노트는 bar 2(beat 6). raw≈0 → 6 > 0+1 → 무시
    expect(core.onPress('m-a')).not.toBeNull();          // a@0 은 아직 pending 이라 이건 히트
    expect(core.onPress('m-a')).toBeNull();              // 이제 a@6 은 너무 멀다
  });
});

describe('ConductorCore — 기다림(hold)과 놓침', () => {
  it('노트를 안 누르면 display 는 노트+lateWindow 에서 멈추고 raw 는 흐른다', () => {
    const { core, clock } = setup();
    core.onPress('m-a'); core.onPress('m-j');
    clock.advance(BEAT_MS * 4);
    expect(core.getRawPos()).toBeCloseTo(4, 3);
    expect(core.getDisplayPos()).toBeCloseTo(1 + settings.lateWindowBeats, 5);
    expect(core.isHolding()).toBe(true);
  });
  it('매칭 위치는 멈춘 지점 + 한 마디를 넘지 않는다 (오래 쉬다 엉뚱한 키 → 안 튐)', () => {
    const { core, clock } = setup();
    core.onPress('m-j');
    clock.advance(BEAT_MS * 30);                         // 5마디 쉼
    // a 레인 다음 노트는 beat 0(pending, 유예 끝나 missed 됐을 수도) 또는 6 → 캡 덕에 6 은 잡히고 12 는 안 잡힘
    core.tick();
    const hit = core.onPress('m-a');
    expect(hit && hit.beat).toBeLessThanOrEqual(6);
  });
  it('뒤 노트를 치면 앞의 대기 노트는 놓침(추월)', () => {
    const { core, clock } = setup();
    core.onPress('m-j');                                 // RH@0 (a@0 은 pending)
    clock.advance(BEAT_MS * 2);
    core.onPress('m-j');                                 // RH@1 → a@0 은 추월됨
    expect(core.statusOf(core['events'].find(e => e.mappingId === 'm-a' && e.beat === 0)!.id)).toBe('missed');
  });
  it('같은 박 다른 레인은 유예 시간 뒤에야 놓침으로 (tick)', () => {
    const { core, clock, events } = setup();
    core.onPress('m-j');
    const aId = events.find(e => e.mappingId === 'm-a' && e.beat === 0)!.id;
    clock.advance(CHORD_GRACE_MS - 50); core.tick();
    expect(core.statusOf(aId)).toBe('pending');
    clock.advance(100); core.tick();
    expect(core.statusOf(aId)).toBe('missed');
  });
  it('차트 편집(setEvents)으로 기다리던 노트가 사라지지 않는다', () => {
    const { core, clock, events } = setup();
    core.onPress('m-a'); core.onPress('m-j');
    clock.advance(BEAT_MS * 3);                          // RH@1 에서 기다리는 중, raw 는 3
    core.setEvents([...events]);                         // 같은 id 들로 재빌드
    expect(core.nextPending()?.beat).toBe(1);
  });
});

describe('ConductorCore — 탐색/싱크', () => {
  it('nextNote 는 그 박 전체를 건너뛰고 prevNote 는 되돌린다', () => {
    const { core } = setup();
    core.restart();
    core.nextNote();                                     // beat 0 의 a, j 둘 다 skipped
    expect(core.nextPending()?.beat).toBe(1);
    core.prevNote();
    expect(core.nextPending()?.beat).toBe(0);
    expect(core.nextPending()?.mappingIds.sort()).toEqual(['m-a', 'm-j']);
  });
  it('nextBar/prevBar/nextSection/prevSection', () => {
    const { core } = setup();
    core.restart();
    core.nextBar(); expect(core.getDisplayPos()).toBeCloseTo(6, 3);
    core.prevBar(); expect(core.getDisplayPos()).toBeCloseTo(0, 3);
    core.nextSection(); expect(core.getDisplayPos()).toBeCloseTo(12, 3);
    core.prevSection(); expect(core.getDisplayPos()).toBeCloseTo(0, 3);
  });
  it('기다리는 중 박 싱크는 기다리던 노트를 놓치지 않는다', () => {
    const { core, clock, events } = setup();
    core.onPress('m-a'); core.onPress('m-j');
    clock.advance(BEAT_MS * 3);                          // RH@1 대기 (display 1.5)
    core.syncBeat();
    expect(core.statusOf(events.find(e => e.mappingId === 'm-j' && e.beat === 1)!.id)).toBe('pending');
    expect(core.getRawPos()).toBeCloseTo(1, 3);
  });
  it('seekBeat 는 목표 바로 위의 노트를 살려둔다(0.0003 같은 시작점)', () => {
    const { core, events } = setup();
    core.seekBeat(0.0003);
    expect(core.statusOf(events[0].id)).toBe('pending');
  });
  it('탐색하면 시퀀스 레인의 엔진 스텝을 차트에 맞춘다', () => {
    const { core, steps } = setup();
    core.seekBeat(6);                                    // bar 2 시작: RH 7번째 노트 → 6 % 6 = 0
    expect(steps.at(-1)).toEqual(['seq-rh', 0]);
    core.seekBeat(8);
    expect(steps.at(-1)).toEqual(['seq-rh', 2]);
  });
  it('히트도 엔진 스텝을 맞춘다 (놓친 뒤에도 맞는 음)', () => {
    const { core, clock, steps } = setup();
    core.onPress('m-j'); clock.advance(BEAT_MS * 2.2); core.onPress('m-j'); // RH@0 → RH@1 (2박 뒤 = RH@2 가 아니라 레인의 다음 pending)
    expect(steps.filter(s => s[0] === 'seq-rh').map(s => s[1])).toEqual([0, 1]);
  });
});

describe('ConductorCore — 음원 모드', () => {
  function audio() {
    let t = 0, paused = true;
    return { clock: { currentTimeMs: () => t, paused: () => paused, play: () => { paused = false; }, pause: () => { paused = true; }, seekMs: (ms: number) => { t = ms; } }, set: (ms: number) => { t = ms; } };
  }
  it('음원 시간이 위치가 되고, 창 안의 입력만 히트, 지나간 노트는 tick 에서 놓침', () => {
    const { core, events } = setup();
    const a = audio();
    core.attachAudio(a.clock);
    core.setMode('audio');
    a.clock.play();
    a.set(BEAT_MS * 1.05);                               // beat 1.05
    expect(core.getRawPos()).toBeCloseTo(1.05, 3);
    expect(core.onPress('m-j')?.beat).toBeUndefined();   // 레인의 첫 pending 은 RH@0 → 1.05-0 > lateWindow(0.5) → 거부
    core.tick();                                         // RH@0, a@0 자동 놓침
    expect(core.statusOf(events.find(e => e.mappingId === 'm-j' && e.beat === 0)!.id)).toBe('missed');
    expect(core.onPress('m-j')?.beat).toBe(1);           // 이제 RH@1 이 창 안
    expect(core.getRawPos()).toBeCloseTo(1.05, 3);       // 판정만, 스냅 없음
  });
});

describe('ConductorCore — 리뷰에서 잡은 회귀', () => {
  it('같은 곡의 BPM 을 바꾸면(편집/재로드) 라이브 시계도 따라간다', () => {
    const { core, song } = setup();
    core.restart();
    core.setSong({ ...song, bpm: 90 });
    expect(core.getBpm()).toBe(90);
  });
  it('음원 모드에서 곡을 바꿔도 새 곡은 전부 pending 으로 시작한다 (옛 음원 시간에 속지 않음)', () => {
    const { core, events } = setup();
    let t = 90_000;                                     // 옛 곡 90초 지점
    core.attachAudio({ currentTimeMs: () => t, paused: () => false, play() {}, pause() {}, seekMs: ms => { t = ms; } });
    core.setMode('audio');
    const other = makeSong({ id: 'song-2' });
    core.setSong(other);
    core.setEvents(buildChartEvents(other));
    expect(core.nextPending()?.beat).toBe(0);
    expect(events.every(e => core.statusOf(e.id) === 'pending')).toBe(true);
  });
  it('Restart/seek 는 콤보와 카운터를 0 으로', () => {
    const { core } = setup();
    core.onPress('m-a'); core.onPress('m-j');
    expect(core.getCombo()).toBe(2);
    core.restart();
    expect(core.getCombo()).toBe(0);
    expect(core.snapshot().hits).toBe(0);
  });
  it('판정은 음원 모드에서만 의미가 있다', () => {
    const { core } = setup();
    expect(core.isJudged()).toBe(false);
    core.attachAudio({ currentTimeMs: () => 0, paused: () => true, play() {}, pause() {}, seekMs() {} });
    core.setMode('audio');
    expect(core.isJudged()).toBe(true);
  });
});
