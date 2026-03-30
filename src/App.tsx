import { useState, useEffect, useRef, useCallback } from 'react'

// ─── TYPES ───────────────────────────────────────────────────
type View = 'home' | 'exercise' | 'complete' | 'progress' | 'settings'

interface SessionRecord {
  id: string; date: string; duration: number; fusions: number; maxLevel: number
}
interface Config {
  patientName: string; sessionDuration: number; restDuration: number
  initialLevel: number; enableHints: boolean; pin: string
}
interface Progress {
  currentLevel: number; streak: number
  lastSessionDate: string | null; sessions: SessionRecord[]
}

const DEFAULT_CONFIG: Config = {
  patientName: 'Jugador', sessionDuration: 15, restDuration: 15,
  initialLevel: 1, enableHints: true, pin: '1234'
}
const DEFAULT_PROGRESS: Progress = {
  currentLevel: 1, streak: 0, lastSessionDate: null, sessions: []
}

// ─── LEVELS ──────────────────────────────────────────────────
const LEVELS = [
  { level: 1, gap: 32, size: 178 },
  { level: 2, gap: 52, size: 160 },
  { level: 3, gap: 72, size: 142 },
  { level: 4, gap: 92, size: 126 },
  { level: 5, gap: 112, size: 110 },
]

// ─── STEREOGRAM PAIRS ────────────────────────────────────────
// Left image + right image → when fused, you see the complete combined image
// Both sides share the same outer boundary so the brain can "lock on"
interface StereoPair { id: string; name: string; minLevel: number; left: string; right: string; hint: string }

