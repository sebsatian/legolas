import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

// ─── TYPES ───────────────────────────────────────────────────
type View = 'calibration' | 'home' | 'exercise' | 'anaglyph' | 'saccadic' | 'complete' | 'progress' | 'settings' | 'glasses-info'
type ExerciseMode = 'stereo' | 'anaglyph' | 'saccadic'

interface SessionRecord {
  id: string; date: string; duration: number; fusions: number; maxLevel: number
  mode: ExerciseMode; hits?: number; misses?: number; avgReactionMs?: number
}
interface Config {
  patientName: string; sessionDuration: number; restDuration: number
  initialLevel: number; enableHints: boolean; pin: string
  leftEyeContrast: number; rightEyeContrast: number
  screenInches: number; screenCalibrated: boolean
}
interface Progress {
  currentLevel: number; streak: number; lastSessionDate: string | null; sessions: SessionRecord[]
}

const DEFAULT_CONFIG: Config = {
  patientName: 'Jugador', sessionDuration: 15, restDuration: 15,
  initialLevel: 1, enableHints: true, pin: '1234',
  leftEyeContrast: 1.0, rightEyeContrast: 1.0,
  screenInches: 10, screenCalibrated: false,
}
const DEFAULT_PROGRESS: Progress = { currentLevel: 1, streak: 0, lastSessionDate: null, sessions: [] }

// ─── LEVELS ──────────────────────────────────────────────────
// Physical sizes in centimeters — scaled to px at runtime using pxPerCm
// Stereo: gap between images / image size
const STEREO_CM   = [{ gap: 1.5, size: 6.0 }, { gap: 2.5, size: 5.5 }, { gap: 3.5, size: 5.0 }, { gap: 4.5, size: 4.5 }, { gap: 5.5, size: 4.0 }]
// Anaglyph: single image diameter
const ANAGLYPH_CM = [8.0, 7.0, 6.0, 5.0, 4.5]
// Saccadic: target diameter + reaction window
const SACCADIC_LEVELS = [
  { targetCm: 2.0, windowMs: 3000, label: 'Grande, lento' },
  { targetCm: 1.5, windowMs: 2500, label: 'Medio, normal' },
  { targetCm: 1.1, windowMs: 2000, label: 'Medio, rapido' },
  { targetCm: 0.8, windowMs: 1500, label: 'Pequeño, rapido' },
  { targetCm: 0.6, windowMs: 1000, label: 'Pequeño, muy rapido' },
]

// ─── STEREO PAIRS ────────────────────────────────────────────
interface StereoPair { id: string; name: string; minLevel: number; left: string; right: string; hint: string }
const PAIRS: StereoPair[] = [
  { id: 'circles', name: 'Circulos', minLevel: 1, hint: 'Circulo con dos puntos',
    left:  `<circle cx="60" cy="60" r="50" fill="none" stroke="#111" stroke-width="5"/><circle cx="36" cy="60" r="10" fill="#111"/>`,
    right: `<circle cx="60" cy="60" r="50" fill="none" stroke="#111" stroke-width="5"/><circle cx="84" cy="60" r="10" fill="#111"/>` },
  { id: 'compass', name: 'Brujula', minLevel: 1, hint: 'Circulo con 8 puntos',
    left:  `<circle cx="60" cy="60" r="50" fill="none" stroke="#111" stroke-width="5"/><circle cx="60" cy="16" r="7" fill="#111"/><circle cx="60" cy="104" r="7" fill="#111"/><circle cx="16" cy="60" r="7" fill="#111"/><circle cx="104" cy="60" r="7" fill="#111"/>`,
    right: `<circle cx="60" cy="60" r="50" fill="none" stroke="#111" stroke-width="5"/><circle cx="95" cy="25" r="7" fill="#111"/><circle cx="25" cy="25" r="7" fill="#111"/><circle cx="95" cy="95" r="7" fill="#111"/><circle cx="25" cy="95" r="7" fill="#111"/>` },
  { id: 'house', name: 'Casa', minLevel: 2, hint: 'Casa con ventana y puerta',
    left:  `<polygon points="60,8 108,50 12,50" fill="none" stroke="#111" stroke-width="5" stroke-linejoin="round"/><rect x="12" y="50" width="96" height="62" fill="none" stroke="#111" stroke-width="5"/><rect x="20" y="64" width="28" height="24" fill="none" stroke="#111" stroke-width="3.5"/><line x1="34" y1="64" x2="34" y2="88" stroke="#111" stroke-width="2"/><line x1="20" y1="76" x2="48" y2="76" stroke="#111" stroke-width="2"/>`,
    right: `<polygon points="60,8 108,50 12,50" fill="none" stroke="#111" stroke-width="5" stroke-linejoin="round"/><rect x="12" y="50" width="96" height="62" fill="none" stroke="#111" stroke-width="5"/><rect x="72" y="74" width="26" height="38" fill="none" stroke="#111" stroke-width="3.5"/><circle cx="91" cy="93" r="3" fill="#111"/>` },
  { id: 'cat', name: 'Gato', minLevel: 2, hint: 'Gato con bigotes',
    left:  `<ellipse cx="60" cy="68" rx="44" ry="36" fill="none" stroke="#111" stroke-width="5"/><polygon points="24,44 14,16 40,40" fill="none" stroke="#111" stroke-width="4" stroke-linejoin="round"/><polygon points="96,44 106,16 80,40" fill="none" stroke="#111" stroke-width="4" stroke-linejoin="round"/><circle cx="44" cy="64" r="7" fill="#111"/><circle cx="76" cy="64" r="7" fill="#111"/><path d="M52,80 Q60,87 68,80" fill="none" stroke="#111" stroke-width="3.5"/>`,
    right: `<ellipse cx="60" cy="68" rx="44" ry="36" fill="none" stroke="#111" stroke-width="5"/><polygon points="24,44 14,16 40,40" fill="none" stroke="#111" stroke-width="4" stroke-linejoin="round"/><polygon points="96,44 106,16 80,40" fill="none" stroke="#111" stroke-width="4" stroke-linejoin="round"/><circle cx="44" cy="64" r="7" fill="#111"/><circle cx="76" cy="64" r="7" fill="#111"/><path d="M52,80 Q60,87 68,80" fill="none" stroke="#111" stroke-width="3.5"/><line x1="12" y1="70" x2="52" y2="73" stroke="#111" stroke-width="3.5"/><line x1="12" y1="79" x2="52" y2="79" stroke="#111" stroke-width="3.5"/><line x1="68" y1="73" x2="108" y2="70" stroke="#111" stroke-width="3.5"/><line x1="68" y1="79" x2="108" y2="79" stroke="#111" stroke-width="3.5"/>` },
  { id: 'fish', name: 'Pez', minLevel: 3, hint: 'Pez con aletas',
    left:  `<ellipse cx="50" cy="60" rx="40" ry="26" fill="none" stroke="#111" stroke-width="5"/><path d="M90,60 L112,40 L112,80 Z" fill="none" stroke="#111" stroke-width="4.5" stroke-linejoin="round"/><circle cx="70" cy="53" r="5" fill="#111"/>`,
    right: `<ellipse cx="50" cy="60" rx="40" ry="26" fill="none" stroke="#111" stroke-width="5"/><path d="M90,60 L112,40 L112,80 Z" fill="none" stroke="#111" stroke-width="4.5" stroke-linejoin="round"/><circle cx="70" cy="53" r="5" fill="#111"/><path d="M38,35 Q50,44 56,35 Q50,27 38,35 Z" fill="none" stroke="#111" stroke-width="4"/><path d="M38,85 Q50,76 56,85 Q50,93 38,85 Z" fill="none" stroke="#111" stroke-width="4"/><path d="M12,50 Q22,60 12,70" fill="none" stroke="#111" stroke-width="4"/>` },
  { id: 'tree', name: 'Arbol', minLevel: 3, hint: 'Arbol con manzanas',
    left:  `<rect x="48" y="74" width="24" height="42" fill="none" stroke="#111" stroke-width="5"/><ellipse cx="60" cy="50" rx="42" ry="36" fill="none" stroke="#111" stroke-width="5"/><line x1="52" y1="74" x2="36" y2="56" stroke="#111" stroke-width="3"/><line x1="68" y1="74" x2="84" y2="56" stroke="#111" stroke-width="3"/>`,
    right: `<rect x="48" y="74" width="24" height="42" fill="none" stroke="#111" stroke-width="5"/><ellipse cx="60" cy="50" rx="42" ry="36" fill="none" stroke="#111" stroke-width="5"/><line x1="52" y1="74" x2="36" y2="56" stroke="#111" stroke-width="3"/><line x1="68" y1="74" x2="84" y2="56" stroke="#111" stroke-width="3"/><circle cx="40" cy="44" r="9" fill="none" stroke="#111" stroke-width="3.5"/><circle cx="65" cy="36" r="9" fill="none" stroke="#111" stroke-width="3.5"/><circle cx="80" cy="54" r="9" fill="none" stroke="#111" stroke-width="3.5"/>` },
  { id: 'robot', name: 'Robot', minLevel: 4, hint: 'Robot completo',
    left:  `<rect x="26" y="4" width="68" height="50" rx="8" fill="none" stroke="#111" stroke-width="5"/><circle cx="44" cy="26" r="9" fill="none" stroke="#111" stroke-width="4"/><circle cx="76" cy="26" r="9" fill="none" stroke="#111" stroke-width="4"/><rect x="44" y="44" width="32" height="7" rx="3.5" fill="none" stroke="#111" stroke-width="3"/><line x1="60" y1="4" x2="60" y2="0" stroke="#111" stroke-width="5"/><circle cx="60" cy="0" r="4" fill="#111"/>`,
    right: `<rect x="26" y="4" width="68" height="50" rx="8" fill="none" stroke="#111" stroke-width="5"/><circle cx="44" cy="26" r="9" fill="none" stroke="#111" stroke-width="4"/><circle cx="76" cy="26" r="9" fill="none" stroke="#111" stroke-width="4"/><rect x="44" y="44" width="32" height="7" rx="3.5" fill="none" stroke="#111" stroke-width="3"/><line x1="60" y1="4" x2="60" y2="0" stroke="#111" stroke-width="5"/><circle cx="60" cy="0" r="4" fill="#111"/><rect x="18" y="62" width="84" height="48" rx="6" fill="none" stroke="#111" stroke-width="5"/><line x1="6" y1="68" x2="18" y2="86" stroke="#111" stroke-width="5"/><line x1="114" y1="68" x2="102" y2="86" stroke="#111" stroke-width="5"/><rect x="32" y="74" width="20" height="26" rx="4" fill="none" stroke="#111" stroke-width="3.5"/><rect x="68" y="74" width="20" height="26" rx="4" fill="none" stroke="#111" stroke-width="3.5"/>` },
  { id: 'sun', name: 'Sol', minLevel: 4, hint: 'Sol con 8 rayos',
    left:  `<circle cx="60" cy="60" r="26" fill="none" stroke="#111" stroke-width="5"/><line x1="60" y1="6" x2="60" y2="22" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="60" y1="98" x2="60" y2="114" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="6" y1="60" x2="22" y2="60" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="98" y1="60" x2="114" y2="60" stroke="#111" stroke-width="5" stroke-linecap="round"/>`,
    right: `<circle cx="60" cy="60" r="26" fill="none" stroke="#111" stroke-width="5"/><line x1="60" y1="6" x2="60" y2="22" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="60" y1="98" x2="60" y2="114" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="6" y1="60" x2="22" y2="60" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="98" y1="60" x2="114" y2="60" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="20" y1="20" x2="31" y2="31" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="100" y1="20" x2="89" y2="31" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="20" y1="100" x2="31" y2="89" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="100" y1="100" x2="89" y2="89" stroke="#111" stroke-width="5" stroke-linecap="round"/>` },
]

