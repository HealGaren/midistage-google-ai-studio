import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Song, SongChart, ChartPattern, ChartSection, ChartHit, ChartTake, InputMapping } from '../../types';
import { emptyChart, newPattern, newSection, parseLyrics, serializeLyrics, sectionColor, SECTION_COLORS, laneColor, mappingKeys, mappingTargetName, totalBars, beatMs as beatMsOf } from '../../utils/chart';
import { listAudioFiles, uploadAudioFile, SavedAudioMeta } from '../../utils/projectStorage';

// ─────────────────────────────────────────────────────────────────────────────
// Chart 편집: 송폼(섹션) · 패턴(마디 격자) · 가사 · 음원 · 테이크 → 패턴.
// 차트 = 섹션이 패턴을 자기 길이만큼 반복. 패턴은 "매핑 × 박" 격자에서 클릭으로 찍는다.
// ─────────────────────────────────────────────────────────────────────────────

interface Props { song: Song; onUpdateSong: (song: Song) => void; }

const SUBDIVS = [1, 2, 4];

export const ChartEditor: React.FC<Props> = ({ song, onUpdateSong }) => {
  const chart: SongChart = song.chart || emptyChart();
  const bpb = song.beatsPerBar || 4;
  const update = (patch: Partial<SongChart>) => onUpdateSong({ ...song, chart: { ...chart, ...patch } });

  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(chart.patterns[0]?.id || null);
  const [subdiv, setSubdiv] = useState(2);
  const [tool, setTool] = useState<'hit' | 'extend'>('hit');
  const pattern = chart.patterns.find(p => p.id === selectedPatternId) || chart.patterns[0] || null;
  useEffect(() => { if (!pattern && chart.patterns[0]) setSelectedPatternId(chart.patterns[0].id); }, [pattern, chart.patterns]);

  const laneMappings = useMemo(() => song.mappings.filter(m => m.isEnabled), [song.mappings]);

  // ── 섹션 ──
  const setSections = (sections: ChartSection[]) => update({ sections });
  const moveSection = (i: number, d: number) => {
    const s = [...chart.sections]; const j = i + d; if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]]; setSections(s);
  };

  // ── 패턴 ──
  const updatePattern = (id: string, patch: Partial<ChartPattern>) => update({ patterns: chart.patterns.map(p => p.id === id ? { ...p, ...patch } : p) });
  const addPattern = () => { const p = newPattern(`Pattern ${chart.patterns.length + 1}`, 1); update({ patterns: [...chart.patterns, p] }); setSelectedPatternId(p.id); };
  const duplicatePattern = () => { if (!pattern) return; const p = { ...newPattern(`${pattern.name} copy`, pattern.bars), hits: pattern.hits.map(h => ({ ...h })) }; update({ patterns: [...chart.patterns, p] }); setSelectedPatternId(p.id); };
  const removePattern = (id: string) => update({ patterns: chart.patterns.filter(p => p.id !== id), sections: chart.sections.map(s => s.patternId === id ? { ...s, patternId: null } : s) });

  const cellClick = (mappingId: string, beat: number) => {
    if (!pattern) return;
    const hits = pattern.hits;
    const at = hits.findIndex(h => h.mappingId === mappingId && Math.abs(h.beat - beat) < 1e-6);
    if (tool === 'hit') {
      if (at >= 0) updatePattern(pattern.id, { hits: hits.filter((_, i) => i !== at) });
      else updatePattern(pattern.id, { hits: [...hits, { mappingId, beat }].sort((a, b) => a.beat - b.beat) });
      return;
    }
    // extend: 이 칸 이전의 마지막 타점을 여기까지 늘린다(같은 칸 다시 클릭 = 길이 제거)
    const prev = [...hits].filter(h => h.mappingId === mappingId && h.beat <= beat + 1e-6).sort((a, b) => b.beat - a.beat)[0];
    if (!prev) return;
    const dur = beat - prev.beat + 1 / subdiv;
    updatePattern(pattern.id, { hits: hits.map(h => h === prev ? { ...h, durationBeats: Math.abs(h.beat - beat) < 1e-6 ? undefined : dur } : h) });
  };

  const fillRow = (mappingId: string, every: number) => {
    if (!pattern) return;
    const hits = pattern.hits.filter(h => h.mappingId !== mappingId);
    const total = pattern.bars * bpb;
    for (let b = 0; b < total - 1e-6; b += every) hits.push({ mappingId, beat: +b.toFixed(4), durationBeats: every > 1 ? every : undefined });
    updatePattern(pattern.id, { hits: hits.sort((a, b) => a.beat - b.beat) });
  };
  const clearRow = (mappingId: string) => pattern && updatePattern(pattern.id, { hits: pattern.hits.filter(h => h.mappingId !== mappingId) });

  // ── 가사 ──
  const [lyricText, setLyricText] = useState(() => serializeLyrics(chart.lyrics, bpb));
  const lyricDirty = useRef(false);
  useEffect(() => { if (!lyricDirty.current) setLyricText(serializeLyrics(chart.lyrics, bpb)); }, [chart.lyrics, bpb, song.id]);
  const commitLyrics = () => { update({ lyrics: parseLyrics(lyricText, bpb, chart.lyrics) }); lyricDirty.current = false; };

  // ── 음원 ──
  const [audioFiles, setAudioFiles] = useState<SavedAudioMeta[] | null>(null);
  const [audioErr, setAudioErr] = useState<string | null>(null);
  const refreshAudio = () => listAudioFiles().then(setAudioFiles).catch(() => setAudioFiles(null));
  useEffect(() => { refreshAudio(); }, []);
  const setAudio = (patch: Partial<NonNullable<SongChart['audio']>>) => update({ audio: { offsetMs: 0, ...(chart.audio || {}), ...patch } });
  const onUpload = async (f: File) => {
    try { setAudioErr(null); const name = await uploadAudioFile(f); setAudio({ fileName: name }); refreshAudio(); }
    catch (e: any) { setAudioErr(e.message || 'upload failed'); }
  };

  // ── 테이크 → 패턴 ──
  const takeToPattern = (take: ChartTake) => {
    // 녹화는 ms 단위. 곡 BPM 으로 beat 로 바꾸고 격자에 맞춘다(subdiv). 릴리즈는 버린다.
    const bm = beatMsOf(song.bpm, song.beatUnit || 4);
    const presses = take.events.filter(e => !e.release);
    if (!presses.length) return;
    const startOffset = take.startBeat - Math.floor(take.startBeat / bpb) * bpb; // 마디 안 위치
    const beats = presses.map(e => ({ mappingId: e.mappingId, beat: Math.round((e.t / bm + startOffset) * subdiv) / subdiv }));
    const last = Math.max(...beats.map(b => b.beat));
    const bars = Math.max(1, Math.ceil((last + 1e-6) / bpb));
    const hits: ChartHit[] = [];
    beats.forEach(b => { if (!hits.some(h => h.mappingId === b.mappingId && Math.abs(h.beat - b.beat) < 1e-6)) hits.push(b); });
    const p: ChartPattern = { ...newPattern(`${take.name} (quantized 1/${subdiv})`, bars), hits: hits.sort((a, b) => a.beat - b.beat) };
    update({ patterns: [...chart.patterns, p] });
    setSelectedPatternId(p.id);
  };

  const keyLabel = (m: InputMapping) => mappingKeys(m).map(k => k.length === 1 ? k.toUpperCase() : k).join(' ') || '—';
  const cols = pattern ? pattern.bars * bpb * subdiv : 0;

  return (
    <div className="h-full overflow-auto custom-scrollbar pr-2 space-y-8">
      <div className="flex items-center gap-6 flex-wrap">
        <div className="bg-slate-900/50 px-5 py-3 rounded-2xl border border-slate-800 flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-slate-400">
          <span>Time Sig <span className="text-white text-base ml-1">{bpb}/{song.beatUnit || 4}</span></span>
          <label className="flex items-center gap-2">beats/bar <input type="number" min={1} max={16} value={bpb} onChange={e => onUpdateSong({ ...song, beatsPerBar: Math.max(1, parseInt(e.target.value) || 4) })} className="w-12 bg-slate-800 rounded-lg p-1.5 text-center text-white outline-none" /></label>
          <label className="flex items-center gap-2">unit <select value={song.beatUnit || 4} onChange={e => onUpdateSong({ ...song, beatUnit: parseInt(e.target.value) })} className="bg-slate-800 rounded-lg p-1.5 text-white outline-none"><option value={4}>4</option><option value={8}>8</option><option value={2}>2</option></select></label>
          <span>Total <span className="text-white text-base ml-1">{totalBars(song)}</span> bars</span>
        </div>
        <p className="text-[10px] text-slate-500 max-w-xl">차트 = <b>섹션</b>(송폼)이 <b>패턴</b>(몇 마디짜리 타점 격자)을 자기 길이만큼 반복한 것. 건반이 쉬는 구간은 패턴을 비워두면 됨. Game 탭에서 노트가 떨어지고, 누를 때마다 싱크가 맞춰진다.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* ── 섹션(송폼) ── */}
        <section className="xl:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Song Form · Sections</h3>
            <button onClick={() => setSections([...chart.sections, newSection(`Section ${chart.sections.length + 1}`, 4, chart.patterns[0]?.id || null)])} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[10px] font-black uppercase">+ Section</button>
          </div>
          {chart.sections.length === 0 && <div className="h-20 border-2 border-dashed border-slate-800 rounded-2xl flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-700">No sections</div>}
          <div className="space-y-2">
            {(() => { let bar = 0; return chart.sections.map((s, i) => {
              const start = bar; bar += s.bars;
              const c = sectionColor(s, i);
              return (
                <div key={s.id} className="flex items-center gap-2 p-2 rounded-xl bg-slate-900/70 border border-slate-800">
                  <button onClick={() => setSections(chart.sections.map((x, j) => j === i ? { ...x, color: SECTION_COLORS[(SECTION_COLORS.indexOf(c) + 1) % SECTION_COLORS.length] } : x))} className="w-3 h-8 rounded-full flex-shrink-0" style={{ background: c }} title="색 바꾸기" />
                  <div className="flex flex-col flex-1 min-w-0 gap-1">
                    <div className="flex items-center gap-2">
                      <input value={s.name} onChange={e => setSections(chart.sections.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="flex-1 min-w-0 bg-transparent text-sm font-black text-white outline-none border-b border-transparent focus:border-indigo-500" />
                      <span className="text-[9px] font-bold text-slate-500 tabular-nums">bar {start + 1}–{start + s.bars}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold">
                      <input type="number" min={1} value={s.bars} onChange={e => setSections(chart.sections.map((x, j) => j === i ? { ...x, bars: Math.max(1, parseInt(e.target.value) || 1) } : x))} className="w-14 bg-slate-800 rounded-lg p-1 text-center text-white outline-none" />
                      <span className="text-slate-500">bars ·</span>
                      <select value={s.patternId || ''} onChange={e => setSections(chart.sections.map((x, j) => j === i ? { ...x, patternId: e.target.value || null } : x))} className="flex-1 bg-slate-800 rounded-lg p-1 text-white outline-none">
                        <option value="">(쉼 — 패턴 없음)</option>
                        {chart.patterns.map(p => <option key={p.id} value={p.id}>{p.name} ({p.bars}bar)</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveSection(i, -1)} className="text-slate-600 hover:text-white text-xs leading-none">▲</button>
                    <button onClick={() => moveSection(i, 1)} className="text-slate-600 hover:text-white text-xs leading-none">▼</button>
                  </div>
                  <button onClick={() => setSections(chart.sections.filter((_, j) => j !== i))} className="text-slate-700 hover:text-rose-500 px-1">✕</button>
                </div>
              );
            }); })()}
          </div>

          {/* 가사 */}
          <div className="pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Lyrics</h3>
              <button onClick={commitLyrics} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-[10px] font-black uppercase">Apply</button>
            </div>
            <textarea value={lyricText} onChange={e => { lyricDirty.current = true; setLyricText(e.target.value); }} onBlur={commitLyrics} rows={10} spellCheck={false}
              placeholder={'@9 첫 줄 가사\n@9.4 9마디 4박째부터\n다음 마디로 흘러가는 줄(@ 없으면 +1마디)'}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-3 text-xs font-medium text-yellow-100 outline-none focus:border-indigo-500 font-mono" />
            <p className="text-[9px] text-slate-600">한 줄 = <code>@마디[.박] 가사</code>. 마디/박은 1부터. 박은 소수 허용(4.5). @ 가 없으면 직전 줄의 다음 마디.</p>
          </div>
        </section>

        {/* ── 패턴 격자 ── */}
        <section className="xl:col-span-8 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mr-2">Patterns</h3>
            {chart.patterns.map(p => (
              <button key={p.id} onClick={() => setSelectedPatternId(p.id)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black border ${pattern?.id === p.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'}`}>{p.name}</button>
            ))}
            <button onClick={addPattern} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-black uppercase">+ Pattern</button>
            {pattern && <button onClick={duplicatePattern} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-black uppercase">Duplicate</button>}
            {pattern && <button onClick={() => removePattern(pattern.id)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-[10px] font-black uppercase">Delete</button>}
          </div>

          {pattern ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-4">
              <div className="flex items-center gap-4 flex-wrap text-[10px] font-bold text-slate-400">
                <input value={pattern.name} onChange={e => updatePattern(pattern.id, { name: e.target.value })} className="bg-transparent text-lg font-black text-white outline-none border-b border-transparent focus:border-indigo-500" />
                <label className="flex items-center gap-2">bars <input type="number" min={1} max={32} value={pattern.bars} onChange={e => updatePattern(pattern.id, { bars: Math.max(1, parseInt(e.target.value) || 1) })} className="w-14 bg-slate-800 rounded-lg p-1.5 text-center text-white outline-none" /></label>
                <label className="flex items-center gap-2">grid
                  <select value={subdiv} onChange={e => setSubdiv(parseInt(e.target.value))} className="bg-slate-800 rounded-lg p-1.5 text-white outline-none">{SUBDIVS.map(s => <option key={s} value={s}>1/{s} beat</option>)}</select></label>
                <div className="flex rounded-lg overflow-hidden border border-slate-700">
                  <button onClick={() => setTool('hit')} className={`px-3 py-1.5 font-black uppercase ${tool === 'hit' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`} title="클릭 = 타점 찍기/지우기">● Hit</button>
                  <button onClick={() => setTool('extend')} className={`px-3 py-1.5 font-black uppercase ${tool === 'extend' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`} title="클릭 = 직전 타점을 여기까지 길게(지속)">▬ Hold</button>
                </div>
                <span className="text-slate-600">{pattern.hits.length} hits</span>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <div className="min-w-max">
                  {/* 헤더: 마디/박 */}
                  <div className="flex items-end mb-1" style={{ paddingLeft: 200 }}>
                    {Array.from({ length: cols }).map((_, c) => {
                      const beat = c / subdiv; const isBar = Math.abs(beat % bpb) < 1e-6; const isBeat = Math.abs(beat - Math.round(beat)) < 1e-6;
                      return <div key={c} className={`w-7 text-center text-[9px] font-black ${isBar ? 'text-white' : isBeat ? 'text-slate-400' : 'text-slate-700'}`}>{isBar ? `B${Math.floor(beat / bpb) + 1}` : isBeat ? `${Math.round(beat % bpb) + 1}` : '·'}</div>;
                    })}
                  </div>
                  {laneMappings.map(m => {
                    const color = laneColor(song, m.id);
                    const rowHits = pattern.hits.filter(h => h.mappingId === m.id);
                    return (
                      <div key={m.id} className="flex items-center h-9 group">
                        <div className="w-[200px] flex items-center gap-2 pr-2">
                          <span className="w-2 h-6 rounded-full" style={{ background: color }} />
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-black text-white truncate">{keyLabel(m)}</div>
                            <div className="text-[9px] text-slate-500 truncate">{mappingTargetName(song, m)}</div>
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 flex gap-0.5">
                            <button onClick={() => fillRow(m.id, 1)} className="px-1 text-[8px] font-black bg-slate-800 rounded hover:bg-slate-700" title="매 박">1</button>
                            <button onClick={() => fillRow(m.id, bpb)} className="px-1 text-[8px] font-black bg-slate-800 rounded hover:bg-slate-700" title="매 마디">B</button>
                            <button onClick={() => clearRow(m.id)} className="px-1 text-[8px] font-black bg-slate-800 rounded hover:bg-rose-700" title="지우기">✕</button>
                          </div>
                        </div>
                        <div className="relative flex">
                          {Array.from({ length: cols }).map((_, c) => {
                            const beat = c / subdiv; const isBar = Math.abs(beat % bpb) < 1e-6; const isBeat = Math.abs(beat - Math.round(beat)) < 1e-6;
                            const hit = rowHits.find(h => Math.abs(h.beat - beat) < 1e-6);
                            const inHold = !hit && rowHits.some(h => h.durationBeats && beat > h.beat && beat < h.beat + h.durationBeats - 1e-6);
                            return (
                              <button key={c} onClick={() => cellClick(m.id, beat)}
                                className={`w-7 h-8 border-r transition-colors ${isBar ? 'border-l-2 border-l-slate-500' : ''} ${isBeat ? 'border-slate-700' : 'border-slate-800/60'} hover:bg-slate-700/60`}
                                style={{ background: hit ? color : inHold ? `${color}55` : undefined }}
                                title={`beat ${(beat % bpb) + 1} of bar ${Math.floor(beat / bpb) + 1}${hit?.durationBeats ? ` · hold ${hit.durationBeats}` : ''}`} />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {laneMappings.length === 0 && <div className="text-[10px] text-slate-600 p-4">매핑이 없습니다. Mappings 탭에서 키를 먼저 만드세요.</div>}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-32 border-2 border-dashed border-slate-800 rounded-3xl flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-700">패턴을 추가하세요</div>
          )}

          {/* 음원 + 테이크 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
            <div className="space-y-2">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Practice Audio</h3>
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3 text-[10px] font-bold text-slate-300">
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={chart.audio?.fileName || ''} onChange={e => setAudio({ fileName: e.target.value || undefined })} className="flex-1 bg-slate-800 rounded-lg p-2 text-white outline-none">
                    <option value="">(없음)</option>
                    {audioFiles?.map(f => <option key={f.name} value={f.name}>{f.name} ({(f.size / 1048576).toFixed(1)}MB)</option>)}
                    {chart.audio?.fileName && !audioFiles?.some(f => f.name === chart.audio?.fileName) && <option value={chart.audio.fileName}>{chart.audio.fileName} (파일 없음)</option>}
                  </select>
                  <label className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase cursor-pointer">
                    Upload <input type="file" accept="audio/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
                  </label>
                </div>
                {audioFiles === null && <p className="text-amber-400">dev 서버(/api/audio) 에 닿지 않습니다. `pnpm dev` 로 실행해야 저장됩니다. (Game 탭에서 세션용으로 열 수는 있음)</p>}
                {audioErr && <p className="text-rose-400">{audioErr}</p>}
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2">곡 시작 offset <input type="number" value={chart.audio?.offsetMs || 0} onChange={e => setAudio({ offsetMs: parseInt(e.target.value) || 0 })} className="w-20 bg-slate-800 rounded-lg p-1.5 text-center text-white outline-none" /> ms</label>
                  <label className="flex items-center gap-2">음원 BPM <input type="number" step={0.1} value={chart.audio?.bpm ?? ''} placeholder={String(song.bpm)} onChange={e => setAudio({ bpm: e.target.value ? parseFloat(e.target.value) : undefined })} className="w-20 bg-slate-800 rounded-lg p-1.5 text-center text-white outline-none" /></label>
                </div>
                <p className="text-[9px] text-slate-600">offset = 음원에서 1마디 1박이 울리는 시각(ms). 음원 BPM 은 곡 BPM 과 다를 때만.</p>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Recorded Takes</h3>
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2 text-[10px] font-bold text-slate-300">
                {(chart.takes || []).length === 0 && <p className="text-slate-600">Game 탭의 ● Rec 으로 녹화하면 여기에 쌓입니다. 패턴으로 바꾸면(1/{subdiv} 격자) 차트에 쓸 수 있어요.</p>}
                {(chart.takes || []).map(t => (
                  <div key={t.id} className="flex items-center gap-2">
                    <input value={t.name} onChange={e => update({ takes: (chart.takes || []).map(x => x.id === t.id ? { ...x, name: e.target.value } : x) })} className="flex-1 bg-transparent text-white outline-none border-b border-transparent focus:border-indigo-500" />
                    <span className="text-slate-500 tabular-nums">{t.events.filter(e => !e.release).length} presses · bar {Math.floor(t.startBeat / bpb) + 1}</span>
                    <button onClick={() => takeToPattern(t)} className="px-2 py-1 rounded bg-slate-800 hover:bg-indigo-600 font-black uppercase">→ Pattern</button>
                    <button onClick={() => update({ takes: (chart.takes || []).filter(x => x.id !== t.id) })} className="px-2 py-1 rounded bg-slate-800 hover:bg-rose-600">✕</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ChartEditor;