const PAIRS: StereoPair[] = [
  {
    id: 'circles', name: 'Círculos', minLevel: 1,
    hint: '¡Círculo con dos puntos!',
    left:  `<circle cx="60" cy="60" r="50" fill="none" stroke="#111" stroke-width="5"/>
            <circle cx="36" cy="60" r="10" fill="#111"/>`,
    right: `<circle cx="60" cy="60" r="50" fill="none" stroke="#111" stroke-width="5"/>
            <circle cx="84" cy="60" r="10" fill="#111"/>`,
  },
  {
    id: 'compass', name: 'Brújula', minLevel: 1,
    hint: '¡Círculo con 8 puntos!',
    left:  `<circle cx="60" cy="60" r="50" fill="none" stroke="#111" stroke-width="5"/>
            <circle cx="60" cy="16" r="7" fill="#111"/>
            <circle cx="60" cy="104" r="7" fill="#111"/>
            <circle cx="16" cy="60" r="7" fill="#111"/>
            <circle cx="104" cy="60" r="7" fill="#111"/>`,
    right: `<circle cx="60" cy="60" r="50" fill="none" stroke="#111" stroke-width="5"/>
            <circle cx="95" cy="25" r="7" fill="#111"/>
            <circle cx="25" cy="25" r="7" fill="#111"/>
            <circle cx="95" cy="95" r="7" fill="#111"/>
            <circle cx="25" cy="95" r="7" fill="#111"/>`,
  },
  {
    id: 'house', name: 'Casa 🏠', minLevel: 2,
    hint: '¡Casa con ventana y puerta!',
    left:  `<polygon points="60,8 108,50 12,50" fill="none" stroke="#111" stroke-width="5" stroke-linejoin="round"/>
            <rect x="12" y="50" width="96" height="62" fill="none" stroke="#111" stroke-width="5"/>
            <rect x="20" y="64" width="28" height="24" fill="none" stroke="#111" stroke-width="3.5"/>
            <line x1="34" y1="64" x2="34" y2="88" stroke="#111" stroke-width="2"/>
            <line x1="20" y1="76" x2="48" y2="76" stroke="#111" stroke-width="2"/>`,
    right: `<polygon points="60,8 108,50 12,50" fill="none" stroke="#111" stroke-width="5" stroke-linejoin="round"/>
            <rect x="12" y="50" width="96" height="62" fill="none" stroke="#111" stroke-width="5"/>
            <rect x="72" y="74" width="26" height="38" fill="none" stroke="#111" stroke-width="3.5"/>
            <circle cx="91" cy="93" r="3" fill="#111"/>`,
  },
  {
    id: 'cat', name: 'Gato 🐱', minLevel: 2,
    hint: '¡Gato con bigotes!',
    left:  `<ellipse cx="60" cy="68" rx="44" ry="36" fill="none" stroke="#111" stroke-width="5"/>
            <polygon points="24,44 14,16 40,40" fill="none" stroke="#111" stroke-width="4" stroke-linejoin="round"/>
            <polygon points="96,44 106,16 80,40" fill="none" stroke="#111" stroke-width="4" stroke-linejoin="round"/>
            <circle cx="44" cy="64" r="7" fill="#111"/>
            <circle cx="76" cy="64" r="7" fill="#111"/>
            <path d="M52,80 Q60,87 68,80" fill="none" stroke="#111" stroke-width="3.5"/>`,
    right: `<ellipse cx="60" cy="68" rx="44" ry="36" fill="none" stroke="#111" stroke-width="5"/>
            <polygon points="24,44 14,16 40,40" fill="none" stroke="#111" stroke-width="4" stroke-linejoin="round"/>
            <polygon points="96,44 106,16 80,40" fill="none" stroke="#111" stroke-width="4" stroke-linejoin="round"/>
            <circle cx="44" cy="64" r="7" fill="#111"/>
            <circle cx="76" cy="64" r="7" fill="#111"/>
            <path d="M52,80 Q60,87 68,80" fill="none" stroke="#111" stroke-width="3.5"/>
            <line x1="12" y1="70" x2="52" y2="73" stroke="#111" stroke-width="3.5"/>
            <line x1="12" y1="79" x2="52" y2="79" stroke="#111" stroke-width="3.5"/>
            <line x1="68" y1="73" x2="108" y2="70" stroke="#111" stroke-width="3.5"/>
            <line x1="68" y1="79" x2="108" y2="79" stroke="#111" stroke-width="3.5"/>`,
  },
  {
    id: 'fish', name: 'Pez 🐠', minLevel: 3,
    hint: '¡Pez con aletas!',
    left:  `<ellipse cx="50" cy="60" rx="40" ry="26" fill="none" stroke="#111" stroke-width="5"/>
            <path d="M90,60 L112,40 L112,80 Z" fill="none" stroke="#111" stroke-width="4.5" stroke-linejoin="round"/>
            <circle cx="70" cy="53" r="5" fill="#111"/>`,
    right: `<ellipse cx="50" cy="60" rx="40" ry="26" fill="none" stroke="#111" stroke-width="5"/>
            <path d="M90,60 L112,40 L112,80 Z" fill="none" stroke="#111" stroke-width="4.5" stroke-linejoin="round"/>
            <circle cx="70" cy="53" r="5" fill="#111"/>
            <path d="M38,35 Q50,44 56,35 Q50,27 38,35 Z" fill="none" stroke="#111" stroke-width="4"/>
            <path d="M38,85 Q50,76 56,85 Q50,93 38,85 Z" fill="none" stroke="#111" stroke-width="4"/>
            <path d="M12,50 Q22,60 12,70" fill="none" stroke="#111" stroke-width="4"/>`,
  },
  {
    id: 'tree', name: 'Árbol 🌳', minLevel: 3,
    hint: '¡Árbol con manzanas!',
    left:  `<rect x="48" y="74" width="24" height="42" fill="none" stroke="#111" stroke-width="5"/>
            <ellipse cx="60" cy="50" rx="42" ry="36" fill="none" stroke="#111" stroke-width="5"/>
            <line x1="52" y1="74" x2="36" y2="56" stroke="#111" stroke-width="3"/>
            <line x1="68" y1="74" x2="84" y2="56" stroke="#111" stroke-width="3"/>`,
    right: `<rect x="48" y="74" width="24" height="42" fill="none" stroke="#111" stroke-width="5"/>
            <ellipse cx="60" cy="50" rx="42" ry="36" fill="none" stroke="#111" stroke-width="5"/>
            <line x1="52" y1="74" x2="36" y2="56" stroke="#111" stroke-width="3"/>
            <line x1="68" y1="74" x2="84" y2="56" stroke="#111" stroke-width="3"/>
            <circle cx="40" cy="44" r="9" fill="none" stroke="#111" stroke-width="3.5"/>
            <circle cx="65" cy="36" r="9" fill="none" stroke="#111" stroke-width="3.5"/>
            <circle cx="80" cy="54" r="9" fill="none" stroke="#111" stroke-width="3.5"/>`,
  },
  {
    id: 'robot', name: 'Robot 🤖', minLevel: 4,
    hint: '¡Robot completo con cuerpo!',
    left:  `<rect x="26" y="4" width="68" height="50" rx="8" fill="none" stroke="#111" stroke-width="5"/>
            <circle cx="44" cy="26" r="9" fill="none" stroke="#111" stroke-width="4"/>
            <circle cx="76" cy="26" r="9" fill="none" stroke="#111" stroke-width="4"/>
            <rect x="44" y="44" width="32" height="7" rx="3.5" fill="none" stroke="#111" stroke-width="3"/>
            <line x1="60" y1="4" x2="60" y2="0" stroke="#111" stroke-width="5"/>
            <circle cx="60" cy="0" r="4" fill="#111"/>`,
    right: `<rect x="26" y="4" width="68" height="50" rx="8" fill="none" stroke="#111" stroke-width="5"/>
            <circle cx="44" cy="26" r="9" fill="none" stroke="#111" stroke-width="4"/>
            <circle cx="76" cy="26" r="9" fill="none" stroke="#111" stroke-width="4"/>
            <rect x="44" y="44" width="32" height="7" rx="3.5" fill="none" stroke="#111" stroke-width="3"/>
            <line x1="60" y1="4" x2="60" y2="0" stroke="#111" stroke-width="5"/>
            <circle cx="60" cy="0" r="4" fill="#111"/>
            <rect x="18" y="62" width="84" height="48" rx="6" fill="none" stroke="#111" stroke-width="5"/>
            <line x1="6" y1="68" x2="18" y2="86" stroke="#111" stroke-width="5"/>
            <line x1="114" y1="68" x2="102" y2="86" stroke="#111" stroke-width="5"/>
            <rect x="32" y="74" width="20" height="26" rx="4" fill="none" stroke="#111" stroke-width="3.5"/>
            <rect x="68" y="74" width="20" height="26" rx="4" fill="none" stroke="#111" stroke-width="3.5"/>`,
  },
  {
    id: 'sun', name: 'Sol ☀️', minLevel: 4,
    hint: '¡Sol con 8 rayos!',
    left:  `<circle cx="60" cy="60" r="26" fill="none" stroke="#111" stroke-width="5"/>
            <line x1="60" y1="6" x2="60" y2="22" stroke="#111" stroke-width="5" stroke-linecap="round"/>
            <line x1="60" y1="98" x2="60" y2="114" stroke="#111" stroke-width="5" stroke-linecap="round"/>
            <line x1="6" y1="60" x2="22" y2="60" stroke="#111" stroke-width="5" stroke-linecap="round"/>
            <line x1="98" y1="60" x2="114" y2="60" stroke="#111" stroke-width="5" stroke-linecap="round"/>`,
    right: `<circle cx="60" cy="60" r="26" fill="none" stroke="#111" stroke-width="5"/>
            <line x1="60" y1="6" x2="60" y2="22" stroke="#111" stroke-width="5" stroke-linecap="round"/>
            <line x1="60" y1="98" x2="60" y2="114" stroke="#111" stroke-width="5" stroke-linecap="round"/>
            <line x1="6" y1="60" x2="22" y2="60" stroke="#111" stroke-width="5" stroke-linecap="round"/>
            <line x1="98" y1="60" x2="114" y2="60" stroke="#111" stroke-width="5" stroke-linecap="round"/>
            <line x1="20" y1="20" x2="31" y2="31" stroke="#111" stroke-width="5" stroke-linecap="round"/>
            <line x1="100" y1="20" x2="89" y2="31" stroke="#111" stroke-width="5" stroke-linecap="round"/>
            <line x1="20" y1="100" x2="31" y2="89" stroke="#111" stroke-width="5" stroke-linecap="round"/>
            <line x1="100" y1="100" x2="89" y2="89" stroke="#111" stroke-width="5" stroke-linecap="round"/>`,
  },
]