// ─── UTILS ───────────────────────────────────────────────────
const load = <T,>(key: string, def: T): T => {
  try { const s = localStorage.getItem(key); return s ? { ...(def as object), ...JSON.parse(s) } as T : def }
  catch { return def }
}
const save = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v))
const fmt  = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
const pairs = (l: number) => PAIRS.filter(p => p.minLevel <= l)
const colorize = (svg: string, color: string) =>
  svg.replace(/stroke="#111"/g, `stroke="${color}"`).replace(/fill="#111"/g, `fill="${color}"`)
const randPos = () => ({ x: 12 + Math.random() * 76, y: 18 + Math.random() * 64 })

// ─── APP ─────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<View>('home')
  const [config, _setConfig] = useState<Config>(() => load('vp_config', DEFAULT_CONFIG))
  const [progress, _setProgress] = useState<Progress>(() => load('vp_progress', DEFAULT_PROGRESS))
  const progressRef = useRef(progress)

  // Shared session state
  const [sessionTime, setSessionTime] = useState(0)
  const [fusions, setFusions] = useState(0)   // also = hits for saccadic
  const [level, setLevel] = useState(1)
  const [, setMaxLevel]    = useState(1)
  const [, setConsSuccess] = useState(0)
  const [pairIdx, setPairIdx]     = useState(0)
  const [restActive, setRestActive] = useState(false)
  const [restTime, setRestTime]     = useState(0)
  const [showHint, setShowHint]     = useState(false)
  const [celebrate, setCelebrate]   = useState(false)

  // Saccadic-specific (managed in parent so finishSession can access)
  const [missCount, setMissCount] = useState(0)
  const missCountRef   = useRef(0)
  const hitsRef        = useRef(0)
  const reactionTimesRef = useRef<number[]>([])

  // Refs for stale-closure safety
  const fusionsRef     = useRef(0)
  const maxLevelRef    = useRef(1)
  const levelRef       = useRef(1)
  const consRef        = useRef(0)   // consecutive successes
  const consMissRef    = useRef(0)   // consecutive misses (saccadic)
  const sessionTimeRef = useRef(0)
  const activeModeRef  = useRef<ExerciseMode>('stereo')

  const setConfig = useCallback((c: Config) => { _setConfig(c); save('vp_config', c) }, [])
  const setProgress = useCallback((p: Progress) => {
    progressRef.current = p; _setProgress(p); save('vp_progress', p)
  }, [])

  // Show calibration on first launch
  useEffect(() => {
    if (!config.screenCalibrated) setView('calibration')
  }, [])

  // ── session timer ──
  useEffect(() => {
    if (!['exercise', 'anaglyph', 'saccadic'].includes(view) || restActive) return
    const maxT = config.sessionDuration * 60
    const id = setInterval(() => {
      sessionTimeRef.current += 1
      setSessionTime(t => t + 1)
      if (sessionTimeRef.current >= maxT) { clearInterval(id); finishSession() }
    }, 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, restActive, config.sessionDuration])

  // ── rest timer ──
  function endRest() {
    setRestActive(false)
    setPairIdx(i => { const ps = pairs(levelRef.current); return (i + 1) % Math.max(ps.length, 1) })
    setShowHint(false); setRestTime(0)
  }
  useEffect(() => {
    if (!restActive) return
    const id = setInterval(() => {
      setRestTime(t => { if (t <= 1) { clearInterval(id); endRest(); return 0 } return t - 1 })
    }, 1000)
    return () => clearInterval(id)
  }, [restActive])

  function startSession(mode: ExerciseMode) {
    activeModeRef.current = mode
    const lvl = progressRef.current.currentLevel
    levelRef.current = lvl; maxLevelRef.current = lvl
    fusionsRef.current = 0; hitsRef.current = 0; missCountRef.current = 0
    consRef.current = 0; consMissRef.current = 0
    reactionTimesRef.current = []
    sessionTimeRef.current = 0
    setLevel(lvl); setMaxLevel(lvl); setFusions(0); setConsSuccess(0)
    setMissCount(0); setSessionTime(0); setPairIdx(0)
    setRestActive(false); setShowHint(false); setCelebrate(false)
    setView(mode === 'anaglyph' ? 'anaglyph' : mode === 'saccadic' ? 'saccadic' : 'exercise')
  }

  // ── stereo/anaglyph fusion ──
  function handleFusion() {
    if (restActive) return
    fusionsRef.current += 1; setFusions(fusionsRef.current)
    setCelebrate(true); setTimeout(() => setCelebrate(false), 900)
    consRef.current += 1; setConsSuccess(consRef.current)
    if (consRef.current >= 5 && levelRef.current < 5) {
      levelRef.current += 1; consRef.current = 0; setLevel(levelRef.current); setConsSuccess(0)
      if (levelRef.current > maxLevelRef.current) { maxLevelRef.current = levelRef.current; setMaxLevel(maxLevelRef.current) }
    }
    setRestActive(true); setRestTime(config.restDuration)
  }

  // ── saccadic hit/miss ──
  function handleSaccadicHit(reactionMs: number) {
    hitsRef.current += 1; fusionsRef.current += 1
    reactionTimesRef.current.push(reactionMs)
    setFusions(hitsRef.current)
    setCelebrate(true); setTimeout(() => setCelebrate(false), 400)
    consMissRef.current = 0; consRef.current += 1
    if (consRef.current >= 8 && levelRef.current < 5) {
      levelRef.current += 1; consRef.current = 0; setLevel(levelRef.current)
      if (levelRef.current > maxLevelRef.current) { maxLevelRef.current = levelRef.current; setMaxLevel(maxLevelRef.current) }
    }
  }
  function handleSaccadicMiss() {
    missCountRef.current += 1; setMissCount(missCountRef.current)
    consRef.current = 0; consMissRef.current += 1
    if (consMissRef.current >= 5 && levelRef.current > 1) {
      levelRef.current -= 1; consMissRef.current = 0; setLevel(levelRef.current)
    }
  }

  function finishSession() {
    const now = new Date().toISOString()
    const prev = progressRef.current
    const todayStr = now.split('T')[0]
    const lastStr  = prev.lastSessionDate?.split('T')[0]
    const yestStr  = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const streak   = lastStr === todayStr ? prev.streak : lastStr === yestStr ? prev.streak + 1 : 1
    const rts = reactionTimesRef.current
    const record: SessionRecord = {
      id: Date.now().toString(), date: now, mode: activeModeRef.current,
      duration: sessionTimeRef.current, fusions: fusionsRef.current, maxLevel: maxLevelRef.current,
      ...(activeModeRef.current === 'saccadic' ? {
        hits: hitsRef.current, misses: missCountRef.current,
        avgReactionMs: rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0
      } : {})
    }
    setProgress({ currentLevel: levelRef.current, streak, lastSessionDate: now, sessions: [...prev.sessions, record].slice(-100) })
    setView('complete')
  }

  // ── physical calibration ──
  // Uses CSS pixels (already DPI-independent) for sizing
  const pxPerCm = useMemo(() => {
    const diagPx = Math.sqrt(window.screen.width ** 2 + window.screen.height ** 2)
    const diagCm = config.screenInches * 2.54
    return Math.round((diagPx / diagCm) * 10) / 10  // 1 decimal
  }, [config.screenInches])

  const availPairs  = pairs(level)
  const currentPair = availPairs[pairIdx % Math.max(availPairs.length, 1)] ?? PAIRS[0]
  const cmLv     = STEREO_CM[Math.min(level - 1, 4)]
  const stereoLv = { gap: Math.round(cmLv.gap * pxPerCm), size: Math.round(cmLv.size * pxPerCm) }
  const totalT   = config.sessionDuration * 60

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes pop     { 0%,100%{transform:scale(1)} 50%{transform:scale(1.18)} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        @keyframes pulse   { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
        @keyframes glow    { 0%,100%{filter:drop-shadow(0 0 4px rgba(16,185,129,0))} 50%{filter:drop-shadow(0 0 14px rgba(16,185,129,.7))} }
        @keyframes glowRed { 0%,100%{filter:drop-shadow(0 0 4px rgba(239,68,68,0))} 50%{filter:drop-shadow(0 0 14px rgba(239,68,68,.6))} }
        @keyframes glowOra { 0%,100%{filter:drop-shadow(0 0 4px rgba(249,115,22,0))} 50%{filter:drop-shadow(0 0 18px rgba(249,115,22,.8))} }
        .fade-up { animation: fadeUp 0.3s ease both; }
        .btn:active { transform: scale(0.93); transition: transform 0.08s; }
        .celebrate     { animation: glow 0.9s ease; }
        .celebrateAna  { animation: glowRed 0.9s ease; }
        .celebrateSacc { animation: glowOra 0.4s ease; }
        input[type=range] { -webkit-appearance:none; height:8px; border-radius:4px; outline:none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:22px; height:22px; border-radius:50%; background:#0ea5e9; cursor:pointer; }
      `}</style>

      {view === 'calibration'  && <CalibrationView config={config} onDone={(c) => { setConfig(c); setView('home') }} />}
      {view === 'home'         && <HomeView config={config} progress={progress} onStart={startSession} onProgress={() => setView('progress')} onSettings={() => setView('settings')} onGlassesInfo={() => setView('glasses-info')} />}
      {view === 'glasses-info' && <GlassesInfoView pair={PAIRS[0]} onBack={() => setView('home')} onStart={() => startSession('anaglyph')} />}
      {view === 'exercise'     && <StereoView stereoLv={stereoLv} remaining={Math.max(totalT - sessionTime, 0)} totalT={totalT} sessionTime={sessionTime} fusions={fusions} level={level} pair={currentPair} restActive={restActive} restTime={restTime} restDuration={config.restDuration} showHint={showHint} celebrate={celebrate} onFusion={handleFusion} onToggleHint={() => setShowHint(h => !h)} onEnd={finishSession} onSkipRest={endRest} />}
      {view === 'anaglyph'     && <AnaglyphView config={config} pxPerCm={pxPerCm} level={level} pair={currentPair} remaining={Math.max(totalT - sessionTime, 0)} totalT={totalT} sessionTime={sessionTime} fusions={fusions} restActive={restActive} restTime={restTime} restDuration={config.restDuration} showHint={showHint} celebrate={celebrate} onFusion={handleFusion} onToggleHint={() => setShowHint(h => !h)} onEnd={finishSession} onSkipRest={endRest} />}
      {view === 'saccadic'     && <SaccadicView config={config} pxPerCm={pxPerCm} level={level} hits={fusions} misses={missCount} remaining={Math.max(totalT - sessionTime, 0)} totalT={totalT} sessionTime={sessionTime} celebrate={celebrate} onHit={handleSaccadicHit} onMiss={handleSaccadicMiss} onEnd={finishSession} />}
      {view === 'complete'     && <CompleteView sessions={progress.sessions} streak={progress.streak} mode={activeModeRef.current} onHome={() => setView('home')} onProgress={() => setView('progress')} />}
      {view === 'progress'     && <ProgressView progress={progress} onBack={() => setView('home')} />}
      {view === 'settings'     && <SettingsView config={config} onSave={setConfig} onBack={() => setView('home')} onReset={() => setProgress(DEFAULT_PROGRESS)} onCalibrate={() => setView('calibration')} />}
    </div>
  )
}

// ─── CALIBRATION ─────────────────────────────────────────────
function CalibrationView({ config, onDone }: { config: Config; onDone: (c: Config) => void }) {
  const [inches, setInches] = useState(config.screenInches)
  const [step, setStep] = useState<'screen' | 'color'>('screen')

  return (
    <div className="fade-up min-h-screen flex flex-col bg-gradient-to-br from-violet-50 to-sky-50">
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5">
        <div className="text-6xl">🔧</div>
        <h1 className="text-3xl font-black text-violet-600">Calibracion inicial</h1>

        {step === 'screen' ? (
          <>
            <p className="text-gray-500 font-semibold text-sm text-center max-w-xs leading-relaxed">
              Selecciona el tamano de tu pantalla para que los ejercicios tengan el tamano correcto.
            </p>

            {/* Visual ruler */}
            <div className="bg-white rounded-3xl shadow p-5 w-full max-w-sm flex flex-col gap-4">
              <h3 className="font-black text-gray-600 text-sm">Pantalla</h3>
              <div className="flex flex-wrap gap-2">
                {[5, 6, 7, 8, 10, 11, 13, 15].map(s => (
                  <button key={s} onClick={() => setInches(s)}
                    className={`btn flex-1 min-w-[60px] rounded-2xl py-3 font-black text-sm transition-all ${inches === s ? 'bg-violet-500 text-white shadow-md' : 'bg-gray-100 text-gray-500'}`}>
                    {s}"
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 font-bold text-center">
                {inches <= 7 ? 'Telefono' : inches <= 11 ? 'Tablet — recomendado' : 'Notebook / PC'}
              </p>
              {inches < 7 && <p className="text-amber-500 font-bold text-xs text-center">Pantalla pequeña: los ejercicios pueden ser incomodos. Se recomienda tablet de 7" o mas.</p>}
            </div>

            {/* Anaglyph color test preview */}
            <div className="bg-white rounded-3xl shadow p-5 w-full max-w-sm flex flex-col gap-3">
              <h3 className="font-black text-gray-600 text-sm">Test de colores anaglifo</h3>
              <p className="text-xs text-gray-400 font-semibold leading-relaxed">
                Si tienes lentes rojo-cyan, ponselos. Deberas ver solo un color en cada ojo:
              </p>
              <div className="flex gap-3">
                <div className="flex-1 rounded-2xl flex items-center justify-center py-6 font-black text-white text-lg" style={{ background: '#ef4444' }}>ROJO</div>
                <div className="flex-1 rounded-2xl flex items-center justify-center py-6 font-black text-white text-lg" style={{ background: '#06b6d4' }}>CYAN</div>
              </div>
              <p className="text-xs text-gray-400 font-bold text-center">Ojo con lente rojo = solo ve ROJO · Ojo con lente cyan = solo ve CYAN</p>
            </div>

            <button onClick={() => setStep('color')}
              className="btn w-full max-w-sm bg-violet-500 text-white font-black text-lg rounded-3xl py-4 shadow-xl hover:bg-violet-400 transition-all">
              Siguiente
            </button>
          </>
        ) : (
          <>
            <p className="text-gray-500 font-semibold text-sm text-center max-w-xs leading-relaxed">
              Verifica que los colores en pantalla se ven bien. Ajusta el brillo de tu dispositivo al maximo para mejor efecto.
            </p>

            <div className="bg-white rounded-3xl shadow p-5 w-full max-w-sm flex flex-col gap-3">
              <h3 className="font-black text-gray-600 text-sm">Checklist de preparacion</h3>
              {[
                'Brillo de pantalla al maximo',
                'Habitacion con luz moderada (no oscuro total)',
                'Sentado comodo, pantalla a ~40cm de los ojos',
                'Si usas lentes habituales, ponlos antes de los anaglifos',
              ].map((t, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-emerald-600 text-xs font-black">{i + 1}</span>
                  </div>
                  <p className="text-gray-500 font-semibold text-sm leading-relaxed">{t}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-3 w-full max-w-sm">
              <button onClick={() => setStep('screen')}
                className="btn flex-1 bg-white text-gray-500 font-bold rounded-2xl py-3 shadow border border-gray-100">
                Atras
              </button>
              <button onClick={() => onDone({ ...config, screenInches: inches, screenCalibrated: true })}
                className="btn flex-1 bg-violet-500 text-white font-black rounded-2xl py-3 shadow-xl hover:bg-violet-400 transition-all">
                Listo!
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── HOME ────────────────────────────────────────────────────
function HomeView({ config, progress, onStart, onProgress, onSettings, onGlassesInfo }: {
  config: Config; progress: Progress
  onStart: (m: ExerciseMode) => void; onProgress: () => void; onSettings: () => void; onGlassesInfo: () => void
}) {
  const weekSessions = progress.sessions.filter(s => new Date(s.date) > new Date(Date.now() - 7 * 86400000)).length
  return (
    <div className="fade-up min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-emerald-50 flex flex-col items-center justify-center p-6 gap-5">
      <div className="text-center">
        <div className="text-7xl">👁️</div>
        <h1 className="text-4xl font-black text-sky-600 mt-1">VisionPlay</h1>
        <p className="text-sky-400 font-bold">Terapia Visual</p>
      </div>

      <div className="bg-white rounded-3xl shadow-lg p-6 w-full max-w-sm">
        <p className="text-xl font-black text-gray-700 text-center">Hola, <span className="text-sky-500">{config.patientName}</span>!</p>
        <div className="flex justify-around mt-5">
          {[
            { v: weekSessions,            l: 'Esta semana',   c: 'text-emerald-500' },
            { v: progress.streak,         l: 'Dias seguidos', c: 'text-amber-500' },
            { v: progress.currentLevel,   l: 'Nivel actual',  c: 'text-sky-500' },
          ].map(({ v, l, c }) => (
            <div key={l} className="text-center">
              <p className={`text-3xl font-black ${c}`}>{v}</p>
              <p className="text-xs text-gray-400 font-bold mt-0.5">{l}</p>
            </div>
          ))}
        </div>
        {progress.streak >= 3 && <p className="text-center text-amber-500 font-black text-sm mt-3">{progress.streak >= 7 ? 'Racha increible!' : 'Vas muy bien!'}</p>}
      </div>

      <div className="w-full max-w-sm flex flex-col gap-3">
        <p className="text-xs text-gray-400 font-bold text-center uppercase tracking-wider">Modulos de ejercicio</p>

        {/* Modulo B — Vergencia */}
        <button onClick={() => onStart('stereo')}
          className="btn w-full bg-sky-500 text-white font-black rounded-3xl py-4 shadow-xl hover:bg-sky-400 transition-all flex items-center gap-3 px-5"
          style={{ boxShadow: '0 8px 32px rgba(14,165,233,0.38)' }}>
          <span className="text-3xl">👁️</span>
          <div className="text-left">
            <p className="text-base leading-tight">Mod B — Vergencia</p>
            <p className="text-xs font-semibold opacity-80">Estereogramas · fusion libre · sin lentes</p>
          </div>
        </button>

        {/* Modulo B+D — Anaglifo */}
        <button onClick={onGlassesInfo}
          className="btn w-full text-white font-black rounded-3xl py-4 shadow-xl hover:opacity-90 transition-all flex items-center gap-3 px-5"
          style={{ background: 'linear-gradient(135deg,#ef4444,#06b6d4)', boxShadow: '0 8px 28px rgba(239,68,68,0.28)' }}>
          <span className="text-3xl">🕶️</span>
          <div className="text-left">
            <p className="text-base leading-tight">Mod B+D — Anaglifo</p>
            <p className="text-xs font-semibold opacity-80">Vergencia + ambliopia · lentes rojo-cyan</p>
          </div>
        </button>

        {/* Modulo A — Sacadicos */}
        <button onClick={() => onStart('saccadic')}
          className="btn w-full text-white font-black rounded-3xl py-4 shadow-xl hover:opacity-90 transition-all flex items-center gap-3 px-5"
          style={{ background: 'linear-gradient(135deg,#f97316,#eab308)', boxShadow: '0 8px 28px rgba(249,115,22,0.28)' }}>
          <span className="text-3xl">⚡</span>
          <div className="text-left">
            <p className="text-base leading-tight">Mod A — Sacadicos</p>
            <p className="text-xs font-semibold opacity-80">Oculomotricidad · movimientos rapidos</p>
          </div>
        </button>
      </div>

      <div className="flex gap-3 w-full max-w-sm">
        <button onClick={onProgress} className="btn flex-1 bg-white text-sky-600 font-bold rounded-2xl py-4 shadow border border-sky-100 hover:bg-sky-50 transition-all">Mi Progreso</button>
        <button onClick={onSettings} className="btn bg-white text-gray-500 font-bold rounded-2xl py-4 px-5 shadow border border-gray-100 hover:bg-gray-50 transition-all">⚙️</button>
      </div>

      <p className="text-xs text-gray-300 text-center max-w-xs font-semibold leading-relaxed">
        Complemento a la terapia visual profesional. No sustituye supervision medica.
      </p>
    </div>
  )
}

// ─── GLASSES INFO ────────────────────────────────────────────
function GlassesInfoView({ pair, onBack, onStart }: { pair: StereoPair; onBack: () => void; onStart: () => void }) {
  return (
    <div className="fade-up min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg,#fff1f0,#ecfeff)' }}>
      <div className="px-5 py-4 flex items-center gap-3">
        <button onClick={onBack} className="btn font-black text-lg text-red-500">volver</button>
        <h2 className="font-black text-xl text-gray-700">Como hacer los lentes</h2>
      </div>
      <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto pb-8">
        <div className="bg-white rounded-3xl shadow p-5">
          <h3 className="font-black text-gray-700 mb-2">Como funciona</h3>
          <p className="text-gray-500 font-semibold text-sm leading-relaxed">Filtro <span className="text-red-500 font-black">rojo</span> en ojo izquierdo + <span className="text-cyan-500 font-black">cyan</span> en ojo derecho. Cada ojo ve solo su capa de color y el cerebro las fusiona, entrenando coordinacion binocular.</p>
        </div>
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-3">
          <h3 className="font-black text-gray-700">Materiales</h3>
          {[['🔴','Celofen rojo','Libreria o manualidades'],['🔵','Celofen cyan (azul-verde)','Libreria'],['📦','Carton','Caja de cereal sirve'],['✂️','Tijeras y cinta','Lo que tengas']].map(([e,n,w]) => (
            <div key={n} className="flex items-start gap-3"><span className="text-2xl">{e}</span><div><p className="font-black text-gray-700 text-sm">{n}</p><p className="text-xs text-gray-400 font-semibold">{w}</p></div></div>
          ))}
        </div>
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-3">
          <h3 className="font-black text-gray-700">Paso a paso</h3>
          {['Recorta en carton: dos circulos de 5cm unidos por un puente nasal con patillas.','Recorta ventanas en los circulos del tamano de tus ojos.','Pega celofen ROJO en ventana OJO IZQUIERDO.','Pega celofen CYAN en ventana OJO DERECHO.','Listo! Ponte los lentes y pulsa Empezar.'].map((t,i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white font-black text-sm" style={{ background: 'linear-gradient(135deg,#ef4444,#06b6d4)' }}>{i+1}</div>
              <p className="text-gray-500 font-semibold text-sm leading-relaxed">{t}</p>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-3xl shadow p-5">
          <h3 className="font-black text-gray-700 mb-3 text-sm">Preview sin lentes</h3>
          <div className="flex justify-center">
            <svg viewBox="0 0 120 120" width={150} height={150} style={{ background: 'white', borderRadius: 12, border: '2px solid #f3f4f6' }}>
              <g dangerouslySetInnerHTML={{ __html: colorize(pair.left,  '#ef4444') }} />
              <g dangerouslySetInnerHTML={{ __html: colorize(pair.right, '#06b6d4') }} />
            </svg>
          </div>
          <p className="text-xs text-gray-400 font-bold text-center mt-2">Con lentes: cada ojo ve solo su color</p>
        </div>
        <div className="rounded-3xl p-4" style={{ background: '#fffbeb' }}>
          {['El celofen debe bloquear el color opuesto — prueba contra pantalla.','Si ves un solo color, los lentes estan al reves.','Brillo maximo para mejor separacion.'].map(t => <p key={t} className="text-amber-800 text-xs font-semibold mb-1">• {t}</p>)}
        </div>
        <button onClick={onStart} className="btn text-white font-black text-xl rounded-3xl py-5 shadow-xl hover:opacity-90 transition-all"
          style={{ background: 'linear-gradient(135deg,#ef4444,#06b6d4)' }}>
          Empezar Anaglifo
        </button>
      </div>
    </div>
  )
}

// ─── STEREO EXERCISE ─────────────────────────────────────────
function StereoView({ stereoLv, remaining, totalT, sessionTime, fusions, level, pair, restActive, restTime, restDuration, showHint, celebrate, onFusion, onToggleHint, onEnd, onSkipRest }: {
  stereoLv: { gap: number; size: number }; remaining: number; totalT: number; sessionTime: number; fusions: number; level: number; pair: StereoPair
  restActive: boolean; restTime: number; restDuration: number; showHint: boolean; celebrate: boolean
  onFusion: () => void; onToggleHint: () => void; onEnd: () => void; onSkipRest: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <TopBar color="#0ea5e9" remaining={remaining} sessionTime={sessionTime} totalT={totalT} onEnd={onEnd} gradientColors="from-sky-400 to-emerald-400" />
      <StatsRow left={<><span className="text-2xl font-black text-emerald-500">{fusions}</span><p className="text-xs text-gray-400 font-bold">Fusiones</p></>} center={<><span className="text-base font-black text-sky-500">Nivel {level}</span><p className="text-xs text-gray-400 font-bold">{stereoLv.gap}px</p></>} right={<span className="text-base font-bold text-gray-600">{pair.name}</span>} />
      <div className="flex-1 flex flex-col items-center justify-center bg-white gap-5 px-4 py-5 relative overflow-hidden">
        {restActive ? <RestScreen restTime={restTime} restDuration={restDuration} hint={pair.hint} onSkip={onSkipRest} /> : (
          <>
            <p className="text-gray-400 font-semibold text-sm text-center max-w-xs">Mira entre las imagenes como si enfocaras algo lejano. Intenta ver una tercera imagen central.</p>
            <div className="flex items-center justify-center" style={{ gap: `${stereoLv.gap}px` }}>
              {[pair.left, pair.right].map((svg, i) => (
                <SvgFrame key={i} svg={svg} size={stereoLv.size} celebrate={celebrate} celebrateClass="celebrate" />
              ))}
            </div>
            {celebrate && <CelebrateStar />}
            {showHint && <HintBox hint={pair.hint} />}
            <ActionBtn label="Lo veo!" onClick={onFusion} bg="linear-gradient(135deg,#38bdf8,#0ea5e9)" glow="rgba(14,165,233,0.42)" />
            <button onClick={onToggleHint} className="btn text-gray-400 font-bold text-sm hover:text-amber-500 transition-colors">{showHint ? 'Ocultar pista' : 'Ver pista'}</button>
          </>
        )}
      </div>
      <div className="bg-sky-50 px-6 py-2.5 text-center border-t border-sky-100"><p className="text-sky-400 text-xs font-bold">Tip: relaja la vista como si miraras a traves de la pantalla</p></div>
    </div>
  )
}

// ─── ANAGLYPH EXERCISE ───────────────────────────────────────
function AnaglyphView({ config, pxPerCm, level, pair, remaining, totalT, sessionTime, fusions, restActive, restTime, restDuration, showHint, celebrate, onFusion, onToggleHint, onEnd, onSkipRest }: {
  config: Config; pxPerCm: number; level: number; pair: StereoPair; remaining: number; totalT: number; sessionTime: number; fusions: number
  restActive: boolean; restTime: number; restDuration: number; showHint: boolean; celebrate: boolean
  onFusion: () => void; onToggleHint: () => void; onEnd: () => void; onSkipRest: () => void
}) {
  const size = Math.round(ANAGLYPH_CM[Math.min(level - 1, 4)] * pxPerCm)
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="px-4 py-3 flex items-center gap-3 shadow-sm border-b border-gray-100" style={{ background: 'linear-gradient(90deg,#fff1f0,#ecfeff)' }}>
        <button onClick={onEnd} className="btn text-gray-400 text-xl font-black w-8 hover:text-gray-600">X</button>
        <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min((sessionTime / totalT) * 100, 100)}%`, background: 'linear-gradient(90deg,#ef4444,#06b6d4)' }} />
        </div>
        <span className="font-black text-lg tabular-nums w-14 text-right" style={{ color: '#ef4444' }}>{fmt(remaining)}</span>
      </div>
      <StatsRow
        left={<><span className="text-2xl font-black text-emerald-500">{fusions}</span><p className="text-xs text-gray-400 font-bold">Fusiones</p></>}
        center={<div className="flex gap-1"><span className="text-xs font-black text-red-500 bg-red-50 px-2 py-0.5 rounded-full">ROJO izq</span><span className="text-xs font-black text-cyan-500 bg-cyan-50 px-2 py-0.5 rounded-full">CYAN der</span></div>}
        right={<span className="text-sm font-bold text-gray-500">Nivel {level}</span>}
      />
      <div className="flex-1 flex flex-col items-center justify-center bg-white gap-5 px-4 py-5 relative overflow-hidden">
        {restActive ? <RestScreen restTime={restTime} restDuration={restDuration} hint={pair.hint} onSkip={onSkipRest} isAnaglyph /> : (
          <>
            <p className="text-gray-400 font-semibold text-sm text-center max-w-xs">Ponte los lentes rojo-cyan. Con los lentes deberia verse la imagen completa.</p>
            <div className="relative">
              <svg viewBox="0 0 120 120" width={size} height={size}
                className={celebrate ? 'celebrateAna' : ''}
                style={{ border: '3px solid #f3f4f6', borderRadius: 14, background: 'white', display: 'block', opacity: celebrate ? 0.5 : 1, transition: 'opacity 0.25s' }}>
                <g opacity={config.leftEyeContrast}  dangerouslySetInnerHTML={{ __html: colorize(pair.left,  '#ef4444') }} />
                <g opacity={config.rightEyeContrast} dangerouslySetInnerHTML={{ __html: colorize(pair.right, '#06b6d4') }} />
              </svg>
              {celebrate && <CelebrateStar />}
            </div>
            {showHint && <HintBox hint={pair.hint} />}
            <ActionBtn label="Lo veo!" onClick={onFusion} bg="linear-gradient(135deg,#ef4444,#06b6d4)" glow="rgba(239,68,68,0.38)" />
            <button onClick={onToggleHint} className="btn text-gray-400 font-bold text-sm hover:text-amber-500 transition-colors">{showHint ? 'Ocultar pista' : 'Ver pista'}</button>
          </>
        )}
      </div>
      <div className="px-6 py-2 text-center border-t border-gray-100" style={{ background: 'linear-gradient(90deg,#fff1f0,#ecfeff)' }}>
        <p className="text-xs font-bold text-gray-400">Rojo en ojo izquierdo / Cyan en ojo derecho</p>
      </div>
    </div>
  )
}

// ─── SACCADIC EXERCISE ───────────────────────────────────────
function SaccadicView({ config, pxPerCm, level, hits, misses, remaining, totalT, sessionTime, celebrate, onHit, onMiss, onEnd }: {
  config: Config; pxPerCm: number; level: number; hits: number; misses: number; remaining: number; totalT: number; sessionTime: number; celebrate: boolean
  onHit: (rt: number) => void; onMiss: () => void; onEnd: () => void
}) {
  const lvCfg    = SACCADIC_LEVELS[Math.min(level - 1, 4)]
  const targetPx = Math.max(Math.round(lvCfg.targetCm * pxPerCm), 18) // min 18px safety floor
  const [pos, setPos] = useState({ x: 50, y: 50 })
  const [visible, setVisible] = useState(false)
  const [flash, setFlash] = useState(false)
  const appearTimeRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const accuracy = hits + misses > 0 ? Math.round((hits / (hits + misses)) * 100) : 100

  function nextTarget() {
    setPos(randPos())
    setVisible(true)
    appearTimeRef.current = Date.now()
    timeoutRef.current = setTimeout(() => {
      setVisible(false)
      onMiss()
      setTimeout(nextTarget, 500)
    }, lvCfg.windowMs)
  }

  useEffect(() => {
    const id = setTimeout(nextTarget, 600)
    return () => { clearTimeout(id); if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [])

  function handleHit() {
    if (!visible) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setVisible(false)
    setFlash(true); setTimeout(() => setFlash(false), 300)
    onHit(Date.now() - appearTimeRef.current)
    setTimeout(nextTarget, 400)
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Top bar */}
      <div className="px-4 py-3 flex items-center gap-3 shadow-sm border-b border-gray-100" style={{ background: 'linear-gradient(90deg,#fff7ed,#fef9c3)' }}>
        <button onClick={onEnd} className="btn text-gray-400 text-xl font-black w-8 hover:text-gray-600">X</button>
        <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min((sessionTime / totalT) * 100, 100)}%`, background: 'linear-gradient(90deg,#f97316,#eab308)' }} />
        </div>
        <span className="font-black text-lg tabular-nums w-14 text-right" style={{ color: '#f97316' }}>{fmt(remaining)}</span>
      </div>

      {/* Stats */}
      <div className="px-6 py-2.5 flex justify-between items-center border-b border-gray-100 bg-gray-50/60">
        <div className="text-center"><span className="text-2xl font-black text-emerald-500">{hits}</span><p className="text-xs text-gray-400 font-bold">Aciertos</p></div>
        <div className="text-center"><span className="text-2xl font-black text-orange-500">{accuracy}%</span><p className="text-xs text-gray-400 font-bold">Precision</p></div>
        <div className="text-center"><span className="text-sm font-black text-orange-400">Nv {level}</span><p className="text-xs text-gray-400 font-bold">{lvCfg.label}</p></div>
        <div className="text-center"><span className="text-2xl font-black text-red-400">{misses}</span><p className="text-xs text-gray-400 font-bold">Fallos</p></div>
      </div>

      {/* Exercise field — full remaining space, relative for absolute target */}
      <div className="flex-1 relative bg-white overflow-hidden select-none"
        style={{ background: flash ? 'rgba(249,115,22,0.06)' : 'white', transition: 'background 0.2s' }}>

        {/* Crosshair guides (subtle) */}
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.04 }}>
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-600" />
        </div>

        {/* Saccadic target */}
        {visible && (
          <button
            onClick={handleHit}
            className="absolute flex items-center justify-center rounded-full font-black text-white transition-none"
            style={{
              left: `${pos.x}%`, top: `${pos.y}%`,
              width: targetPx, height: targetPx,
              transform: 'translate(-50%, -50%)',
              background: 'linear-gradient(135deg,#f97316,#eab308)',
              boxShadow: '0 4px 20px rgba(249,115,22,0.55)',
              animation: 'pulse 0.6s ease infinite',
              fontSize: Math.max(targetPx * 0.35, 12),
            }}>
            {targetPx >= 40 ? '!' : ''}
          </button>
        )}

        {/* Instruction overlay at start */}
        {hits === 0 && misses === 0 && !visible && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-300 font-black text-lg text-center px-8">Toca el circulo naranja<br/>cuando aparezca</p>
          </div>
        )}

        {/* Reaction time flash */}
        {celebrate && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-5xl" style={{ animation: 'pop 0.4s ease' }}>⚡</span>
          </div>
        )}
      </div>

      <div className="px-6 py-2.5 text-center border-t border-gray-100" style={{ background: 'linear-gradient(90deg,#fff7ed,#fef9c3)' }}>
        <p className="text-xs font-bold text-amber-400">Ventana: {(lvCfg.windowMs/1000).toFixed(1)}s · Target: {lvCfg.targetCm}cm ({targetPx}px) · {pxPerCm.toFixed(1)}px/cm · Pantalla {config.screenInches}"</p>
      </div>
    </div>
  )
}

// ─── SHARED COMPONENTS ───────────────────────────────────────
function TopBar({ color, remaining, sessionTime, totalT, onEnd, gradientColors }: { color: string; remaining: number; sessionTime: number; totalT: number; onEnd: () => void; gradientColors: string }) {
  return (
    <div className="bg-white px-4 py-3 flex items-center gap-3 shadow-sm border-b border-gray-100">
      <button onClick={onEnd} className="btn text-gray-400 text-xl font-black w-8 hover:text-gray-600">X</button>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${gradientColors} transition-all duration-1000`} style={{ width: `${Math.min((sessionTime / totalT) * 100, 100)}%` }} />
      </div>
      <span className="font-black text-lg tabular-nums w-14 text-right" style={{ color }}>{fmt(remaining)}</span>
    </div>
  )
}
function StatsRow({ left, center, right }: { left: React.ReactNode; center: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="px-6 py-2.5 flex justify-between items-center border-b border-gray-100 bg-gray-50/60">
      <div className="text-center">{left}</div>
      <div className="text-center">{center}</div>
      <div className="text-center">{right}</div>
    </div>
  )
}
function SvgFrame({ svg, size, celebrate, celebrateClass }: { svg: string; size: number; celebrate: boolean; celebrateClass: string }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size}
      className={celebrate ? celebrateClass : ''}
      style={{ border: '3px solid #f3f4f6', borderRadius: 14, background: 'white', display: 'block', opacity: celebrate ? 0.5 : 1, transition: 'opacity 0.25s' }}
      dangerouslySetInnerHTML={{ __html: svg }} />
  )
}
function CelebrateStar() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <span className="text-8xl" style={{ animation: 'pop 0.9s ease' }}>⭐</span>
    </div>
  )
}
function HintBox({ hint }: { hint: string }) {
  return (
    <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl px-5 py-3 text-center max-w-xs fade-up">
      <p className="text-amber-600 font-bold text-sm">Deberias ver:</p>
      <p className="text-amber-800 font-black text-base mt-1">{hint}</p>
    </div>
  )
}
function ActionBtn({ label, onClick, bg, glow }: { label: string; onClick: () => void; bg: string; glow: string }) {
  return (
    <button onClick={onClick} className="btn w-full max-w-xs text-white font-black text-xl rounded-3xl py-5 shadow-xl hover:opacity-90 transition-all"
      style={{ background: bg, boxShadow: `0 8px 28px ${glow}`, minHeight: 72 }}>
      {label}
    </button>
  )
}