// ─── UTILS ───────────────────────────────────────────────────
const load = <T,>(key: string, def: T): T => {
  try { const s = localStorage.getItem(key); return s ? { ...(def as object), ...JSON.parse(s) } as T : def }
  catch { return def }
}
const save = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v))
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
const levelCfg = (l: number) => LEVELS[Math.min(l - 1, 4)]
const pairsFor = (l: number) => PAIRS.filter(p => p.minLevel <= l)

// ─── APP ─────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<View>('home')
  const [config, _setConfig] = useState<Config>(() => load('vp_config', DEFAULT_CONFIG))
  const [progress, _setProgress] = useState<Progress>(() => load('vp_progress', DEFAULT_PROGRESS))
  const progressRef = useRef(progress)

  // Session
  const [sessionTime, setSessionTime] = useState(0)
  const [fusions, setFusions] = useState(0)
  const [level, setLevel] = useState(1)
  const [, setMaxLevel] = useState(1)
  const [, setConsSuccess] = useState(0)
  const [pairIdx, setPairIdx] = useState(0)
  const [restActive, setRestActive] = useState(false)
  const [restTime, setRestTime] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const [celebrate, setCelebrate] = useState(false)

  // Refs for stale closure safety
  const fusionsRef = useRef(0)
  const maxLevelRef = useRef(1)
  const levelRef = useRef(1)
  const consSuccessRef = useRef(0)
  const sessionTimeRef = useRef(0)

  const setConfig = useCallback((c: Config) => { _setConfig(c); save('vp_config', c) }, [])
  const setProgress = useCallback((p: Progress) => {
    progressRef.current = p; _setProgress(p); save('vp_progress', p)
  }, [])

  // ── session timer ──
  useEffect(() => {
    if (view !== 'exercise' || restActive) return
    const maxT = config.sessionDuration * 60
    const id = setInterval(() => {
      sessionTimeRef.current += 1
      setSessionTime(t => t + 1)
      if (sessionTimeRef.current >= maxT) {
        clearInterval(id)
        finishSession()
      }
    }, 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, restActive, config.sessionDuration])

  // ── rest timer ──
  function endRestPeriod() {
    setRestActive(false)
    setPairIdx(i => {
      const pairs = pairsFor(levelRef.current)
      return (i + 1) % Math.max(pairs.length, 1)
    })
    setShowHint(false)
    setRestTime(0)
  }

  useEffect(() => {
    if (!restActive) return
    const id = setInterval(() => {
      setRestTime(t => {
        if (t <= 1) {
          clearInterval(id)
          endRestPeriod()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [restActive])

  function startSession() {
    const lvl = progressRef.current.currentLevel
    levelRef.current = lvl
    maxLevelRef.current = lvl
    fusionsRef.current = 0
    consSuccessRef.current = 0
    sessionTimeRef.current = 0
    setLevel(lvl); setMaxLevel(lvl); setFusions(0); setConsSuccess(0)
    setSessionTime(0); setPairIdx(0)
    setRestActive(false); setShowHint(false); setCelebrate(false)
    setView('exercise')
  }

  function handleFusion() {
    if (restActive) return
    fusionsRef.current += 1
    setFusions(fusionsRef.current)
    setCelebrate(true)
    setTimeout(() => setCelebrate(false), 900)
    consSuccessRef.current += 1
    setConsSuccess(consSuccessRef.current)
    if (consSuccessRef.current >= 5 && levelRef.current < 5) {
      levelRef.current += 1
      consSuccessRef.current = 0
      setLevel(levelRef.current)
      setConsSuccess(0)
      if (levelRef.current > maxLevelRef.current) {
        maxLevelRef.current = levelRef.current
        setMaxLevel(maxLevelRef.current)
      }
    }
    setRestActive(true)
    setRestTime(config.restDuration)
  }

  function finishSession() {
    const now = new Date().toISOString()
    const prev = progressRef.current
    const todayStr = now.split('T')[0]
    const lastStr = prev.lastSessionDate?.split('T')[0]
    const yestStr = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const streak = lastStr === todayStr ? prev.streak
      : lastStr === yestStr ? prev.streak + 1 : 1
    const record: SessionRecord = {
      id: Date.now().toString(), date: now,
      duration: sessionTimeRef.current, fusions: fusionsRef.current, maxLevel: maxLevelRef.current
    }
    setProgress({
      currentLevel: levelRef.current, streak,
      lastSessionDate: now,
      sessions: [...prev.sessions, record].slice(-100)
    })
    setView('complete')
  }

  const availablePairs = pairsFor(level)
  const pair = availablePairs[pairIdx % Math.max(availablePairs.length, 1)] ?? PAIRS[0]
  const lv = levelCfg(level)
  const totalT = config.sessionDuration * 60

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes pop { 0%,100%{transform:scale(1)} 50%{transform:scale(1.2)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glow { 0%,100%{filter:drop-shadow(0 0 4px rgba(16,185,129,0))} 50%{filter:drop-shadow(0 0 14px rgba(16,185,129,0.7))} }
        .fade-up { animation: fadeUp 0.3s ease both; }
        .btn:active { transform: scale(0.94); transition: transform 0.08s; }
        .celebrate { animation: glow 0.9s ease; }
      `}</style>

      {view === 'home'     && <HomeView config={config} progress={progress} onStart={startSession} onProgress={() => setView('progress')} onSettings={() => setView('settings')} />}
      {view === 'exercise' && <ExerciseView lv={lv} remaining={Math.max(totalT - sessionTime, 0)} totalT={totalT} sessionTime={sessionTime} fusions={fusions} level={level} pair={pair} restActive={restActive} restTime={restTime} restDuration={config.restDuration} showHint={showHint} celebrate={celebrate} onFusion={handleFusion} onToggleHint={() => setShowHint(h => !h)} onEnd={finishSession} onSkipRest={endRestPeriod} />}
      {view === 'complete' && <CompleteView fusions={fusionsRef.current} duration={sessionTimeRef.current} maxLevel={maxLevelRef.current} streak={progress.streak} onHome={() => setView('home')} onProgress={() => setView('progress')} />}
      {view === 'progress' && <ProgressView progress={progress} onBack={() => setView('home')} />}
      {view === 'settings' && <SettingsView config={config} onSave={setConfig} onBack={() => setView('home')} onReset={() => setProgress(DEFAULT_PROGRESS)} />}
    </div>
  )
}

// ─── HOME ────────────────────────────────────────────────────
function HomeView({ config, progress, onStart, onProgress, onSettings }: {
  config: Config; progress: Progress
  onStart: () => void; onProgress: () => void; onSettings: () => void
}) {
  const weekSessions = progress.sessions.filter(s =>
    new Date(s.date) > new Date(Date.now() - 7 * 86400000)
  ).length
  return (
    <div className="fade-up min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-emerald-50 flex flex-col items-center justify-center p-6 gap-5">
      <div className="text-center mb-1">
        <div className="text-7xl">👁️</div>
        <h1 className="text-4xl font-black text-sky-600 mt-1">VisionPlay</h1>
        <p className="text-sky-400 font-bold text-lg">Terapia Visual</p>
      </div>

      <div className="bg-white rounded-3xl shadow-lg p-6 w-full max-w-sm">
        <p className="text-xl font-black text-gray-700 text-center">
          ¡Hola, <span className="text-sky-500">{config.patientName}</span>! 👋
        </p>
        <div className="flex justify-around mt-5">
          {[
            { v: weekSessions, l: 'Esta semana', c: 'text-emerald-500' },
            { v: progress.streak,   l: 'Días seguidos', c: 'text-amber-500' },
            { v: progress.currentLevel, l: 'Nivel actual', c: 'text-sky-500' },
          ].map(({ v, l, c }) => (
            <div key={l} className="text-center">
              <p className={`text-3xl font-black ${c}`}>{v}</p>
              <p className="text-xs text-gray-400 font-bold mt-0.5">{l}</p>
            </div>
          ))}
        </div>
        {progress.streak > 0 && (
          <p className="text-center text-amber-500 font-bold text-sm mt-4">
            {progress.streak >= 7 ? '🔥 ¡Racha increíble!' : progress.streak >= 3 ? '⚡ ¡Vas muy bien!' : '🌟 ¡Sigue así!'}
          </p>
        )}
      </div>

      <button onClick={onStart}
        className="btn w-full max-w-sm bg-sky-500 text-white font-black text-2xl rounded-3xl py-5 shadow-xl hover:bg-sky-400 transition-all"
        style={{ boxShadow: '0 8px 32px rgba(14,165,233,0.42)' }}>
        ¡Empezar Ejercicio! 👀
      </button>

      <div className="flex gap-3 w-full max-w-sm">
        <button onClick={onProgress}
          className="btn flex-1 bg-white text-sky-600 font-bold rounded-2xl py-4 shadow border border-sky-100 hover:bg-sky-50 transition-all">
          📊 Mi Progreso
        </button>
        <button onClick={onSettings}
          className="btn bg-white text-gray-500 font-bold rounded-2xl py-4 px-5 shadow border border-gray-100 hover:bg-gray-50 transition-all">
          ⚙️
        </button>
      </div>

      <p className="text-xs text-gray-300 text-center max-w-xs font-semibold leading-relaxed">
        Esta app es un complemento a la terapia visual profesional. No sustituye la supervisión médica.
      </p>
    </div>
  )
}

// ─── EXERCISE ────────────────────────────────────────────────
function ExerciseView({ lv, remaining, totalT, sessionTime, fusions, level, pair,
  restActive, restTime, restDuration, showHint, celebrate,
  onFusion, onToggleHint, onEnd, onSkipRest }: {
  lv: { level: number; gap: number; size: number }; remaining: number; totalT: number
  sessionTime: number; fusions: number; level: number; pair: StereoPair
  restActive: boolean; restTime: number; restDuration: number
  showHint: boolean; celebrate: boolean
  onFusion: () => void; onToggleHint: () => void; onEnd: () => void; onSkipRest: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Top bar */}
      <div className="bg-white px-4 py-3 flex items-center gap-3 shadow-sm border-b border-gray-100">
        <button onClick={onEnd} className="btn text-gray-400 text-xl font-black leading-none hover:text-gray-600 w-8">✕</button>
        <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-1000"
            style={{ width: `${Math.min((sessionTime / totalT) * 100, 100)}%` }} />
        </div>
        <span className="text-sky-600 font-black text-lg tabular-nums w-14 text-right">{fmt(remaining)}</span>
      </div>

      {/* Stats row */}
      <div className="px-6 py-2.5 flex justify-between items-center border-b border-gray-100 bg-gray-50/60">
        <div className="text-center">
          <span className="text-2xl font-black text-emerald-500">{fusions}</span>
          <p className="text-xs text-gray-400 font-bold">Fusiones</p>
        </div>
        <div className="text-center">
          <span className="text-base font-black text-sky-500">Nivel {level}</span>
          <p className="text-xs text-gray-400 font-bold">{lv.gap}px gap</p>
        </div>
        <div className="text-center">
          <span className="text-lg font-bold text-gray-600">{pair.name}</span>
        </div>
      </div>

      {/* Main exercise area — ALWAYS white background */}
      <div className="flex-1 flex flex-col items-center justify-center bg-white gap-6 px-4 py-6 relative overflow-hidden">
        {restActive ? (
          <RestScreen restTime={restTime} restDuration={restDuration} hint={pair.hint} onSkip={onSkipRest} />
        ) : (
          <>
            <p className="text-gray-400 font-semibold text-sm text-center max-w-xs leading-relaxed">
              Mira entre las imágenes como si enfocaras algo lejano. Intenta ver una tercera imagen central.
            </p>

            {/* Stereogram pair */}
            <div className="flex items-center justify-center" style={{ gap: `${lv.gap}px` }}>
              {[pair.left, pair.right].map((svgContent, i) => (
                <svg key={i}
                  viewBox="0 0 120 120"
                  width={lv.size} height={lv.size}
                  className={celebrate ? 'celebrate' : ''}
                  style={{
                    border: '3px solid #f3f4f6', borderRadius: '14px',
                    background: 'white', display: 'block',
                    opacity: celebrate ? 0.55 : 1,
                    transition: 'opacity 0.25s',
                  }}
                  dangerouslySetInnerHTML={{ __html: svgContent }}
                />
              ))}
            </div>

            {/* Celebration star */}
            {celebrate && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-8xl" style={{ animation: 'pop 0.9s ease' }}>⭐</span>
              </div>
            )}

            {/* Hint */}
            {showHint && (
              <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl px-5 py-3 text-center max-w-xs fade-up">
                <p className="text-amber-600 font-bold text-sm">💡 Deberías ver:</p>
                <p className="text-amber-800 font-black text-base mt-1">{pair.hint}</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col items-center gap-3 w-full max-w-xs">
              <button onClick={onFusion}
                className="btn w-full text-white font-black text-xl rounded-3xl py-5 shadow-xl hover:opacity-90 transition-all"
                style={{ background: 'linear-gradient(135deg,#38bdf8,#0ea5e9)', boxShadow: '0 8px 28px rgba(14,165,233,0.42)', minHeight: '72px' }}>
                ¡Lo veo! 👀
              </button>
              <button onClick={onToggleHint}
                className="btn text-gray-400 font-bold text-sm hover:text-amber-500 transition-colors py-1">
                {showHint ? '🙈 Ocultar pista' : '💡 Ver pista'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="bg-sky-50 px-6 py-2.5 text-center border-t border-sky-100">
        <p className="text-sky-400 text-xs font-bold">
          Tip: Relaja la vista como si miraras a través de la pantalla 🔭
        </p>
      </div>
    </div>
  )
}

// ─── REST SCREEN ─────────────────────────────────────────────
function RestScreen({ restTime, restDuration, hint, onSkip }: { restTime: number; restDuration: number; hint: string; onSkip: () => void }) {
  const r = 42, circ = 2 * Math.PI * r
  const pct = (restDuration - restTime) / restDuration
  return (
    <div className="fade-up flex flex-col items-center gap-5">
      <span className="text-6xl" style={{ animation: 'pop 1s ease infinite' }}>⭐</span>
      <h2 className="text-2xl font-black text-emerald-500">¡Excelente!</h2>
      <p className="text-gray-400 font-semibold">Relaja tus ojos...</p>
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle cx="50" cy="50" r={r} fill="none" stroke="#10b981" strokeWidth="8"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s linear' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-black text-gray-600">{restTime}</span>
        </div>
      </div>
      <div className="bg-emerald-50 rounded-2xl px-5 py-3 text-center max-w-xs">
        <p className="text-emerald-600 font-bold text-sm">Deberías haber visto:</p>
        <p className="text-emerald-700 font-black text-base mt-1">{hint}</p>
      </div>
      <button
        onClick={onSkip}
        className="btn bg-white border border-emerald-200 text-emerald-600 font-black rounded-2xl px-4 py-2.5 shadow-sm hover:bg-emerald-50 transition-all"
      >
        ⏭️ Saltar descanso (dev)
      </button>
    </div>
  )
}

// ─── COMPLETE ────────────────────────────────────────────────
function CompleteView({ fusions, duration, maxLevel, streak, onHome, onProgress }: {
  fusions: number; duration: number; maxLevel: number; streak: number
  onHome: () => void; onProgress: () => void
}) {
  const stars = fusions >= 15 ? 3 : fusions >= 8 ? 2 : fusions >= 3 ? 1 : 0
  return (
    <div className="fade-up min-h-screen bg-gradient-to-br from-sky-50 to-emerald-50 flex flex-col items-center justify-center p-6 gap-6 text-center">
      <span className="text-7xl" style={{ animation: 'pop 1s ease 2' }}>🎉</span>
      <h1 className="text-3xl font-black text-sky-600">¡Sesión Completada!</h1>
      <div className="flex gap-2 text-5xl">
        {[1, 2, 3].map(i => <span key={i} style={{ opacity: i <= stars ? 1 : 0.2 }}>⭐</span>)}
      </div>
      <div className="bg-white rounded-3xl shadow-lg p-6 w-full max-w-sm">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div><p className="text-3xl font-black text-emerald-500">{fusions}</p><p className="text-xs text-gray-400 font-bold">Fusiones</p></div>
          <div><p className="text-3xl font-black text-sky-500">{fmt(duration)}</p><p className="text-xs text-gray-400 font-bold">Tiempo</p></div>
          <div><p className="text-3xl font-black text-amber-500">{maxLevel}</p><p className="text-xs text-gray-400 font-bold">Nivel máx</p></div>
        </div>
        {streak > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-amber-500 font-black">{streak} día{streak > 1 ? 's' : ''} seguido{streak > 1 ? 's' : ''} 🔥</p>
          </div>
        )}
      </div>
      <p className="text-gray-400 text-sm font-semibold max-w-xs">
        Descansa al menos 15 minutos antes del próximo módulo 👁️
      </p>
      <div className="flex gap-3 w-full max-w-sm">
        <button onClick={onProgress}
          className="btn flex-1 bg-white text-sky-600 font-bold rounded-2xl py-4 shadow border border-sky-100 hover:bg-sky-50 transition-all">
          📊 Progreso
        </button>
        <button onClick={onHome}
          className="btn flex-1 bg-sky-500 text-white font-black rounded-2xl py-4 shadow-lg hover:bg-sky-400 transition-all">
          🏠 Inicio
        </button>
      </div>
    </div>
  )
}

// ─── PROGRESS ────────────────────────────────────────────────
function ProgressView({ progress, onBack }: { progress: Progress; onBack: () => void }) {
  const last14 = [...progress.sessions].slice(-14)
  const maxF = Math.max(...last14.map(s => s.fusions), 1)
  const totalFusions = progress.sessions.reduce((a, s) => a + s.fusions, 0)
  return (
    <div className="fade-up min-h-screen bg-gradient-to-br from-sky-50 to-emerald-50 flex flex-col">
      <div className="bg-white/90 backdrop-blur-sm px-5 py-4 flex items-center gap-3 shadow-sm">
        <button onClick={onBack} className="btn text-sky-500 font-black text-lg">← Volver</button>
        <h2 className="font-black text-xl text-gray-700">Mi Progreso 📊</h2>
      </div>
      <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto pb-8">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { v: progress.sessions.length, l: 'Sesiones totales', c: 'text-sky-500' },
            { v: progress.streak,          l: 'Racha de días',    c: 'text-amber-500' },
            { v: progress.currentLevel,    l: 'Nivel actual',     c: 'text-emerald-500' },
            { v: totalFusions,             l: 'Total fusiones',   c: 'text-violet-500' },
          ].map(({ v, l, c }) => (
            <div key={l} className="bg-white rounded-2xl shadow p-4 text-center">
              <p className={`text-3xl font-black ${c}`}>{v}</p>
              <p className="text-xs text-gray-400 font-bold mt-1">{l}</p>
            </div>
          ))}
        </div>

        {/* Bar chart */}
        <div className="bg-white rounded-3xl shadow p-5">
          <h3 className="font-black text-gray-600 mb-4 text-sm">Fusiones por sesión (últimas 14)</h3>
          {last14.length === 0 ? (
            <div className="h-28 flex items-center justify-center text-gray-300 font-bold text-sm">
              Completa sesiones para ver tu gráfico 📈
            </div>
          ) : (
            <div className="flex items-end gap-1.5 h-28">
              {last14.map(s => (
                <div key={s.id} className="flex-1 flex flex-col items-center gap-1 group">
                  <span className="text-xs text-sky-500 font-black opacity-0 group-hover:opacity-100 transition-opacity">{s.fusions}</span>
                  <div className="w-full rounded-t-lg transition-all"
                    style={{ height: `${Math.max((s.fusions / maxF) * 88, 4)}%`, background: 'linear-gradient(to top, #0ea5e9, #7dd3fc)' }} />
                  <span style={{ fontSize: '9px' }} className="text-gray-300 font-bold">
                    {new Date(s.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* History list */}
        <div className="bg-white rounded-3xl shadow p-5">
          <h3 className="font-black text-gray-600 mb-3 text-sm">Historial de sesiones</h3>
          {progress.sessions.length === 0 ? (
            <p className="text-gray-300 font-bold text-center py-4 text-sm">Sin sesiones aún</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-50 max-h-64 overflow-y-auto">
              {[...progress.sessions].reverse().map(s => (
                <div key={s.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="font-bold text-gray-600 text-sm">
                      {new Date(s.date).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </p>
                    <p className="text-xs text-gray-400">{fmt(s.duration)} · Nivel máx {s.maxLevel}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-emerald-500">{s.fusions}</p>
                    <p className="text-xs text-gray-400">fusiones</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob); a.download = 'visionplay-reporte.json'; a.click()
          }}
          className="btn bg-white border-2 border-dashed border-gray-200 text-gray-500 font-bold rounded-2xl py-3 text-sm hover:border-sky-300 hover:text-sky-500 transition-all">
          📤 Exportar reporte para el profesional
        </button>
      </div>
    </div>
  )
}

// ─── SETTINGS ────────────────────────────────────────────────
function SettingsView({ config, onSave, onBack, onReset }: {
  config: Config; onSave: (c: Config) => void; onBack: () => void; onReset: () => void
}) {
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
      <h2 className="text-2xl font-black text-gray-600">Área del Profesional</h2>
      <div className="bg-white rounded-3xl shadow-lg p-6 w-full max-w-xs flex flex-col gap-4">
        <input type="password" value={pin} maxLength={8}
          onChange={e => { setPin(e.target.value); setPinError(false) }}
          onKeyDown={e => e.key === 'Enter' && tryUnlock()}
          placeholder="PIN"
          className={`text-center text-3xl font-black border-2 rounded-2xl p-3 outline-none tracking-widest transition-all ${pinError ? 'border-red-300 bg-red-50' : 'border-gray-200 focus:border-sky-300'}`} />
        {pinError && <p className="text-red-400 font-bold text-sm text-center">PIN incorrecto</p>}
        <button onClick={tryUnlock}
          className="btn bg-sky-500 text-white font-black rounded-2xl py-3 text-lg hover:bg-sky-400 transition-all">
          Ingresar
        </button>
      </div>
      <button onClick={onBack} className="btn text-gray-400 font-bold hover:text-gray-600">← Volver</button>
    </div>
  )

  return (
    <div className="fade-up min-h-screen bg-gradient-to-br from-sky-50 to-emerald-50 flex flex-col">
      <div className="bg-white/90 backdrop-blur-sm px-5 py-4 flex items-center gap-3 shadow-sm">
        <button onClick={onBack} className="btn text-sky-500 font-black text-lg">← Volver</button>
        <h2 className="font-black text-xl text-gray-700">Configuración ⚙️</h2>
      </div>
      <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto pb-8">

        {/* Patient */}
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-3">
          <h3 className="font-black text-gray-600">👤 Paciente</h3>
          <input value={form.patientName}
            onChange={e => setForm(f => ({ ...f, patientName: e.target.value }))}
            placeholder="Nombre del paciente"
            className="border-2 border-gray-200 rounded-2xl px-4 py-3 font-bold text-gray-700 focus:border-sky-300 outline-none transition-all" />
        </div>

        {/* Session */}
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-4">
          <h3 className="font-black text-gray-600">⏱️ Sesión</h3>
          <div>
            <p className="text-sm font-bold text-gray-400 mb-2">Duración de sesión</p>
            <div className="flex gap-2">
              {[10, 15, 20].map(v => (
                <button key={v} onClick={() => setForm(f => ({ ...f, sessionDuration: v }))}
                  className={`btn flex-1 rounded-2xl py-3 font-black transition-all ${form.sessionDuration === v ? 'bg-sky-500 text-white shadow-md' : 'bg-gray-100 text-gray-500'}`}>
                  {v} min
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-400 mb-2">Descanso entre fusiones</p>
            <div className="flex gap-2 flex-wrap">
              {[10, 15, 20, 25, 30].map(v => (
                <button key={v} onClick={() => setForm(f => ({ ...f, restDuration: v }))}
                  className={`btn rounded-2xl py-2 px-3 font-black text-sm transition-all ${form.restDuration === v ? 'bg-emerald-500 text-white shadow-md' : 'bg-gray-100 text-gray-500'}`}>
                  {v}s
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Level */}
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-3">
          <h3 className="font-black text-gray-600">🎯 Nivel inicial</h3>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(v => (
              <button key={v} onClick={() => setForm(f => ({ ...f, initialLevel: v }))}
                className={`btn flex-1 rounded-2xl py-3 font-black transition-all ${form.initialLevel === v ? 'bg-amber-400 text-white shadow-md' : 'bg-gray-100 text-gray-500'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* PIN */}
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-3">
          <h3 className="font-black text-gray-600">🔒 Seguridad</h3>
          <input type="password" value={form.pin} maxLength={8}
            onChange={e => setForm(f => ({ ...f, pin: e.target.value }))}
            placeholder="Nuevo PIN"
            className="border-2 border-gray-200 rounded-2xl px-4 py-3 font-bold text-gray-700 focus:border-sky-300 outline-none transition-all" />
        </div>

        {/* Danger zone */}
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-3">
          <h3 className="font-black text-red-400">⚠️ Zona de peligro</h3>
          {!confirmReset ? (
            <button onClick={() => setConfirmReset(true)}
              className="btn border-2 border-red-200 text-red-400 font-bold rounded-2xl py-3 hover:bg-red-50 transition-all">
              Resetear todo el progreso
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-red-500 font-bold text-sm text-center">¿Seguro? Se borrará todo el historial.</p>
              <div className="flex gap-3">
                <button onClick={() => { onReset(); setConfirmReset(false) }}
                  className="btn flex-1 bg-red-500 text-white font-black rounded-2xl py-3 transition-all">
                  Sí, resetear
                </button>
                <button onClick={() => setConfirmReset(false)}
                  className="btn flex-1 bg-gray-100 text-gray-600 font-bold rounded-2xl py-3 transition-all">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <button onClick={() => { onSave(form); onBack() }}
          className="btn bg-sky-500 text-white font-black text-lg rounded-3xl py-4 shadow-xl hover:bg-sky-400 transition-all"
          style={{ boxShadow: '0 8px 28px rgba(14,165,233,0.38)' }}>
          💾 Guardar configuración
        </button>
      </div>
    </div>
  )
}