// ─── REST SCREEN ─────────────────────────────────────────────
function RestScreen({ restTime, restDuration, hint, onSkip, isAnaglyph }: { restTime: number; restDuration: number; hint: string; onSkip: () => void; isAnaglyph?: boolean }) {
  const r = 42, circ = 2 * Math.PI * r
  const pct = (restDuration - restTime) / restDuration
  const color = isAnaglyph ? '#ef4444' : '#10b981'
  return (
    <div className="fade-up flex flex-col items-center gap-5">
      <span className="text-6xl" style={{ animation: 'pop 1s ease infinite' }}>⭐</span>
      <h2 className="text-2xl font-black" style={{ color }}>Excelente!</h2>
      <p className="text-gray-400 font-semibold">Relaja tus ojos...</p>
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s linear' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center"><span className="text-3xl font-black text-gray-600">{restTime}</span></div>
      </div>
      <div className={`rounded-2xl px-5 py-3 text-center max-w-xs ${isAnaglyph ? 'bg-red-50' : 'bg-emerald-50'}`}>
        <p className={`font-bold text-sm ${isAnaglyph ? 'text-red-500' : 'text-emerald-600'}`}>Deberias haber visto:</p>
        <p className={`font-black text-base mt-1 ${isAnaglyph ? 'text-red-700' : 'text-emerald-700'}`}>{hint}</p>
      </div>
      <button onClick={onSkip} className="btn bg-white border border-gray-200 text-gray-500 font-bold rounded-2xl px-4 py-2 text-sm hover:bg-gray-50 transition-all">Saltar descanso (dev)</button>
    </div>
  )
}

// ─── COMPLETE ────────────────────────────────────────────────
function CompleteView({ sessions, streak, mode, onHome, onProgress }: { sessions: SessionRecord[]; streak: number; mode: ExerciseMode; onHome: () => void; onProgress: () => void }) {
  const last = sessions[sessions.length - 1]
  const fusions = last?.fusions ?? 0
  const duration = last?.duration ?? 0
  const maxLevel = last?.maxLevel ?? 1
  const isSacc = mode === 'saccadic'
  const isAna  = mode === 'anaglyph'
  const stars = isSacc
    ? ((last?.hits ?? 0) >= 30 ? 3 : (last?.hits ?? 0) >= 15 ? 2 : 1)
    : (fusions >= 15 ? 3 : fusions >= 8 ? 2 : fusions >= 3 ? 1 : 0)
  const modeColors: Record<ExerciseMode, string> = { stereo: '#0ea5e9', anaglyph: 'linear-gradient(90deg,#ef4444,#06b6d4)', saccadic: 'linear-gradient(90deg,#f97316,#eab308)' }
  const modeLabels: Record<ExerciseMode, string> = { stereo: 'Mod B Vergencia', anaglyph: 'Mod B+D Anaglifo', saccadic: 'Mod A Sacadicos' }
  return (
    <div className="fade-up min-h-screen flex flex-col items-center justify-center p-6 gap-6 text-center"
      style={{ background: isSacc ? 'linear-gradient(135deg,#fff7ed,#fef9c3)' : isAna ? 'linear-gradient(135deg,#fff1f0,#ecfeff)' : 'linear-gradient(135deg,#f0f9ff,#ecfdf5)' }}>
      <span className="text-7xl" style={{ animation: 'pop 1s ease 2' }}>🎉</span>
      <h1 className="text-3xl font-black text-gray-700">Sesion Completada!</h1>
      <span className="text-sm font-bold px-3 py-1 rounded-full text-white" style={{ background: modeColors[mode] }}>{modeLabels[mode]}</span>
      <div className="flex gap-2 text-5xl">{[1,2,3].map(i => <span key={i} style={{ opacity: i <= stars ? 1 : 0.2 }}>⭐</span>)}</div>
      <div className="bg-white rounded-3xl shadow-lg p-6 w-full max-w-sm">
        {isSacc ? (
          <div className="grid grid-cols-2 gap-4 text-center">
            <div><p className="text-3xl font-black text-emerald-500">{last?.hits ?? 0}</p><p className="text-xs text-gray-400 font-bold">Aciertos</p></div>
            <div><p className="text-3xl font-black text-red-400">{last?.misses ?? 0}</p><p className="text-xs text-gray-400 font-bold">Fallos</p></div>
            <div><p className="text-3xl font-black text-orange-500">{last?.hits && last?.misses !== undefined ? Math.round(last.hits / (last.hits + last.misses) * 100) : 100}%</p><p className="text-xs text-gray-400 font-bold">Precision</p></div>
            <div><p className="text-3xl font-black text-sky-500">{last?.avgReactionMs ? (last.avgReactionMs / 1000).toFixed(2) + 's' : '--'}</p><p className="text-xs text-gray-400 font-bold">T. reaccion</p></div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><p className="text-3xl font-black text-emerald-500">{fusions}</p><p className="text-xs text-gray-400 font-bold">Fusiones</p></div>
            <div><p className="text-3xl font-black text-sky-500">{fmt(duration)}</p><p className="text-xs text-gray-400 font-bold">Tiempo</p></div>
            <div><p className="text-3xl font-black text-amber-500">{maxLevel}</p><p className="text-xs text-gray-400 font-bold">Nivel max</p></div>
          </div>
        )}
        {streak > 0 && <div className="mt-4 pt-4 border-t border-gray-100"><p className="text-amber-500 font-black">{streak} dia{streak > 1 ? 's' : ''} seguido{streak > 1 ? 's' : ''}</p></div>}
      </div>
      <p className="text-gray-400 text-sm font-semibold max-w-xs">Descansa 15 minutos antes del proximo modulo</p>
      <div className="flex gap-3 w-full max-w-sm">
        <button onClick={onProgress} className="btn flex-1 bg-white text-sky-600 font-bold rounded-2xl py-4 shadow border border-sky-100 hover:bg-sky-50 transition-all">Progreso</button>
        <button onClick={onHome}     className="btn flex-1 bg-sky-500 text-white font-black rounded-2xl py-4 shadow-lg hover:bg-sky-400 transition-all">Inicio</button>
      </div>
    </div>
  )
}

// ─── PROGRESS ────────────────────────────────────────────────
function ProgressView({ progress, onBack }: { progress: Progress; onBack: () => void }) {
  const last14 = [...progress.sessions].slice(-14)
  const maxF = Math.max(...last14.map(s => s.fusions), 1)
  const totalFusions = progress.sessions.reduce((a, s) => a + s.fusions, 0)
  const byStereo   = progress.sessions.filter(s => s.mode === 'stereo').length
  const byAnaglyph = progress.sessions.filter(s => s.mode === 'anaglyph').length
  const bySaccadic = progress.sessions.filter(s => s.mode === 'saccadic').length
  const barColor = (m: ExerciseMode) => ({ stereo: 'linear-gradient(to top,#0ea5e9,#7dd3fc)', anaglyph: 'linear-gradient(to top,#ef4444,#06b6d4)', saccadic: 'linear-gradient(to top,#f97316,#eab308)' })[m]
  const modeBadge = (m: ExerciseMode) => ({ stereo: { bg: '#f0f9ff', c: '#0ea5e9', t: 'STE' }, anaglyph: { bg: '#fff1f0', c: '#ef4444', t: 'ANA' }, saccadic: { bg: '#fff7ed', c: '#f97316', t: 'SAC' } })[m]
  return (
    <div className="fade-up min-h-screen bg-gradient-to-br from-sky-50 to-emerald-50 flex flex-col">
      <div className="bg-white/90 backdrop-blur-sm px-5 py-4 flex items-center gap-3 shadow-sm">
        <button onClick={onBack} className="btn text-sky-500 font-black text-lg">volver</button>
        <h2 className="font-black text-xl text-gray-700">Mi Progreso</h2>
      </div>
      <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto pb-8">
        <div className="grid grid-cols-2 gap-3">
          {[
            { v: progress.sessions.length, l: 'Sesiones', c: 'text-sky-500' },
            { v: progress.streak,          l: 'Racha',    c: 'text-amber-500' },
            { v: progress.currentLevel,    l: 'Nivel',    c: 'text-emerald-500' },
            { v: totalFusions,             l: 'Fusiones', c: 'text-violet-500' },
          ].map(({ v, l, c }) => (
            <div key={l} className="bg-white rounded-2xl shadow p-4 text-center">
              <p className={`text-3xl font-black ${c}`}>{v}</p>
              <p className="text-xs text-gray-400 font-bold mt-1">{l}</p>
            </div>
          ))}
        </div>

        {/* Mode breakdown */}
        <div className="bg-white rounded-3xl shadow p-5 flex gap-3">
          {[
            { v: byStereo,   l: 'Vergencia', bg: '#f0f9ff', c: '#0ea5e9' },
            { v: byAnaglyph, l: 'Anaglifo',  bg: '#fff1f0', c: '#ef4444' },
            { v: bySaccadic, l: 'Sacadicos', bg: '#fff7ed', c: '#f97316' },
          ].map(({ v, l, bg, c }) => (
            <div key={l} className="flex-1 text-center rounded-2xl py-3" style={{ background: bg }}>
              <p className="text-2xl font-black" style={{ color: c }}>{v}</p>
              <p className="text-xs font-bold text-gray-400 mt-0.5">{l}</p>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="bg-white rounded-3xl shadow p-5">
          <h3 className="font-black text-gray-600 mb-4 text-sm">Actividad (ultimas 14 sesiones)</h3>
          {last14.length === 0 ? (
            <div className="h-28 flex items-center justify-center text-gray-300 font-bold text-sm">Sin sesiones aun</div>
          ) : (
            <>
              <div className="flex items-end gap-1.5 h-28">
                {last14.map(s => (
                  <div key={s.id} className="flex-1 flex flex-col items-center gap-1 group">
                    <span className="text-xs text-sky-500 font-black opacity-0 group-hover:opacity-100 transition-opacity">{s.fusions}</span>
                    <div className="w-full rounded-t-lg" style={{ height: `${Math.max((s.fusions / maxF) * 88, 4)}%`, background: barColor(s.mode) }} />
                    <span style={{ fontSize: 9 }} className="text-gray-300 font-bold">{new Date(s.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'numeric' })}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-2 justify-center">
                {[['#0ea5e9','Estereo'],['linear-gradient(90deg,#ef4444,#06b6d4)','Anaglifo'],['linear-gradient(90deg,#f97316,#eab308)','Sacadicos']].map(([bg,l]) => (
                  <div key={l} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{ background: bg }} /><span className="text-xs text-gray-400 font-bold">{l}</span></div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* History */}
        <div className="bg-white rounded-3xl shadow p-5">
          <h3 className="font-black text-gray-600 mb-3 text-sm">Historial</h3>
          {progress.sessions.length === 0 ? <p className="text-gray-300 font-bold text-center py-4 text-sm">Sin sesiones</p> : (
            <div className="flex flex-col divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {[...progress.sessions].reverse().map(s => {
                const mb = modeBadge(s.mode)
                return (
                  <div key={s.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-600 text-sm">{new Date(s.date).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                        <span className="text-xs font-black px-1.5 py-0.5 rounded-full" style={{ background: mb.bg, color: mb.c }}>{mb.t}</span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {fmt(s.duration)} · Nivel {s.maxLevel}
                        {s.mode === 'saccadic' && s.hits !== undefined ? ` · ${s.hits}/${(s.hits + (s.misses ?? 0))} hit · ${s.avgReactionMs ? (s.avgReactionMs / 1000).toFixed(2) + 's' : '--'}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-emerald-500">{s.fusions}</p>
                      <p className="text-xs text-gray-400">{s.mode === 'saccadic' ? 'hits' : 'fusion'}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <button onClick={() => {
          const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' })
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'visionplay-reporte.json'; a.click()
        }} className="btn bg-white border-2 border-dashed border-gray-200 text-gray-500 font-bold rounded-2xl py-3 text-sm hover:border-sky-300 hover:text-sky-500 transition-all">
          Exportar reporte para el profesional
        </button>
      </div>
    </div>
  )
}

// ─── SETTINGS ────────────────────────────────────────────────
function SettingsView({ config, onSave, onBack, onReset, onCalibrate }: { config: Config; onSave: (c: Config) => void; onBack: () => void; onReset: () => void; onCalibrate: () => void }) {
  const [pin, setPin] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [pinError, setPinError] = useState(false)
  const [form, setForm] = useState(config)
  const [confirmReset, setConfirmReset] = useState(false)

  function tryUnlock() {
    if (pin === config.pin) { setUnlocked(true); setPinError(false) }
    else { setPinError(true); setPin('') }
  }

  if (!unlocked) return (
    <div className="fade-up min-h-screen bg-gradient-to-br from-sky-50 to-emerald-50 flex flex-col items-center justify-center p-6 gap-5">
      <div className="text-6xl">🔒</div>
      <h2 className="text-2xl font-black text-gray-600">Area del Profesional</h2>
      <div className="bg-white rounded-3xl shadow-lg p-6 w-full max-w-xs flex flex-col gap-4">
        <input type="password" value={pin} maxLength={8}
          onChange={e => { setPin(e.target.value); setPinError(false) }}
          onKeyDown={e => e.key === 'Enter' && tryUnlock()}
          placeholder="PIN"
          className={`text-center text-3xl font-black border-2 rounded-2xl p-3 outline-none tracking-widest transition-all ${pinError ? 'border-red-300 bg-red-50' : 'border-gray-200 focus:border-sky-300'}`} />
        {pinError && <p className="text-red-400 font-bold text-sm text-center">PIN incorrecto</p>}
        <button onClick={tryUnlock} className="btn bg-sky-500 text-white font-black rounded-2xl py-3 text-lg hover:bg-sky-400 transition-all">Ingresar</button>
      </div>
      <button onClick={onBack} className="btn text-gray-400 font-bold hover:text-gray-600">volver</button>
    </div>
  )

  return (
    <div className="fade-up min-h-screen bg-gradient-to-br from-sky-50 to-emerald-50 flex flex-col">
      <div className="bg-white/90 backdrop-blur-sm px-5 py-4 flex items-center gap-3 shadow-sm">
        <button onClick={onBack} className="btn text-sky-500 font-black text-lg">volver</button>
        <h2 className="font-black text-xl text-gray-700">Configuracion</h2>
      </div>
      <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto pb-8">

        {/* Paciente */}
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-3">
          <h3 className="font-black text-gray-600">Paciente</h3>
          <input value={form.patientName} onChange={e => setForm(f => ({ ...f, patientName: e.target.value }))}
            placeholder="Nombre" className="border-2 border-gray-200 rounded-2xl px-4 py-3 font-bold text-gray-700 focus:border-sky-300 outline-none transition-all" />
        </div>

        {/* Sesion */}
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-4">
          <h3 className="font-black text-gray-600">Sesion</h3>
          <div>
            <p className="text-sm font-bold text-gray-400 mb-2">Duracion</p>
            <div className="flex gap-2">{[10,15,20].map(v => (
              <button key={v} onClick={() => setForm(f => ({ ...f, sessionDuration: v }))}
                className={`btn flex-1 rounded-2xl py-3 font-black transition-all ${form.sessionDuration === v ? 'bg-sky-500 text-white shadow-md' : 'bg-gray-100 text-gray-500'}`}>
                {v} min
              </button>
            ))}</div>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-400 mb-2">Descanso entre fusiones</p>
            <div className="flex gap-2 flex-wrap">{[10,15,20,25,30].map(v => (
              <button key={v} onClick={() => setForm(f => ({ ...f, restDuration: v }))}
                className={`btn rounded-2xl py-2 px-3 font-black text-sm transition-all ${form.restDuration === v ? 'bg-emerald-500 text-white shadow-md' : 'bg-gray-100 text-gray-500'}`}>
                {v}s
              </button>
            ))}</div>
          </div>
        </div>

        {/* Nivel */}
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-3">
          <h3 className="font-black text-gray-600">Nivel inicial</h3>
          <div className="flex gap-2">{[1,2,3,4,5].map(v => (
            <button key={v} onClick={() => setForm(f => ({ ...f, initialLevel: v }))}
              className={`btn flex-1 rounded-2xl py-3 font-black transition-all ${form.initialLevel === v ? 'bg-amber-400 text-white shadow-md' : 'bg-gray-100 text-gray-500'}`}>
              {v}
            </button>
          ))}</div>
        </div>

        {/* Contraste anaglifo — AMBLIOPÍA */}
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-4">
          <div>
            <h3 className="font-black text-gray-600">Contraste anaglifo</h3>
            <p className="text-xs text-gray-400 font-semibold mt-1">Para tratar ambliopia: reduce el contraste del ojo SANO (dominante) para que el ojo ambliope reciba mas estimulo</p>
          </div>
          {[
            { key: 'leftEyeContrast'  as const, label: 'Ojo IZQUIERDO (lente rojo)',  color: '#ef4444', bg: '#fff1f0' },
            { key: 'rightEyeContrast' as const, label: 'Ojo DERECHO (lente cyan)',    color: '#06b6d4', bg: '#ecfeff' },
          ].map(({ key, label, color, bg }) => (
            <div key={key} className="flex flex-col gap-2 rounded-2xl p-3" style={{ background: bg }}>
              <div className="flex justify-between items-center">
                <p className="text-sm font-black" style={{ color }}>{label}</p>
                <span className="text-lg font-black text-gray-700">{Math.round(form[key] * 100)}%</span>
              </div>
              <input type="range" min="10" max="100" step="10"
                value={Math.round(form[key] * 100)}
                onChange={e => setForm(f => ({ ...f, [key]: parseInt(e.target.value) / 100 }))}
                style={{ background: `linear-gradient(to right, ${color} ${Math.round(form[key] * 100)}%, #e5e7eb ${Math.round(form[key] * 100)}%)` }}
                className="w-full" />
              <p className="text-xs text-gray-400 font-semibold">
                {form[key] < 0.7 ? 'Reducido — ojo recibirá estimulo debilitado (modo ambliopia)' : form[key] < 1.0 ? 'Ligeramente reducido' : 'Normal (100%)'}
              </p>
            </div>
          ))}
          <button onClick={() => setForm(f => ({ ...f, leftEyeContrast: 1.0, rightEyeContrast: 1.0 }))}
            className="btn bg-gray-100 text-gray-500 font-bold rounded-2xl py-2 text-sm hover:bg-gray-200 transition-all">
            Resetear contraste (100% / 100%)
          </button>
        </div>

        {/* Calibracion */}
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-3">
          <h3 className="font-black text-gray-600">Pantalla y calibracion</h3>
          <p className="text-xs text-gray-400 font-semibold">Pantalla configurada: <span className="font-black text-gray-600">{form.screenInches}"</span></p>
          <button onClick={onCalibrate} className="btn border-2 border-violet-200 text-violet-500 font-bold rounded-2xl py-3 hover:bg-violet-50 transition-all">
            Volver a calibrar
          </button>
        </div>

        {/* PIN */}
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-3">
          <h3 className="font-black text-gray-600">Seguridad</h3>
          <input type="password" value={form.pin} maxLength={8}
            onChange={e => setForm(f => ({ ...f, pin: e.target.value }))}
            placeholder="Nuevo PIN"
            className="border-2 border-gray-200 rounded-2xl px-4 py-3 font-bold text-gray-700 focus:border-sky-300 outline-none transition-all" />
        </div>

        {/* Reset */}
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-3">
          <h3 className="font-black text-red-400">Zona de peligro</h3>
          {!confirmReset ? (
            <button onClick={() => setConfirmReset(true)} className="btn border-2 border-red-200 text-red-400 font-bold rounded-2xl py-3 hover:bg-red-50 transition-all">Resetear todo el progreso</button>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-red-500 font-bold text-sm text-center">Seguro? Se borrara todo el historial.</p>
              <div className="flex gap-3">
                <button onClick={() => { onReset(); setConfirmReset(false) }} className="btn flex-1 bg-red-500 text-white font-black rounded-2xl py-3 transition-all">Si, resetear</button>
                <button onClick={() => setConfirmReset(false)} className="btn flex-1 bg-gray-100 text-gray-600 font-bold rounded-2xl py-3 transition-all">Cancelar</button>
              </div>
            </div>
          )}
        </div>

        <button onClick={() => { onSave(form); onBack() }}
          className="btn bg-sky-500 text-white font-black text-lg rounded-3xl py-4 shadow-xl hover:bg-sky-400 transition-all"
          style={{ boxShadow: '0 8px 28px rgba(14,165,233,0.38)' }}>
          Guardar configuracion
        </button>
      </div>
    </div>
  )
}