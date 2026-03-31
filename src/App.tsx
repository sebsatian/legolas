import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

// ─── TYPES ───────────────────────────────────────────────────
type View = 'calibration'|'home'|'exercise'|'anaglyph'|'saccadic'|'pursuit'|'gabor'|'hart'|'complete'|'progress'|'settings'|'glasses-info'
type ExerciseMode = 'stereo'|'anaglyph'|'saccadic'|'pursuit'|'gabor'|'hart'

interface SessionRecord {
  id:string; date:string; duration:number; fusions:number; maxLevel:number; mode:ExerciseMode
  hits?:number; misses?:number; avgReactionMs?:number
  avgErrorPct?:number; gaborAcc?:number
}
interface Config {
  patientName:string; sessionDuration:number; restDuration:number
  initialLevel:number; enableHints:boolean; pin:string
  leftEyeContrast:number; rightEyeContrast:number
  screenInches:number; screenCalibrated:boolean
}
interface Progress {
  currentLevel:number; streak:number; lastSessionDate:string|null; sessions:SessionRecord[]
}

const DEFAULT_CONFIG:Config = {
  patientName:'Jugador', sessionDuration:15, restDuration:15,
  initialLevel:1, enableHints:true, pin:'1234',
  leftEyeContrast:1.0, rightEyeContrast:1.0,
  screenInches:10, screenCalibrated:false,
}
const DEFAULT_PROGRESS:Progress = { currentLevel:1, streak:0, lastSessionDate:null, sessions:[] }

// ─── LEVEL CONFIGS (physical cm) ─────────────────────────────
const STEREO_CM    = [{ gap:1.5,size:6.0 },{ gap:2.5,size:5.5 },{ gap:3.5,size:5.0 },{ gap:4.5,size:4.5 },{ gap:5.5,size:4.0 }]
const ANAGLYPH_CM  = [8.0,7.0,6.0,5.0,4.5]
const SACCADIC_LV  = [{ cm:2.0,ms:3000,lbl:'Grande · lento' },{ cm:1.5,ms:2500,lbl:'Medio · normal' },{ cm:1.1,ms:2000,lbl:'Medio · rapido' },{ cm:0.8,ms:1500,lbl:'Pequeño · rapido' },{ cm:0.6,ms:1000,lbl:'Pequeño · muy rapido' }]
const GABOR_LV     = [{ contrast:0.9,noise:0.02,sf:0.05 },{ contrast:0.7,noise:0.07,sf:0.06 },{ contrast:0.5,noise:0.13,sf:0.07 },{ contrast:0.32,noise:0.22,sf:0.08 },{ contrast:0.18,noise:0.33,sf:0.09 }]
const PURSUIT_PATTERNS = [
  { lbl:'Horizontal · lento',  fn:(t:number)=>({ x:50+38*Math.cos(2*Math.PI*t/13), y:50 }) },
  { lbl:'Vertical · lento',    fn:(t:number)=>({ x:50, y:50+35*Math.cos(2*Math.PI*t/13) }) },
  { lbl:'Circular · normal',   fn:(t:number)=>({ x:50+36*Math.cos(2*Math.PI*t/10), y:50+36*Math.sin(2*Math.PI*t/10) }) },
  { lbl:'Circular · rapido',   fn:(t:number)=>({ x:50+36*Math.cos(2*Math.PI*t/7),  y:50+36*Math.sin(2*Math.PI*t/7) }) },
  { lbl:'Lemniscata · rapido', fn:(t:number)=>({ x:50+38*Math.sin(2*Math.PI*t/8),  y:50+24*Math.sin(4*Math.PI*t/8) }) },
]

// ─── STEREO PAIRS ────────────────────────────────────────────
interface StereoPair { id:string; name:string; minLevel:number; left:string; right:string; hint:string }
const PAIRS:StereoPair[] = [
  { id:'circles',name:'Circulos',minLevel:1,hint:'Circulo con dos puntos',
    left:`<circle cx="60" cy="60" r="50" fill="none" stroke="#111" stroke-width="5"/><circle cx="36" cy="60" r="10" fill="#111"/>`,
    right:`<circle cx="60" cy="60" r="50" fill="none" stroke="#111" stroke-width="5"/><circle cx="84" cy="60" r="10" fill="#111"/>` },
  { id:'compass',name:'Brujula',minLevel:1,hint:'Circulo con 8 puntos',
    left:`<circle cx="60" cy="60" r="50" fill="none" stroke="#111" stroke-width="5"/><circle cx="60" cy="16" r="7" fill="#111"/><circle cx="60" cy="104" r="7" fill="#111"/><circle cx="16" cy="60" r="7" fill="#111"/><circle cx="104" cy="60" r="7" fill="#111"/>`,
    right:`<circle cx="60" cy="60" r="50" fill="none" stroke="#111" stroke-width="5"/><circle cx="95" cy="25" r="7" fill="#111"/><circle cx="25" cy="25" r="7" fill="#111"/><circle cx="95" cy="95" r="7" fill="#111"/><circle cx="25" cy="95" r="7" fill="#111"/>` },
  { id:'house',name:'Casa',minLevel:2,hint:'Casa con ventana y puerta',
    left:`<polygon points="60,8 108,50 12,50" fill="none" stroke="#111" stroke-width="5" stroke-linejoin="round"/><rect x="12" y="50" width="96" height="62" fill="none" stroke="#111" stroke-width="5"/><rect x="20" y="64" width="28" height="24" fill="none" stroke="#111" stroke-width="3.5"/><line x1="34" y1="64" x2="34" y2="88" stroke="#111" stroke-width="2"/><line x1="20" y1="76" x2="48" y2="76" stroke="#111" stroke-width="2"/>`,
    right:`<polygon points="60,8 108,50 12,50" fill="none" stroke="#111" stroke-width="5" stroke-linejoin="round"/><rect x="12" y="50" width="96" height="62" fill="none" stroke="#111" stroke-width="5"/><rect x="72" y="74" width="26" height="38" fill="none" stroke="#111" stroke-width="3.5"/><circle cx="91" cy="93" r="3" fill="#111"/>` },
  { id:'cat',name:'Gato',minLevel:2,hint:'Gato con bigotes',
    left:`<ellipse cx="60" cy="68" rx="44" ry="36" fill="none" stroke="#111" stroke-width="5"/><polygon points="24,44 14,16 40,40" fill="none" stroke="#111" stroke-width="4" stroke-linejoin="round"/><polygon points="96,44 106,16 80,40" fill="none" stroke="#111" stroke-width="4" stroke-linejoin="round"/><circle cx="44" cy="64" r="7" fill="#111"/><circle cx="76" cy="64" r="7" fill="#111"/><path d="M52,80 Q60,87 68,80" fill="none" stroke="#111" stroke-width="3.5"/>`,
    right:`<ellipse cx="60" cy="68" rx="44" ry="36" fill="none" stroke="#111" stroke-width="5"/><polygon points="24,44 14,16 40,40" fill="none" stroke="#111" stroke-width="4" stroke-linejoin="round"/><polygon points="96,44 106,16 80,40" fill="none" stroke="#111" stroke-width="4" stroke-linejoin="round"/><circle cx="44" cy="64" r="7" fill="#111"/><circle cx="76" cy="64" r="7" fill="#111"/><path d="M52,80 Q60,87 68,80" fill="none" stroke="#111" stroke-width="3.5"/><line x1="12" y1="70" x2="52" y2="73" stroke="#111" stroke-width="3.5"/><line x1="12" y1="79" x2="52" y2="79" stroke="#111" stroke-width="3.5"/><line x1="68" y1="73" x2="108" y2="70" stroke="#111" stroke-width="3.5"/><line x1="68" y1="79" x2="108" y2="79" stroke="#111" stroke-width="3.5"/>` },
  { id:'fish',name:'Pez',minLevel:3,hint:'Pez con aletas',
    left:`<ellipse cx="50" cy="60" rx="40" ry="26" fill="none" stroke="#111" stroke-width="5"/><path d="M90,60 L112,40 L112,80 Z" fill="none" stroke="#111" stroke-width="4.5" stroke-linejoin="round"/><circle cx="70" cy="53" r="5" fill="#111"/>`,
    right:`<ellipse cx="50" cy="60" rx="40" ry="26" fill="none" stroke="#111" stroke-width="5"/><path d="M90,60 L112,40 L112,80 Z" fill="none" stroke="#111" stroke-width="4.5" stroke-linejoin="round"/><circle cx="70" cy="53" r="5" fill="#111"/><path d="M38,35 Q50,44 56,35 Q50,27 38,35 Z" fill="none" stroke="#111" stroke-width="4"/><path d="M38,85 Q50,76 56,85 Q50,93 38,85 Z" fill="none" stroke="#111" stroke-width="4"/><path d="M12,50 Q22,60 12,70" fill="none" stroke="#111" stroke-width="4"/>` },
  { id:'tree',name:'Arbol',minLevel:3,hint:'Arbol con manzanas',
    left:`<rect x="48" y="74" width="24" height="42" fill="none" stroke="#111" stroke-width="5"/><ellipse cx="60" cy="50" rx="42" ry="36" fill="none" stroke="#111" stroke-width="5"/><line x1="52" y1="74" x2="36" y2="56" stroke="#111" stroke-width="3"/><line x1="68" y1="74" x2="84" y2="56" stroke="#111" stroke-width="3"/>`,
    right:`<rect x="48" y="74" width="24" height="42" fill="none" stroke="#111" stroke-width="5"/><ellipse cx="60" cy="50" rx="42" ry="36" fill="none" stroke="#111" stroke-width="5"/><line x1="52" y1="74" x2="36" y2="56" stroke="#111" stroke-width="3"/><line x1="68" y1="74" x2="84" y2="56" stroke="#111" stroke-width="3"/><circle cx="40" cy="44" r="9" fill="none" stroke="#111" stroke-width="3.5"/><circle cx="65" cy="36" r="9" fill="none" stroke="#111" stroke-width="3.5"/><circle cx="80" cy="54" r="9" fill="none" stroke="#111" stroke-width="3.5"/>` },
  { id:'robot',name:'Robot',minLevel:4,hint:'Robot completo',
    left:`<rect x="26" y="4" width="68" height="50" rx="8" fill="none" stroke="#111" stroke-width="5"/><circle cx="44" cy="26" r="9" fill="none" stroke="#111" stroke-width="4"/><circle cx="76" cy="26" r="9" fill="none" stroke="#111" stroke-width="4"/><rect x="44" y="44" width="32" height="7" rx="3.5" fill="none" stroke="#111" stroke-width="3"/><line x1="60" y1="4" x2="60" y2="0" stroke="#111" stroke-width="5"/><circle cx="60" cy="0" r="4" fill="#111"/>`,
    right:`<rect x="26" y="4" width="68" height="50" rx="8" fill="none" stroke="#111" stroke-width="5"/><circle cx="44" cy="26" r="9" fill="none" stroke="#111" stroke-width="4"/><circle cx="76" cy="26" r="9" fill="none" stroke="#111" stroke-width="4"/><rect x="44" y="44" width="32" height="7" rx="3.5" fill="none" stroke="#111" stroke-width="3"/><line x1="60" y1="4" x2="60" y2="0" stroke="#111" stroke-width="5"/><circle cx="60" cy="0" r="4" fill="#111"/><rect x="18" y="62" width="84" height="48" rx="6" fill="none" stroke="#111" stroke-width="5"/><line x1="6" y1="68" x2="18" y2="86" stroke="#111" stroke-width="5"/><line x1="114" y1="68" x2="102" y2="86" stroke="#111" stroke-width="5"/><rect x="32" y="74" width="20" height="26" rx="4" fill="none" stroke="#111" stroke-width="3.5"/><rect x="68" y="74" width="20" height="26" rx="4" fill="none" stroke="#111" stroke-width="3.5"/>` },
  { id:'sun',name:'Sol',minLevel:4,hint:'Sol con 8 rayos',
    left:`<circle cx="60" cy="60" r="26" fill="none" stroke="#111" stroke-width="5"/><line x1="60" y1="6" x2="60" y2="22" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="60" y1="98" x2="60" y2="114" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="6" y1="60" x2="22" y2="60" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="98" y1="60" x2="114" y2="60" stroke="#111" stroke-width="5" stroke-linecap="round"/>`,
    right:`<circle cx="60" cy="60" r="26" fill="none" stroke="#111" stroke-width="5"/><line x1="60" y1="6" x2="60" y2="22" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="60" y1="98" x2="60" y2="114" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="6" y1="60" x2="22" y2="60" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="98" y1="60" x2="114" y2="60" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="20" y1="20" x2="31" y2="31" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="100" y1="20" x2="89" y2="31" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="20" y1="100" x2="31" y2="89" stroke="#111" stroke-width="5" stroke-linecap="round"/><line x1="100" y1="100" x2="89" y2="89" stroke="#111" stroke-width="5" stroke-linecap="round"/>` },
]

// ─── UTILS ───────────────────────────────────────────────────
const load = <T,>(k:string,def:T):T => { try { const s=localStorage.getItem(k); return s ? {...(def as object),...JSON.parse(s)} as T : def } catch { return def } }
const save  = (k:string,v:unknown) => localStorage.setItem(k,JSON.stringify(v))
const fmt   = (s:number) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`
const pairs = (l:number) => PAIRS.filter(p=>p.minLevel<=l)
const colorize = (svg:string,color:string) => svg.replace(/stroke="#111"/g,`stroke="${color}"`).replace(/fill="#111"/g,`fill="${color}"`)
const randPos  = () => ({ x:12+Math.random()*76, y:18+Math.random()*64 })
const clamp    = (v:number,mn:number,mx:number) => Math.max(mn,Math.min(mx,v))

// ─── APP ─────────────────────────────────────────────────────
export default function App() {
  const [view,setView]         = useState<View>('home')
  const [config,_setConfig]    = useState<Config>(()=>load('vp_config',DEFAULT_CONFIG))
  const [progress,_setProgress]= useState<Progress>(()=>load('vp_progress',DEFAULT_PROGRESS))
  const progressRef = useRef(progress)

  // Session state
  const [sessionTime,setSessionTime] = useState(0)
  const [fusions,setFusions]         = useState(0)
  const [level,setLevel]             = useState(1)
  const [consDisplay,setConsDisplay] = useState(0)
  const [pairIdx,setPairIdx]         = useState(0)
  const [restActive,setRestActive]   = useState(false)
  const [restTime,setRestTime]       = useState(0)
  const [showHint,setShowHint]       = useState(false)
  const [celebrate,setCelebrate]     = useState(false)
  const [missCount,setMissCount]     = useState(0)
  const [contrastMsg,setContrastMsg] = useState<string|null>(null)

  // Refs
  const fusionsRef  = useRef(0); const maxLevelRef    = useRef(1)
  const levelRef    = useRef(1); const consRef         = useRef(0)
  const sessionTimeRef = useRef(0); const activeModeRef = useRef<ExerciseMode>('stereo')
  const hitsRef     = useRef(0); const missRef         = useRef(0)
  const reactionTimesRef = useRef<number[]>([])
  const anaTrialsRef = useRef<boolean[]>([])  // auto-contrast tracking
  const errSumRef    = useRef(0); const errCountRef    = useRef(0) // pursuit
  const gaborHitsRef = useRef(0); const gaborTotalRef  = useRef(0) // gabor

  const setConfig   = useCallback((c:Config) => { _setConfig(c); save('vp_config',c) },[])
  const setProgress = useCallback((p:Progress) => { progressRef.current=p; _setProgress(p); save('vp_progress',p) },[])

  useEffect(() => { if (!config.screenCalibrated) setView('calibration') },[])

  // pxPerCm — real physical calibration
  const pxPerCm = useMemo(()=>{
    const diagPx = Math.sqrt(window.screen.width**2 + window.screen.height**2)
    return Math.round((diagPx / (config.screenInches * 2.54)) * 10) / 10
  },[config.screenInches])

  // Session timer
  useEffect(()=>{
    const active = ['exercise','anaglyph','saccadic','pursuit','gabor','hart']
    if (!active.includes(view) || restActive) return
    const maxT = config.sessionDuration * 60
    const id = setInterval(()=>{
      sessionTimeRef.current += 1; setSessionTime(t=>t+1)
      if (sessionTimeRef.current >= maxT) { clearInterval(id); finishSession() }
    },1000)
    return ()=>clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[view,restActive,config.sessionDuration])

  // Rest timer
  function endRest() {
    setRestActive(false)
    setPairIdx(i=>{ const ps=pairs(levelRef.current); return (i+1)%Math.max(ps.length,1) })
    setShowHint(false); setRestTime(0)
  }
  useEffect(()=>{
    if (!restActive) return
    const id = setInterval(()=>setRestTime(t=>{ if(t<=1){ clearInterval(id); endRest(); return 0 } return t-1 }),1000)
    return ()=>clearInterval(id)
  },[restActive])

  // ── Auto-contrast logic (Anaglyph) ──────────────────────────
  function checkAutoContrast(hit:boolean) {
    anaTrialsRef.current.push(hit)
    if (anaTrialsRef.current.length < 10) return
    const perf = anaTrialsRef.current.filter(Boolean).length / anaTrialsRef.current.length
    const c = {...config}
    let msg = ''
    if (perf > 0.80) {
      // Good performance → increase weaker eye toward 1.0
      const leftIsWeaker = config.leftEyeContrast >= config.rightEyeContrast
      if (leftIsWeaker) { c.leftEyeContrast  = clamp(c.leftEyeContrast  + 0.1, 0.1, 1.0) }
      else              { c.rightEyeContrast = clamp(c.rightEyeContrast + 0.1, 0.1, 1.0) }
      msg = `Rendimiento ${Math.round(perf*100)}% — contraste ojo debil subio`
    } else if (perf < 0.50) {
      // Poor performance → decrease dominant eye (lower contrast side)
      const leftIsDominant = config.leftEyeContrast <= config.rightEyeContrast
      if (leftIsDominant) { c.leftEyeContrast  = clamp(c.leftEyeContrast  - 0.1, 0.1, 1.0) }
      else                { c.rightEyeContrast = clamp(c.rightEyeContrast - 0.1, 0.1, 1.0) }
      msg = `Rendimiento ${Math.round(perf*100)}% — contraste ojo dominante bajo`
    }
    anaTrialsRef.current = []
    if (msg) { setConfig(c); setContrastMsg(msg); setTimeout(()=>setContrastMsg(null), 3000) }
  }

  // ── Staircase 3-up / 1-down ─────────────────────────────────
  function staircaseUp() {
    consRef.current += 1; setConsDisplay(consRef.current)
    if (consRef.current >= 3 && levelRef.current < 5) {
      levelRef.current += 1; consRef.current = 0; setLevel(levelRef.current); setConsDisplay(0)
      if (levelRef.current > maxLevelRef.current) { maxLevelRef.current=levelRef.current }
    }
  }
  function staircaseDown() {
    consRef.current = 0; setConsDisplay(0)
    if (levelRef.current > 1) { levelRef.current -= 1; setLevel(levelRef.current) }
  }

  // ── Fusion (stereo / anaglyph) ───────────────────────────────
  function handleFusion() {
    if (restActive) return
    fusionsRef.current += 1; hitsRef.current += 1
    setFusions(fusionsRef.current)
    setCelebrate(true); setTimeout(()=>setCelebrate(false), 900)
    if (activeModeRef.current === 'anaglyph') checkAutoContrast(true)
    staircaseUp()
    setRestActive(true); setRestTime(config.restDuration)
  }
  function handleNoFusion() {
    if (restActive) return
    missRef.current += 1; setMissCount(missRef.current)
    if (activeModeRef.current === 'anaglyph') checkAutoContrast(false)
    staircaseDown()
    setRestActive(true); setRestTime(Math.round(config.restDuration/2))
  }

  // ── Saccadic ─────────────────────────────────────────────────
  function handleSaccadicHit(rt:number) {
    hitsRef.current += 1; fusionsRef.current += 1
    reactionTimesRef.current.push(rt); setFusions(hitsRef.current)
    setCelebrate(true); setTimeout(()=>setCelebrate(false),400)
    staircaseUp()
  }
  function handleSaccadicMiss() {
    missRef.current += 1; setMissCount(missRef.current)
    staircaseDown()
  }

  // ── Pursuit ──────────────────────────────────────────────────
  function handlePursuitSample(errPct:number) {
    errSumRef.current += errPct; errCountRef.current += 1
    setFusions(Math.round(100 - (errSumRef.current/errCountRef.current) * 1.8)) // show accuracy%
  }

  // ── Gabor ────────────────────────────────────────────────────
  function handleGaborHit() {
    gaborHitsRef.current += 1; gaborTotalRef.current += 1
    fusionsRef.current += 1; setFusions(fusionsRef.current)
    setCelebrate(true); setTimeout(()=>setCelebrate(false),500)
    staircaseUp()
  }
  function handleGaborMiss() {
    gaborTotalRef.current += 1; missRef.current += 1; setMissCount(missRef.current)
    staircaseDown()
  }

  // ── Hart Chart ───────────────────────────────────────────────
  function handleHartHit(rt:number) {
    hitsRef.current += 1; fusionsRef.current += 1
    reactionTimesRef.current.push(rt); setFusions(fusionsRef.current)
    setCelebrate(true); setTimeout(()=>setCelebrate(false),250)
  }
  function handleHartMiss() {
    missRef.current += 1; setMissCount(missRef.current)
  }

  function startSession(mode:ExerciseMode) {
    activeModeRef.current = mode
    const lvl = progressRef.current.currentLevel
    levelRef.current=lvl; maxLevelRef.current=lvl; consRef.current=0
    fusionsRef.current=0; hitsRef.current=0; missRef.current=0
    reactionTimesRef.current=[]; anaTrialsRef.current=[]; errSumRef.current=0; errCountRef.current=0
    gaborHitsRef.current=0; gaborTotalRef.current=0; sessionTimeRef.current=0
    setLevel(lvl); setFusions(0); setMissCount(0); setConsDisplay(0)
    setSessionTime(0); setPairIdx(0); setRestActive(false); setShowHint(false); setCelebrate(false); setContrastMsg(null)
    const viewMap:Record<ExerciseMode,View> = { stereo:'exercise',anaglyph:'anaglyph',saccadic:'saccadic',pursuit:'pursuit',gabor:'gabor',hart:'hart' }
    setView(viewMap[mode])
  }

  function finishSession() {
    const now = new Date().toISOString()
    const prev = progressRef.current
    const todayStr=now.split('T')[0], lastStr=prev.lastSessionDate?.split('T')[0]
    const yestStr=new Date(Date.now()-86400000).toISOString().split('T')[0]
    const streak = lastStr===todayStr ? prev.streak : lastStr===yestStr ? prev.streak+1 : 1
    const rts = reactionTimesRef.current
    const record:SessionRecord = {
      id:Date.now().toString(), date:now, mode:activeModeRef.current,
      duration:sessionTimeRef.current, fusions:fusionsRef.current, maxLevel:maxLevelRef.current,
      hits:hitsRef.current, misses:missRef.current,
      avgReactionMs:rts.length ? Math.round(rts.reduce((a,b)=>a+b,0)/rts.length) : undefined,
      avgErrorPct: errCountRef.current ? Math.round(errSumRef.current/errCountRef.current) : undefined,
      gaborAcc: gaborTotalRef.current ? Math.round(gaborHitsRef.current/gaborTotalRef.current*100) : undefined,
    }
    setProgress({ currentLevel:levelRef.current, streak, lastSessionDate:now, sessions:[...prev.sessions,record].slice(-100) })
    setView('complete')
  }

  const avPairs = pairs(level)
  const curPair = avPairs[pairIdx % Math.max(avPairs.length,1)] ?? PAIRS[0]
  const cmLv    = STEREO_CM[Math.min(level-1,4)]
  const stereoLv = { gap:Math.round(cmLv.gap*pxPerCm), size:Math.round(cmLv.size*pxPerCm) }
  const totalT   = config.sessionDuration * 60

  const sharedEx = { remaining:Math.max(totalT-sessionTime,0), totalT, sessionTime, fusions, level }

  return (
    <div style={{ fontFamily:"'Nunito',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        * { box-sizing:border-box; }
        @keyframes pop     { 0%,100%{transform:scale(1)} 50%{transform:scale(1.18)} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        @keyframes pulse   { 0%,100%{transform:scale(1)} 50%{transform:scale(1.07)} }
        @keyframes glow    { 0%,100%{filter:drop-shadow(0 0 4px rgba(16,185,129,0))} 50%{filter:drop-shadow(0 0 16px rgba(16,185,129,.75))} }
        @keyframes glowRed { 0%,100%{filter:drop-shadow(0 0 4px rgba(239,68,68,0))} 50%{filter:drop-shadow(0 0 16px rgba(239,68,68,.65))} }
        @keyframes glowOra { 0%,100%{filter:drop-shadow(0 0 4px rgba(249,115,22,0))} 50%{filter:drop-shadow(0 0 20px rgba(249,115,22,.8))} }
        .fade-up { animation:fadeUp 0.3s ease both; }
        .btn:active { transform:scale(0.93); transition:transform 0.08s; }
        .glowG { animation:glow 0.9s ease; }
        .glowR { animation:glowRed 0.9s ease; }
        .glowO { animation:glowOra 0.4s ease; }
        input[type=range] { -webkit-appearance:none; height:8px; border-radius:4px; outline:none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:22px; height:22px; border-radius:50%; background:#0ea5e9; cursor:pointer; }
      `}</style>

      {view==='calibration'  && <CalibrationView config={config} onDone={c=>{ setConfig(c); setView('home') }} />}
      {view==='home'         && <HomeView config={config} progress={progress} onStart={startSession} onProgress={()=>setView('progress')} onSettings={()=>setView('settings')} onGlassesInfo={()=>setView('glasses-info')} />}
      {view==='glasses-info' && <GlassesInfoView pair={PAIRS[0]} onBack={()=>setView('home')} onStart={()=>startSession('anaglyph')} />}
      {view==='exercise'     && <StereoView {...sharedEx} stereoLv={stereoLv} pair={curPair} restActive={restActive} restTime={restTime} restDuration={config.restDuration} showHint={showHint} celebrate={celebrate} consDisplay={consDisplay} onFusion={handleFusion} onNoFusion={handleNoFusion} onToggleHint={()=>setShowHint(h=>!h)} onEnd={finishSession} onSkipRest={endRest} />}
      {view==='anaglyph'     && <AnaglyphView {...sharedEx} config={config} pair={curPair} restActive={restActive} restTime={restTime} restDuration={config.restDuration} showHint={showHint} celebrate={celebrate} consDisplay={consDisplay} contrastMsg={contrastMsg} onFusion={handleFusion} onNoFusion={handleNoFusion} onToggleHint={()=>setShowHint(h=>!h)} onEnd={finishSession} onSkipRest={endRest} />}
      {view==='saccadic'     && <SaccadicView {...sharedEx} config={config} pxPerCm={pxPerCm} misses={missCount} celebrate={celebrate} onHit={handleSaccadicHit} onMiss={handleSaccadicMiss} onEnd={finishSession} />}
      {view==='pursuit'      && <PursuitView  {...sharedEx} pxPerCm={pxPerCm} celebrate={celebrate} onSample={handlePursuitSample} onEnd={finishSession} />}
      {view==='gabor'        && <GaborView    {...sharedEx} pxPerCm={pxPerCm} misses={missCount} consDisplay={consDisplay} celebrate={celebrate} onHit={handleGaborHit} onMiss={handleGaborMiss} onEnd={finishSession} />}
      {view==='hart'         && <HartView     {...sharedEx} pxPerCm={pxPerCm} misses={missCount} celebrate={celebrate} onHit={handleHartHit} onMiss={handleHartMiss} onEnd={finishSession} />}
      {view==='complete'     && <CompleteView sessions={progress.sessions} streak={progress.streak} mode={activeModeRef.current} onHome={()=>setView('home')} onProgress={()=>setView('progress')} />}
      {view==='progress'     && <ProgressView progress={progress} onBack={()=>setView('home')} />}
      {view==='settings'     && <SettingsView config={config} onSave={setConfig} onBack={()=>setView('home')} onReset={()=>setProgress(DEFAULT_PROGRESS)} onCalibrate={()=>setView('calibration')} />}
    </div>
  )
}

// ─── CALIBRATION ─────────────────────────────────────────────
function CalibrationView({ config, onDone }:{ config:Config; onDone:(c:Config)=>void }) {
  const [inches,setInches] = useState(config.screenInches)
  const [step,setStep]     = useState<'screen'|'color'>('screen')
  return (
    <div className="fade-up min-h-screen flex flex-col bg-gradient-to-br from-violet-50 to-sky-50">
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5">
        <div className="text-6xl">🔧</div>
        <h1 className="text-3xl font-black text-violet-600">Calibracion inicial</h1>
        {step==='screen' ? (
          <>
            <p className="text-gray-500 font-semibold text-sm text-center max-w-xs">Selecciona el tamano de tu pantalla para ejercicios con medidas fisicas correctas.</p>
            <div className="bg-white rounded-3xl shadow p-5 w-full max-w-sm flex flex-col gap-4">
              <h3 className="font-black text-gray-600 text-sm">Pantalla</h3>
              <div className="flex flex-wrap gap-2">
                {[5,6,7,8,10,11,13,15].map(s=>(
                  <button key={s} onClick={()=>setInches(s)} className={`btn flex-1 min-w-[56px] rounded-2xl py-3 font-black text-sm transition-all ${inches===s?'bg-violet-500 text-white shadow-md':'bg-gray-100 text-gray-500'}`}>{s}"</button>
                ))}
              </div>
              <p className="text-xs text-gray-400 font-bold text-center">{inches<=7?'Telefono':inches<=11?'Tablet — recomendado':'Notebook / PC'}</p>
              {inches<7&&<p className="text-amber-500 font-bold text-xs text-center">Recomendado: tablet de 7" o mas para ejercicios confortables.</p>}
            </div>
            <div className="bg-white rounded-3xl shadow p-5 w-full max-w-sm flex flex-col gap-3">
              <h3 className="font-black text-gray-600 text-sm">Test de colores anaglifo</h3>
              <div className="flex gap-3">
                <div className="flex-1 rounded-2xl flex items-center justify-center py-6 font-black text-white text-lg" style={{ background:'#ef4444' }}>ROJO</div>
                <div className="flex-1 rounded-2xl flex items-center justify-center py-6 font-black text-white text-lg" style={{ background:'#06b6d4' }}>CYAN</div>
              </div>
              <p className="text-xs text-gray-400 font-bold text-center">Con lentes: ojo rojo ve solo ROJO · ojo cyan ve solo CYAN</p>
            </div>
            <button onClick={()=>setStep('color')} className="btn w-full max-w-sm bg-violet-500 text-white font-black text-lg rounded-3xl py-4 shadow-xl hover:bg-violet-400 transition-all">Siguiente</button>
          </>
        ) : (
          <>
            <div className="bg-white rounded-3xl shadow p-5 w-full max-w-sm flex flex-col gap-3">
              <h3 className="font-black text-gray-600 text-sm">Checklist de preparacion</h3>
              {['Brillo de pantalla al maximo','Habitacion con luz moderada','Sentado comodo, pantalla a 40cm','Lentes habituales puestos antes de los anaglifos'].map((t,i)=>(
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0"><span className="text-emerald-600 text-xs font-black">{i+1}</span></div>
                  <p className="text-gray-500 font-semibold text-sm">{t}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-3 w-full max-w-sm">
              <button onClick={()=>setStep('screen')} className="btn flex-1 bg-white text-gray-500 font-bold rounded-2xl py-3 shadow border border-gray-100">Atras</button>
              <button onClick={()=>onDone({...config,screenInches:inches,screenCalibrated:true})} className="btn flex-1 bg-violet-500 text-white font-black rounded-2xl py-3 shadow-xl hover:bg-violet-400 transition-all">Listo!</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── HOME ────────────────────────────────────────────────────
function HomeView({ config, progress, onStart, onProgress, onSettings, onGlassesInfo }:{ config:Config; progress:Progress; onStart:(m:ExerciseMode)=>void; onProgress:()=>void; onSettings:()=>void; onGlassesInfo:()=>void }) {
  const weekN = progress.sessions.filter(s=>new Date(s.date)>new Date(Date.now()-7*86400000)).length
  const modules:[ExerciseMode,string,string,string,string][] = [
    ['stereo',  '👁️','Mod B — Vergencia',     'Estereogramas · sin lentes',         '#0ea5e9'],
    ['anaglyph','🕶️','Mod B+D — Anaglifo',    'Convergencia + ambliopia · lentes',  'linear-gradient(135deg,#ef4444,#06b6d4)'],
    ['saccadic','⚡','Mod A — Sacadicos',      'Oculomotricidad · reaccion rapida',  'linear-gradient(135deg,#f97316,#eab308)'],
    ['pursuit', '🌀','Mod A — Seguimiento',    'Smooth pursuit · seguir objeto',     'linear-gradient(135deg,#8b5cf6,#06b6d4)'],
    ['gabor',   '🔬','Mod D — Gabor',          'Aprendizaje perceptual · orientacion','linear-gradient(135deg,#10b981,#0ea5e9)'],
    ['hart',    '🔤','Mod A — Hart Chart',     'Lectura secuencial · cerca/lejos',   'linear-gradient(135deg,#ec4899,#f97316)'],
  ]
  return (
    <div className="fade-up min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-emerald-50 flex flex-col items-center justify-center p-6 gap-4">
      <div className="text-center">
        <div className="text-6xl">👁️</div>
        <h1 className="text-3xl font-black text-sky-600 mt-1">VisionPlay</h1>
        <p className="text-sky-400 font-bold text-sm">Terapia Visual · Staircase 3/1</p>
      </div>
      <div className="bg-white rounded-3xl shadow-lg p-5 w-full max-w-sm">
        <p className="text-lg font-black text-gray-700 text-center">Hola, <span className="text-sky-500">{config.patientName}</span>!</p>
        <div className="flex justify-around mt-4">
          {[{v:weekN,l:'Esta semana',c:'text-emerald-500'},{v:progress.streak,l:'Dias seguidos',c:'text-amber-500'},{v:progress.currentLevel,l:'Nivel actual',c:'text-sky-500'}].map(({v,l,c})=>(
            <div key={l} className="text-center"><p className={`text-3xl font-black ${c}`}>{v}</p><p className="text-xs text-gray-400 font-bold mt-0.5">{l}</p></div>
          ))}
        </div>
      </div>
      <div className="w-full max-w-sm flex flex-col gap-2">
        <p className="text-xs text-gray-400 font-bold text-center uppercase tracking-wider">Modulos de ejercicio</p>
        {modules.map(([mode,emoji,title,sub,bg])=>(
          <button key={mode} onClick={()=>mode==='anaglyph'?onGlassesInfo():onStart(mode)}
            className="btn w-full text-white font-black rounded-2xl py-3 shadow hover:opacity-90 transition-all flex items-center gap-3 px-4"
            style={{ background:bg, boxShadow:'0 4px 16px rgba(0,0,0,0.15)' }}>
            <span className="text-2xl">{emoji}</span>
            <div className="text-left"><p className="text-sm leading-tight">{title}</p><p className="text-xs font-semibold opacity-80">{sub}</p></div>
          </button>
        ))}
      </div>
      <div className="flex gap-3 w-full max-w-sm">
        <button onClick={onProgress} className="btn flex-1 bg-white text-sky-600 font-bold rounded-2xl py-3 shadow border border-sky-100 hover:bg-sky-50 transition-all">Mi Progreso</button>
        <button onClick={onSettings} className="btn bg-white text-gray-500 font-bold rounded-2xl py-3 px-5 shadow border border-gray-100 hover:bg-gray-50 transition-all">⚙️</button>
      </div>
      <p className="text-xs text-gray-300 text-center max-w-xs font-semibold">Complemento a terapia visual profesional. No sustituye supervision medica.</p>
    </div>
  )
}

// ─── GLASSES INFO ─────────────────────────────────────────────
function GlassesInfoView({ pair, onBack, onStart }:{ pair:StereoPair; onBack:()=>void; onStart:()=>void }) {
  return (
    <div className="fade-up min-h-screen flex flex-col" style={{ background:'linear-gradient(135deg,#fff1f0,#ecfeff)' }}>
      <div className="px-5 py-4 flex items-center gap-3">
        <button onClick={onBack} className="btn font-black text-lg text-red-500">volver</button>
        <h2 className="font-black text-xl text-gray-700">Como hacer los lentes</h2>
      </div>
      <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto pb-8">
        <div className="bg-white rounded-3xl shadow p-5">
          <h3 className="font-black text-gray-700 mb-2">Como funciona</h3>
          <p className="text-gray-500 font-semibold text-sm leading-relaxed">Filtro <span className="text-red-500 font-black">rojo</span> en ojo izquierdo + <span className="text-cyan-500 font-black">cyan</span> en ojo derecho. Cada ojo ve solo su capa de color y el cerebro las fusiona. El contraste se ajusta automaticamente segun tu rendimiento.</p>
        </div>
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-3">
          {[['🔴','Celofen rojo','Libreria'],['🔵','Celofen cyan','Libreria'],['📦','Carton','Caja de cereal'],['✂️','Tijeras y cinta','Lo que tengas']].map(([e,n,w])=>(
            <div key={n} className="flex items-start gap-3"><span className="text-2xl">{e}</span><div><p className="font-black text-gray-700 text-sm">{n}</p><p className="text-xs text-gray-400 font-semibold">{w}</p></div></div>
          ))}
        </div>
        <div className="bg-white rounded-3xl shadow p-5">
          <h3 className="font-black text-gray-700 mb-3 text-sm">Preview (sin lentes)</h3>
          <div className="flex justify-center">
            <svg viewBox="0 0 120 120" width={140} height={140} style={{ background:'white', borderRadius:12, border:'2px solid #f3f4f6' }}>
              <g dangerouslySetInnerHTML={{ __html:colorize(pair.left,'#ef4444') }} />
              <g dangerouslySetInnerHTML={{ __html:colorize(pair.right,'#06b6d4') }} />
            </svg>
          </div>
          <p className="text-xs text-gray-400 font-bold text-center mt-2">Con lentes: cada ojo ve solo su color</p>
        </div>
        <button onClick={onStart} className="btn text-white font-black text-xl rounded-3xl py-5 shadow-xl hover:opacity-90 transition-all" style={{ background:'linear-gradient(135deg,#ef4444,#06b6d4)' }}>Empezar Anaglifo</button>
      </div>
    </div>
  )
}

// ─── SHARED UI ────────────────────────────────────────────────
function TopBar({ color, remaining, sessionTime, totalT, onEnd, bg }:{ color:string; remaining:number; sessionTime:number; totalT:number; onEnd:()=>void; bg:string }) {
  return (
    <div className="px-4 py-3 flex items-center gap-3 shadow-sm border-b border-gray-100 bg-white">
      <button onClick={onEnd} className="btn text-gray-400 text-xl font-black w-8 hover:text-gray-600">X</button>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000" style={{ width:`${Math.min((sessionTime/totalT)*100,100)}%`, background:bg }} />
      </div>
      <span className="font-black text-lg tabular-nums w-14 text-right" style={{ color }}>{fmt(remaining)}</span>
    </div>
  )
}
function StatsRow({ left, center, right }:{ left:React.ReactNode; center:React.ReactNode; right:React.ReactNode }) {
  return (
    <div className="px-6 py-2 flex justify-between items-center border-b border-gray-100 bg-gray-50/60">
      <div className="text-center">{left}</div>
      <div className="text-center">{center}</div>
      <div className="text-center">{right}</div>
    </div>
  )
}
function CelebrateStar() {
  return <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-8xl" style={{ animation:'pop 0.9s ease' }}>⭐</span></div>
}
function HintBox({ hint }:{ hint:string }) {
  return <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl px-5 py-3 text-center max-w-xs fade-up"><p className="text-amber-600 font-bold text-sm">Deberias ver:</p><p className="text-amber-800 font-black text-base mt-1">{hint}</p></div>
}
function StaircasePips({ cons, total=3 }:{ cons:number; total?:number }) {
  return (
    <div className="flex gap-1 justify-center">
      {Array.from({length:total},(_,i)=>(
        <div key={i} className="w-2 h-2 rounded-full transition-all" style={{ background: i<cons ? '#10b981' : '#e5e7eb' }} />
      ))}
    </div>
  )
}
function RestScreen({ restTime, restDuration, hint, onSkip, isAnaglyph }:{ restTime:number; restDuration:number; hint:string; onSkip:()=>void; isAnaglyph?:boolean }) {
  const r=42, circ=2*Math.PI*r, pct=(restDuration-restTime)/restDuration, color=isAnaglyph?'#ef4444':'#10b981'
  return (
    <div className="fade-up flex flex-col items-center gap-4">
      <span className="text-6xl" style={{ animation:'pop 1s ease infinite' }}>⭐</span>
      <h2 className="text-2xl font-black" style={{ color }}>Excelente!</h2>
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform:'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8"/>
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8" strokeDasharray={circ} strokeDashoffset={circ*(1-pct)} strokeLinecap="round" style={{ transition:'stroke-dashoffset 1s linear' }}/>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center"><span className="text-3xl font-black text-gray-600">{restTime}</span></div>
      </div>
      <div className={`rounded-2xl px-4 py-3 text-center max-w-xs ${isAnaglyph?'bg-red-50':'bg-emerald-50'}`}>
        <p className={`font-bold text-sm ${isAnaglyph?'text-red-500':'text-emerald-600'}`}>Deberias haber visto:</p>
        <p className={`font-black text-sm mt-1 ${isAnaglyph?'text-red-700':'text-emerald-700'}`}>{hint}</p>
      </div>
      <button onClick={onSkip} className="btn bg-white border border-gray-200 text-gray-500 font-bold rounded-2xl px-4 py-2 text-xs hover:bg-gray-50 transition-all">Saltar descanso (dev)</button>
    </div>
  )
}

// ─── STEREO EXERCISE ─────────────────────────────────────────
interface ExShared { remaining:number; totalT:number; sessionTime:number; fusions:number; level:number }
function StereoView({ remaining,totalT,sessionTime,fusions,level,stereoLv,pair,restActive,restTime,restDuration,showHint,celebrate,consDisplay,onFusion,onNoFusion,onToggleHint,onEnd,onSkipRest }:ExShared&{ stereoLv:{gap:number;size:number}; pair:StereoPair; restActive:boolean; restTime:number; restDuration:number; showHint:boolean; celebrate:boolean; consDisplay:number; onFusion:()=>void; onNoFusion:()=>void; onToggleHint:()=>void; onEnd:()=>void; onSkipRest:()=>void }) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <TopBar color="#0ea5e9" remaining={remaining} sessionTime={sessionTime} totalT={totalT} onEnd={onEnd} bg="linear-gradient(90deg,#38bdf8,#10b981)" />
      <StatsRow left={<><span className="text-2xl font-black text-emerald-500">{fusions}</span><p className="text-xs text-gray-400 font-bold">Fusiones</p></>} center={<><span className="text-sm font-black text-sky-500">Nivel {level}</span><StaircasePips cons={consDisplay}/></>} right={<span className="text-sm font-bold text-gray-500">{pair.name}</span>} />
      <div className="flex-1 flex flex-col items-center justify-center bg-white gap-4 px-4 py-4 relative overflow-hidden">
        {restActive ? <RestScreen restTime={restTime} restDuration={restDuration} hint={pair.hint} onSkip={onSkipRest}/> : (
          <>
            <p className="text-gray-400 font-semibold text-xs text-center max-w-xs">Mira entre las imagenes como si enfocaras algo lejano. Intenta ver una tercera imagen central.</p>
            <div className="flex items-center justify-center" style={{ gap:`${stereoLv.gap}px` }}>
              {[pair.left,pair.right].map((svg,i)=>(
                <svg key={i} viewBox="0 0 120 120" width={stereoLv.size} height={stereoLv.size} className={celebrate?'glowG':''} style={{ border:'3px solid #f3f4f6',borderRadius:14,background:'white',display:'block',opacity:celebrate?0.5:1,transition:'opacity 0.25s' }} dangerouslySetInnerHTML={{ __html:svg }}/>
              ))}
            </div>
            {celebrate && <CelebrateStar/>}
            {showHint && <HintBox hint={pair.hint}/>}
            <div className="flex gap-3 w-full max-w-xs">
              <button onClick={onFusion} className="btn flex-1 text-white font-black text-lg rounded-3xl py-4 shadow-xl hover:opacity-90 transition-all" style={{ background:'linear-gradient(135deg,#38bdf8,#0ea5e9)',boxShadow:'0 6px 24px rgba(14,165,233,0.42)',minHeight:64 }}>Lo veo!</button>
              <button onClick={onNoFusion} className="btn flex-1 bg-gray-100 text-gray-500 font-bold rounded-3xl py-4 hover:bg-gray-200 transition-all" style={{ minHeight:64 }}>No puedo</button>
            </div>
            <button onClick={onToggleHint} className="btn text-gray-400 font-bold text-xs hover:text-amber-500 transition-colors">{showHint?'Ocultar pista':'Ver pista'}</button>
          </>
        )}
      </div>
      <div className="bg-sky-50 px-6 py-2 text-center border-t border-sky-100"><p className="text-sky-400 text-xs font-bold">Staircase 3/1 · 3 aciertos seguidos = sube nivel · 1 fallo = baja nivel</p></div>
    </div>
  )
}

// ─── ANAGLYPH EXERCISE ───────────────────────────────────────
function AnaglyphView({ remaining,totalT,sessionTime,fusions,level,config,pair,restActive,restTime,restDuration,showHint,celebrate,consDisplay,contrastMsg,onFusion,onNoFusion,onToggleHint,onEnd,onSkipRest }:ExShared&{ config:Config; pair:StereoPair; restActive:boolean; restTime:number; restDuration:number; showHint:boolean; celebrate:boolean; consDisplay:number; contrastMsg:string|null; onFusion:()=>void; onNoFusion:()=>void; onToggleHint:()=>void; onEnd:()=>void; onSkipRest:()=>void }) {
  const size = Math.round(ANAGLYPH_CM[Math.min(level-1,4)] * (Math.sqrt(window.screen.width**2+window.screen.height**2)/(config.screenInches*2.54)))
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="px-4 py-3 flex items-center gap-3 shadow-sm border-b border-gray-100" style={{ background:'linear-gradient(90deg,#fff1f0,#ecfeff)' }}>
        <button onClick={onEnd} className="btn text-gray-400 text-xl font-black w-8">X</button>
        <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-1000" style={{ width:`${Math.min((sessionTime/totalT)*100,100)}%`, background:'linear-gradient(90deg,#ef4444,#06b6d4)' }}/>
        </div>
        <span className="font-black text-lg tabular-nums w-14 text-right" style={{ color:'#ef4444' }}>{fmt(remaining)}</span>
      </div>
      <StatsRow left={<><span className="text-2xl font-black text-emerald-500">{fusions}</span><p className="text-xs text-gray-400 font-bold">Fusiones</p></>} center={<><div className="flex gap-1"><span className="text-xs font-black text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">R {Math.round(config.leftEyeContrast*100)}%</span><span className="text-xs font-black text-cyan-500 bg-cyan-50 px-1.5 py-0.5 rounded-full">C {Math.round(config.rightEyeContrast*100)}%</span></div><StaircasePips cons={consDisplay}/></>} right={<span className="text-sm font-bold text-gray-500">Nivel {level}</span>} />
      {contrastMsg && <div className="mx-4 mt-2 bg-violet-50 border border-violet-200 rounded-xl px-4 py-2 text-xs font-bold text-violet-600 text-center fade-up">{contrastMsg}</div>}
      <div className="flex-1 flex flex-col items-center justify-center bg-white gap-4 px-4 py-4 relative overflow-hidden">
        {restActive ? <RestScreen restTime={restTime} restDuration={restDuration} hint={pair.hint} onSkip={onSkipRest} isAnaglyph/> : (
          <>
            <p className="text-gray-400 font-semibold text-xs text-center max-w-xs">Ponte los lentes rojo-cyan. Con los lentes puestos deberia verse la imagen completa.</p>
            <div className="relative">
              <svg viewBox="0 0 120 120" width={size} height={size} className={celebrate?'glowR':''} style={{ border:'3px solid #f3f4f6',borderRadius:14,background:'white',display:'block',opacity:celebrate?0.5:1,transition:'opacity 0.25s' }}>
                <g opacity={config.leftEyeContrast}  dangerouslySetInnerHTML={{ __html:colorize(pair.left,'#ef4444') }}/>
                <g opacity={config.rightEyeContrast} dangerouslySetInnerHTML={{ __html:colorize(pair.right,'#06b6d4') }}/>
              </svg>
              {celebrate && <CelebrateStar/>}
            </div>
            {showHint && <HintBox hint={pair.hint}/>}
            <div className="flex gap-3 w-full max-w-xs">
              <button onClick={onFusion} className="btn flex-1 text-white font-black text-lg rounded-3xl py-4 shadow-xl hover:opacity-90 transition-all" style={{ background:'linear-gradient(135deg,#ef4444,#06b6d4)',minHeight:64 }}>Lo veo!</button>
              <button onClick={onNoFusion} className="btn flex-1 bg-gray-100 text-gray-500 font-bold rounded-3xl py-4 hover:bg-gray-200 transition-all" style={{ minHeight:64 }}>No puedo</button>
            </div>
            <button onClick={onToggleHint} className="btn text-gray-400 font-bold text-xs hover:text-amber-500 transition-colors">{showHint?'Ocultar pista':'Ver pista'}</button>
          </>
        )}
      </div>
      <div className="px-6 py-2 text-center border-t" style={{ background:'linear-gradient(90deg,#fff1f0,#ecfeff)' }}>
        <p className="text-xs font-bold text-gray-400">Contraste auto-ajusta cada 10 ensayos segun rendimiento</p>
      </div>
    </div>
  )
}

// ─── SACCADIC ────────────────────────────────────────────────
function SaccadicView({ remaining,totalT,sessionTime,fusions,level,config,pxPerCm,misses,celebrate,onHit,onMiss,onEnd }:ExShared&{ config:Config; pxPerCm:number; misses:number; celebrate:boolean; onHit:(rt:number)=>void; onMiss:()=>void; onEnd:()=>void }) {
  const lv = SACCADIC_LV[Math.min(level-1,4)]
  const targetPx = Math.max(Math.round(lv.cm * pxPerCm), 18)
  const [pos,setPos]       = useState(randPos())
  const [visible,setVisible] = useState(false)
  const [flash,setFlash]   = useState(false)
  const t0Ref = useRef(0), tidRef = useRef<ReturnType<typeof setTimeout>|null>(null)
  const accuracy = fusions+misses>0 ? Math.round(fusions/(fusions+misses)*100) : 100

  function next() { const p=randPos(); setPos(p); setVisible(true); t0Ref.current=Date.now(); tidRef.current=setTimeout(()=>{ setVisible(false); onMiss(); setTimeout(next,500) },lv.ms) }
  useEffect(()=>{ const id=setTimeout(next,600); return ()=>{ clearTimeout(id); if(tidRef.current) clearTimeout(tidRef.current) } },[])

  function hit() {
    if (!visible) return
    if (tidRef.current) clearTimeout(tidRef.current)
    setVisible(false); setFlash(true); setTimeout(()=>setFlash(false),280)
    onHit(Date.now()-t0Ref.current)
    setTimeout(next,400)
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <TopBar color="#f97316" remaining={remaining} sessionTime={sessionTime} totalT={totalT} onEnd={onEnd} bg="linear-gradient(90deg,#f97316,#eab308)" />
      <StatsRow left={<><span className="text-2xl font-black text-emerald-500">{fusions}</span><p className="text-xs text-gray-400 font-bold">Aciertos</p></>} center={<><span className="text-xl font-black text-orange-500">{accuracy}%</span><p className="text-xs text-gray-400 font-bold">Precision</p></>} right={<><span className="text-2xl font-black text-red-400">{misses}</span><p className="text-xs text-gray-400 font-bold">Fallos</p></>} />
      <div className="flex-1 relative bg-white overflow-hidden select-none" style={{ background:flash?'rgba(249,115,22,0.06)':'white',transition:'background 0.15s' }}>
        <div className="absolute inset-0 pointer-events-none" style={{ opacity:0.04 }}>
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600"/><div className="absolute top-1/2 left-0 right-0 h-px bg-gray-600"/>
        </div>
        {visible && <button onClick={hit} className="absolute flex items-center justify-center rounded-full font-black text-white" style={{ left:`${pos.x}%`,top:`${pos.y}%`,width:targetPx,height:targetPx,transform:'translate(-50%,-50%)',background:'linear-gradient(135deg,#f97316,#eab308)',boxShadow:'0 4px 20px rgba(249,115,22,0.55)',animation:'pulse 0.6s ease infinite',fontSize:Math.max(targetPx*0.35,11) }}>{targetPx>=40?'!':''}</button>}
        {fusions===0&&misses===0&&!visible && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><p className="text-gray-300 font-black text-lg text-center px-8">Toca el circulo naranja cuando aparezca</p></div>}
        {celebrate && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-5xl" style={{ animation:'pop 0.4s ease' }}>⚡</span></div>}
      </div>
      <div className="px-6 py-2 text-center border-t" style={{ background:'linear-gradient(90deg,#fff7ed,#fef9c3)' }}>
        <p className="text-xs font-bold text-amber-400">Nv {level} · {lv.lbl} · Target {lv.cm}cm ({targetPx}px) · {pxPerCm.toFixed(1)}px/cm · Pantalla {config.screenInches}"</p>
      </div>
    </div>
  )
}

// ─── SMOOTH PURSUIT ──────────────────────────────────────────
function PursuitView({ remaining,totalT,sessionTime,fusions,level,pxPerCm,celebrate,onSample,onEnd }:ExShared&{ pxPerCm:number; celebrate:boolean; onSample:(err:number)=>void; onEnd:()=>void }) {
  const pat = PURSUIT_PATTERNS[Math.min(level-1,4)]
  const [tgt,setTgt]  = useState({ x:50,y:50 })
  const [cur,setCur]  = useState({ x:-50,y:-50 })
  const [tracking,setTracking] = useState(false)
  const animRef = useRef<number>(0); const t0Ref = useRef(Date.now())
  const SAMPLE_EVERY = 120 // ms

  useEffect(()=>{
    t0Ref.current = Date.now()
    function frame() { setTgt(pat.fn((Date.now()-t0Ref.current)/1000)); animRef.current=requestAnimationFrame(frame) }
    animRef.current = requestAnimationFrame(frame)
    return ()=>{ if(animRef.current) cancelAnimationFrame(animRef.current) }
  },[level])

  useEffect(()=>{
    if (!tracking) return
    const id = setInterval(()=>{
      const dx=cur.x-tgt.x, dy=cur.y-tgt.y
      onSample(Math.sqrt(dx*dx+dy*dy))
    }, SAMPLE_EVERY)
    return ()=>clearInterval(id)
  },[tracking,cur,tgt])

  const targetPx = Math.max(Math.round(1.3*pxPerCm), 22)

  function handlePointerMove(e:React.PointerEvent<HTMLDivElement>) {
    if (!tracking) return
    const r = e.currentTarget.getBoundingClientRect()
    setCur({ x:((e.clientX-r.left)/r.width)*100, y:((e.clientY-r.top)/r.height)*100 })
  }

  const accuracy = fusions > 0 ? fusions : 0  // fusions = accuracy% display from parent

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <TopBar color="#8b5cf6" remaining={remaining} sessionTime={sessionTime} totalT={totalT} onEnd={onEnd} bg="linear-gradient(90deg,#8b5cf6,#06b6d4)"/>
      <StatsRow left={<><span className="text-2xl font-black text-violet-500">{accuracy}%</span><p className="text-xs text-gray-400 font-bold">Precision</p></>} center={<><span className="text-sm font-black text-violet-400">Nv {level}</span><p className="text-xs text-gray-400 font-bold">{pat.lbl}</p></>} right={<span className="text-xs font-bold text-gray-400">{tracking?'Siguiendo...':'Activa el cursor'}</span>} />
      <div className="flex-1 relative bg-white overflow-hidden cursor-crosshair"
        onPointerMove={handlePointerMove}
        onPointerDown={()=>setTracking(true)}
        style={{ touchAction:'none' }}>
        {/* Target */}
        <div className="absolute pointer-events-none transition-none" style={{ left:`${tgt.x}%`,top:`${tgt.y}%`,transform:'translate(-50%,-50%)',width:targetPx,height:targetPx,borderRadius:'50%',background:'linear-gradient(135deg,#8b5cf6,#06b6d4)',boxShadow:'0 4px 20px rgba(139,92,246,0.5)',animation:'pulse 1s ease infinite' }}/>
        {/* Cursor indicator */}
        {tracking && <div className="absolute pointer-events-none" style={{ left:`${cur.x}%`,top:`${cur.y}%`,transform:'translate(-50%,-50%)',width:14,height:14,borderRadius:'50%',border:'2px solid #8b5cf6',background:'rgba(139,92,246,0.2)' }}/>}
        {/* Line from cursor to target */}
        {tracking && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity:0.2 }}>
            <line x1={`${cur.x}%`} y1={`${cur.y}%`} x2={`${tgt.x}%`} y2={`${tgt.y}%`} stroke="#8b5cf6" strokeWidth="2" strokeDasharray="4"/>
          </svg>
        )}
        {!tracking && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><p className="text-gray-300 font-black text-lg text-center px-8">Toca la pantalla y sigue el objeto morado con el cursor</p></div>}
        {celebrate && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-5xl" style={{ animation:'pop 0.4s ease' }}>🎯</span></div>}
      </div>
      <div className="px-6 py-2 text-center border-t border-violet-100" style={{ background:'#f5f3ff' }}>
        <p className="text-xs font-bold text-violet-400">Sigue el objeto con el cursor manteniendo la menor distancia posible · smooth pursuit training</p>
      </div>
    </div>
  )
}

// ─── GABOR ───────────────────────────────────────────────────
function GaborView({ remaining,totalT,sessionTime,fusions,level,pxPerCm,misses,consDisplay,celebrate,onHit,onMiss,onEnd }:ExShared&{ pxPerCm:number; misses:number; consDisplay:number; celebrate:boolean; onHit:()=>void; onMiss:()=>void; onEnd:()=>void }) {
  const lv = GABOR_LV[Math.min(level-1,4)]
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const orientRef = useRef<'left'|'right'>('left')
  const [answered,setAnswered] = useState<'left'|'right'|null>(null)
  const [wasCorrect,setWasCorrect] = useState<boolean|null>(null)
  const accuracy = fusions+misses>0 ? Math.round(fusions/(fusions+misses)*100) : 100
  const canvasPx  = Math.max(Math.round(Math.min(pxPerCm*5, 260)), 140)

  function drawGabor() {
    const c=canvasRef.current; if (!c) return
    const ctx=c.getContext('2d'); if (!ctx) return
    const s=canvasPx; c.width=s; c.height=s
    const cx=s/2, cy=s/2, sigma=s*0.22, freq=lv.sf
    const ang = orientRef.current==='left' ? -Math.PI/4 : Math.PI/4
    const img = ctx.createImageData(s,s)
    for (let py=0;py<s;py++) {
      for (let px=0;px<s;px++) {
        const dx=px-cx, dy=py-cy
        const xr=dx*Math.cos(ang)+dy*Math.sin(ang)
        const yr=-dx*Math.sin(ang)+dy*Math.cos(ang)
        const g=Math.exp(-(xr*xr+yr*yr)/(2*sigma*sigma))
        const sin=Math.cos(2*Math.PI*freq*xr)
        let v=g*sin*lv.contrast + (Math.random()-0.5)*lv.noise*2
        const px_=Math.min(255,Math.max(0,Math.round((v*0.5+0.5)*255)))
        const i=(py*s+px)*4
        img.data[i]=px_; img.data[i+1]=px_; img.data[i+2]=px_; img.data[i+3]=255
      }
    }
    ctx.putImageData(img,0,0)
  }

  function newTrial() {
    orientRef.current = Math.random()>0.5 ? 'left' : 'right'
    setAnswered(null); setWasCorrect(null)
    setTimeout(drawGabor, 50)
  }

  useEffect(()=>{ newTrial() },[level])

  function answer(a:'left'|'right') {
    if (answered) return
    const correct = a===orientRef.current
    setAnswered(a); setWasCorrect(correct)
    if (correct) onHit(); else onMiss()
    setTimeout(newTrial, 900)
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <TopBar color="#10b981" remaining={remaining} sessionTime={sessionTime} totalT={totalT} onEnd={onEnd} bg="linear-gradient(90deg,#10b981,#0ea5e9)"/>
      <StatsRow left={<><span className="text-2xl font-black text-emerald-500">{fusions}</span><p className="text-xs text-gray-400 font-bold">Correctos</p></>} center={<><span className="text-xl font-black text-emerald-400">{accuracy}%</span><StaircasePips cons={consDisplay}/></>} right={<><span className="text-2xl font-black text-red-400">{misses}</span><p className="text-xs text-gray-400 font-bold">Errores</p></>} />
      <div className="flex-1 flex flex-col items-center justify-center bg-white gap-5 px-4 py-4 relative">
        <p className="text-gray-400 font-semibold text-xs text-center max-w-xs">Observa el patron. Indica si las lineas van hacia la izquierda o hacia la derecha.</p>
        <div className="relative">
          <canvas ref={canvasRef} style={{ borderRadius:16, border:'3px solid #f3f4f6', display:'block', opacity:celebrate?0.5:1 }} />
          {wasCorrect===true  && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-6xl" style={{ animation:'pop 0.5s ease' }}>✓</span></div>}
          {wasCorrect===false && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-6xl" style={{ animation:'pop 0.5s ease' }}>✗</span></div>}
        </div>
        {answered && wasCorrect!==null && (
          <p className={`font-black text-sm ${wasCorrect?'text-emerald-500':'text-red-500'} fade-up`}>
            {wasCorrect ? 'Correcto!' : `Incorrecto — era ${orientRef.current==='left'?'izquierda':'derecha'}`}
          </p>
        )}
        <div className="flex gap-4 w-full max-w-xs">
          <button onClick={()=>answer('left')} disabled={!!answered} className="btn flex-1 text-white font-black text-lg rounded-3xl py-4 shadow-xl transition-all" style={{ background:answered&&wasCorrect!==null?(orientRef.current==='left'?'#10b981':'#ef4444'):'linear-gradient(135deg,#10b981,#0ea5e9)', minHeight:64, opacity:answered?0.7:1 }}>Izquierda</button>
          <button onClick={()=>answer('right')} disabled={!!answered} className="btn flex-1 text-white font-black text-lg rounded-3xl py-4 shadow-xl transition-all" style={{ background:answered&&wasCorrect!==null?(orientRef.current==='right'?'#10b981':'#ef4444'):'linear-gradient(135deg,#0ea5e9,#8b5cf6)', minHeight:64, opacity:answered?0.7:1 }}>Derecha</button>
        </div>
        <div className="flex gap-4 text-xs text-gray-400 font-bold">
          <span>Contraste: {Math.round(lv.contrast*100)}%</span>
          <span>Ruido: {Math.round(lv.noise*100)}%</span>
          <span>Frec: {lv.sf}</span>
        </div>
      </div>
      <div className="px-6 py-2 text-center border-t border-emerald-100" style={{ background:'#ecfdf5' }}>
        <p className="text-xs font-bold text-emerald-400">Aprendizaje perceptual · parches de Gabor · orientacion izquierda/derecha</p>
      </div>
    </div>
  )
}

// ─── HART CHART ──────────────────────────────────────────────
const HART_CHARS = 'BCDEFGHJKLMNPRSTUVXYZ2345689'
function HartView({ remaining,totalT,sessionTime,fusions,level,pxPerCm,misses,celebrate,onHit,onMiss,onEnd }:ExShared&{ pxPerCm:number; misses:number; celebrate:boolean; onHit:(rt:number)=>void; onMiss:()=>void; onEnd:()=>void }) {
  const gridSize = level>=4 ? 6 : 5
  const [grid,setGrid]   = useState<string[]>([])
  const [idx,setIdx]     = useState(0)
  const [isNear,setIsNear] = useState(true)
  const [flash,setFlash] = useState<number|null>(null)
  const lastHit = useRef(Date.now())

  const fontCm   = isNear ? 1.1 : 0.42
  const cellCm   = isNear ? 2.0 : 1.1
  const fontSize = Math.max(Math.round(fontCm*pxPerCm), 12)
  const cellSize = Math.max(Math.round(cellCm*pxPerCm), 30)

  function newGrid() {
    setGrid(Array.from({length:gridSize*gridSize},()=>HART_CHARS[Math.floor(Math.random()*HART_CHARS.length)]))
    setIdx(0)
  }
  useEffect(()=>{ newGrid() },[gridSize])

  function click(i:number) {
    if (i===idx) {
      onHit(Date.now()-lastHit.current); lastHit.current=Date.now()
      if (i+1>=grid.length) { setIsNear(n=>!n); newGrid() }
      else setIdx(i+1)
    } else {
      setFlash(i); setTimeout(()=>setFlash(null),280); onMiss()
    }
  }

  const modeColor = isNear ? '#8b5cf6' : '#ec4899'
  const modeBg    = isNear ? '#f5f3ff' : '#fdf2f8'

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <TopBar color={modeColor} remaining={remaining} sessionTime={sessionTime} totalT={totalT} onEnd={onEnd} bg={`linear-gradient(90deg,${modeColor},#f97316)`} />
      <div className="px-6 py-2 flex justify-between items-center border-b border-gray-100 bg-gray-50/60">
        <div className="text-center"><span className="text-2xl font-black text-violet-500">{fusions}</span><p className="text-xs text-gray-400 font-bold">Leidas</p></div>
        <span className="text-sm font-black px-3 py-1 rounded-full text-white" style={{ background:modeColor }}>{isNear?'CERCA':'LEJOS'} · Nv {level}</span>
        <div className="text-center"><span className="text-2xl font-black text-red-400">{misses}</span><p className="text-xs text-gray-400 font-bold">Errores</p></div>
      </div>
      <div className="flex-1 flex items-center justify-center bg-white p-4 overflow-auto" style={{ background:celebrate?'rgba(139,92,246,0.04)':'white',transition:'background 0.2s' }}>
        <div style={{ display:'grid', gridTemplateColumns:`repeat(${gridSize},${cellSize}px)`, gap:3 }}>
          {grid.map((ch,i)=>{
            const isTarget=i===idx, isPast=i<idx, isFlash=flash===i
            return (
              <button key={i} onClick={()=>click(i)} style={{ width:cellSize,height:cellSize,fontSize,fontFamily:'monospace',fontWeight:900,borderRadius:8,border:`2px solid ${isTarget?modeColor:isPast?'#d1fae5':'#f3f4f6'}`,background:isTarget?modeBg:isFlash?'#fee2e2':isPast?'#f0fdf4':'white',color:isPast?'#6ee7b7':isFlash?'#ef4444':'#111',cursor:'pointer',transition:'all 0.08s' }}>
                {ch}
              </button>
            )
          })}
        </div>
      </div>
      <div className="px-6 py-2 text-center border-t" style={{ background:modeBg }}>
        <p className="text-xs font-bold" style={{ color:modeColor }}>
          {isNear?`CERCA · letras ${fontCm}cm`:`LEJOS · letras ${fontCm}cm`} · Lee izquierda-derecha, arriba-abajo · clic en orden
        </p>
      </div>
    </div>
  )
}

// ─── COMPLETE ─────────────────────────────────────────────────
function CompleteView({ sessions, streak, mode, onHome, onProgress }:{ sessions:SessionRecord[]; streak:number; mode:ExerciseMode; onHome:()=>void; onProgress:()=>void }) {
  const last=sessions[sessions.length-1]
  const modeInfo:Record<ExerciseMode,{label:string;bg:string;icon:string}> = {
    stereo:   { label:'Mod B Vergencia',    bg:'#0ea5e9',                                icon:'👁️' },
    anaglyph: { label:'Mod B+D Anaglifo',   bg:'linear-gradient(90deg,#ef4444,#06b6d4)', icon:'🕶️' },
    saccadic: { label:'Mod A Sacadicos',    bg:'linear-gradient(90deg,#f97316,#eab308)', icon:'⚡' },
    pursuit:  { label:'Mod A Seguimiento',  bg:'linear-gradient(90deg,#8b5cf6,#06b6d4)', icon:'🌀' },
    gabor:    { label:'Mod D Gabor',        bg:'linear-gradient(90deg,#10b981,#0ea5e9)', icon:'🔬' },
    hart:     { label:'Mod A Hart Chart',   bg:'linear-gradient(90deg,#ec4899,#f97316)', icon:'🔤' },
  }
  const mi = modeInfo[mode]
  const fusions=last?.fusions??0, duration=last?.duration??0, maxLevel=last?.maxLevel??1
  const stars = mode==='gabor' ? ((last?.gaborAcc??0)>=80?3:(last?.gaborAcc??0)>=60?2:1)
              : mode==='pursuit' ? (fusions>=85?3:fusions>=70?2:1)
              : (fusions>=15?3:fusions>=8?2:fusions>=3?1:0)
  return (
    <div className="fade-up min-h-screen flex flex-col items-center justify-center p-6 gap-5 text-center" style={{ background:'linear-gradient(135deg,#f0f9ff,#ecfdf5)' }}>
      <span className="text-7xl" style={{ animation:'pop 1s ease 2' }}>🎉</span>
      <h1 className="text-3xl font-black text-gray-700">Sesion Completada!</h1>
      <span className="text-sm font-bold px-3 py-1 rounded-full text-white" style={{ background:mi.bg }}>{mi.icon} {mi.label}</span>
      <div className="flex gap-2 text-5xl">{[1,2,3].map(i=><span key={i} style={{ opacity:i<=stars?1:0.2 }}>⭐</span>)}</div>
      <div className="bg-white rounded-3xl shadow-lg p-5 w-full max-w-sm">
        {mode==='gabor' ? (
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><p className="text-3xl font-black text-emerald-500">{last?.hits??0}</p><p className="text-xs text-gray-400 font-bold">Correctos</p></div>
            <div><p className="text-3xl font-black text-red-400">{last?.misses??0}</p><p className="text-xs text-gray-400 font-bold">Errores</p></div>
            <div><p className="text-3xl font-black text-sky-500">{last?.gaborAcc??0}%</p><p className="text-xs text-gray-400 font-bold">Precision</p></div>
          </div>
        ) : mode==='pursuit' ? (
          <div className="grid grid-cols-2 gap-4 text-center">
            <div><p className="text-3xl font-black text-violet-500">{fusions}%</p><p className="text-xs text-gray-400 font-bold">Precision media</p></div>
            <div><p className="text-3xl font-black text-sky-500">{fmt(duration)}</p><p className="text-xs text-gray-400 font-bold">Tiempo</p></div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><p className="text-3xl font-black text-emerald-500">{fusions}</p><p className="text-xs text-gray-400 font-bold">{mode==='hart'?'Leidas':'Aciertos'}</p></div>
            <div><p className="text-3xl font-black text-sky-500">{fmt(duration)}</p><p className="text-xs text-gray-400 font-bold">Tiempo</p></div>
            <div><p className="text-3xl font-black text-amber-500">{maxLevel}</p><p className="text-xs text-gray-400 font-bold">Nivel max</p></div>
          </div>
        )}
        {streak>0 && <div className="mt-4 pt-4 border-t border-gray-100"><p className="text-amber-500 font-black">{streak} dia{streak>1?'s':''} seguido{streak>1?'s':''}</p></div>}
      </div>
      <p className="text-gray-400 text-sm font-semibold max-w-xs">Descansa 15 minutos antes del proximo modulo</p>
      <div className="flex gap-3 w-full max-w-sm">
        <button onClick={onProgress} className="btn flex-1 bg-white text-sky-600 font-bold rounded-2xl py-4 shadow border border-sky-100">Progreso</button>
        <button onClick={onHome} className="btn flex-1 bg-sky-500 text-white font-black rounded-2xl py-4 shadow-lg hover:bg-sky-400">Inicio</button>
      </div>
    </div>
  )
}

// ─── PROGRESS ────────────────────────────────────────────────
function ProgressView({ progress, onBack }:{ progress:Progress; onBack:()=>void }) {
  const last14 = [...progress.sessions].slice(-14)
  const maxF   = Math.max(...last14.map(s=>s.fusions),1)
  const totalFusions = progress.sessions.reduce((a,s)=>a+s.fusions,0)
  const modeColors:Record<ExerciseMode,string> = { stereo:'#0ea5e9',anaglyph:'linear-gradient(to top,#ef4444,#06b6d4)',saccadic:'linear-gradient(to top,#f97316,#eab308)',pursuit:'linear-gradient(to top,#8b5cf6,#06b6d4)',gabor:'linear-gradient(to top,#10b981,#0ea5e9)',hart:'linear-gradient(to top,#ec4899,#f97316)' }
  const modeTags:Record<ExerciseMode,{bg:string;c:string;t:string}> = { stereo:{bg:'#f0f9ff',c:'#0ea5e9',t:'STE'},anaglyph:{bg:'#fff1f0',c:'#ef4444',t:'ANA'},saccadic:{bg:'#fff7ed',c:'#f97316',t:'SAC'},pursuit:{bg:'#f5f3ff',c:'#8b5cf6',t:'PUR'},gabor:{bg:'#ecfdf5',c:'#10b981',t:'GAB'},hart:{bg:'#fdf2f8',c:'#ec4899',t:'HAR'} }
  const modes:ExerciseMode[] = ['stereo','anaglyph','saccadic','pursuit','gabor','hart']
  return (
    <div className="fade-up min-h-screen bg-gradient-to-br from-sky-50 to-emerald-50 flex flex-col">
      <div className="bg-white/90 backdrop-blur-sm px-5 py-4 flex items-center gap-3 shadow-sm">
        <button onClick={onBack} className="btn text-sky-500 font-black text-lg">volver</button>
        <h2 className="font-black text-xl text-gray-700">Mi Progreso</h2>
      </div>
      <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto pb-8">
        <div className="grid grid-cols-2 gap-3">
          {[{v:progress.sessions.length,l:'Sesiones',c:'text-sky-500'},{v:progress.streak,l:'Racha',c:'text-amber-500'},{v:progress.currentLevel,l:'Nivel',c:'text-emerald-500'},{v:totalFusions,l:'Total hits',c:'text-violet-500'}].map(({v,l,c})=>(
            <div key={l} className="bg-white rounded-2xl shadow p-4 text-center"><p className={`text-3xl font-black ${c}`}>{v}</p><p className="text-xs text-gray-400 font-bold mt-1">{l}</p></div>
          ))}
        </div>
        <div className="bg-white rounded-3xl shadow p-4 flex gap-2 flex-wrap">
          {modes.map(m=>{ const n=progress.sessions.filter(s=>s.mode===m).length; const t=modeTags[m]; return <div key={m} className="flex-1 min-w-[60px] text-center rounded-xl py-2 px-1" style={{ background:t.bg }}><p className="text-xl font-black" style={{ color:t.c }}>{n}</p><p className="text-xs font-bold text-gray-400">{t.t}</p></div> })}
        </div>
        <div className="bg-white rounded-3xl shadow p-5">
          <h3 className="font-black text-gray-600 mb-3 text-sm">Actividad (ultimas 14)</h3>
          {last14.length===0 ? <div className="h-24 flex items-center justify-center text-gray-300 font-bold text-sm">Sin sesiones aun</div> : (
            <div className="flex items-end gap-1.5 h-24">
              {last14.map(s=>(
                <div key={s.id} className="flex-1 flex flex-col items-center gap-1 group">
                  <span className="text-xs text-sky-500 font-black opacity-0 group-hover:opacity-100 transition-opacity">{s.fusions}</span>
                  <div className="w-full rounded-t-lg" style={{ height:`${Math.max((s.fusions/maxF)*88,4)}%`, background:modeColors[s.mode??'stereo'] }}/>
                  <span style={{ fontSize:9 }} className="text-gray-300 font-bold">{new Date(s.date).toLocaleDateString('es-CL',{day:'numeric',month:'numeric'})}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-3xl shadow p-5">
          <h3 className="font-black text-gray-600 mb-3 text-sm">Historial</h3>
          {progress.sessions.length===0 ? <p className="text-gray-300 font-bold text-center py-4 text-sm">Sin sesiones</p> : (
            <div className="flex flex-col divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {[...progress.sessions].reverse().map(s=>{ const mt=modeTags[s.mode??'stereo']; return (
                <div key={s.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-600 text-sm">{new Date(s.date).toLocaleDateString('es-CL',{weekday:'short',day:'numeric',month:'short'})}</p>
                      <span className="text-xs font-black px-1.5 py-0.5 rounded-full" style={{ background:mt.bg,color:mt.c }}>{mt.t}</span>
                    </div>
                    <p className="text-xs text-gray-400">{fmt(s.duration)} · Nv {s.maxLevel}{s.avgReactionMs?` · ${(s.avgReactionMs/1000).toFixed(2)}s`:''}{s.gaborAcc?` · ${s.gaborAcc}%acc`:''}</p>
                  </div>
                  <div className="text-right"><p className="text-2xl font-black text-emerald-500">{s.fusions}</p><p className="text-xs text-gray-400">pts</p></div>
                </div>
              )})}
            </div>
          )}
        </div>
        <button onClick={()=>{ const b=new Blob([JSON.stringify(progress,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='visionplay-reporte.json'; a.click() }} className="btn bg-white border-2 border-dashed border-gray-200 text-gray-500 font-bold rounded-2xl py-3 text-sm hover:border-sky-300 hover:text-sky-500 transition-all">Exportar reporte para el profesional</button>
      </div>
    </div>
  )
}

// ─── SETTINGS ─────────────────────────────────────────────────
function SettingsView({ config, onSave, onBack, onReset, onCalibrate }:{ config:Config; onSave:(c:Config)=>void; onBack:()=>void; onReset:()=>void; onCalibrate:()=>void }) {
  const [pin,setPin]           = useState('')
  const [unlocked,setUnlocked] = useState(false)
  const [pinErr,setPinErr]     = useState(false)
  const [form,setForm]         = useState(config)
  const [confirmReset,setConfirmReset] = useState(false)
  function tryUnlock() { if(pin===config.pin){setUnlocked(true);setPinErr(false)}else{setPinErr(true);setPin('')} }
  if (!unlocked) return (
    <div className="fade-up min-h-screen bg-gradient-to-br from-sky-50 to-emerald-50 flex flex-col items-center justify-center p-6 gap-5">
      <div className="text-6xl">🔒</div>
      <h2 className="text-2xl font-black text-gray-600">Area del Profesional</h2>
      <div className="bg-white rounded-3xl shadow-lg p-6 w-full max-w-xs flex flex-col gap-4">
        <input type="password" value={pin} maxLength={8} onChange={e=>{setPin(e.target.value);setPinErr(false)}} onKeyDown={e=>e.key==='Enter'&&tryUnlock()} placeholder="PIN" className={`text-center text-3xl font-black border-2 rounded-2xl p-3 outline-none tracking-widest transition-all ${pinErr?'border-red-300 bg-red-50':'border-gray-200 focus:border-sky-300'}`}/>
        {pinErr&&<p className="text-red-400 font-bold text-sm text-center">PIN incorrecto</p>}
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
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-3">
          <h3 className="font-black text-gray-600">Paciente</h3>
          <input value={form.patientName} onChange={e=>setForm(f=>({...f,patientName:e.target.value}))} placeholder="Nombre" className="border-2 border-gray-200 rounded-2xl px-4 py-3 font-bold text-gray-700 focus:border-sky-300 outline-none transition-all"/>
        </div>
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-4">
          <h3 className="font-black text-gray-600">Sesion</h3>
          <div><p className="text-sm font-bold text-gray-400 mb-2">Duracion</p><div className="flex gap-2">{[10,15,20].map(v=><button key={v} onClick={()=>setForm(f=>({...f,sessionDuration:v}))} className={`btn flex-1 rounded-2xl py-3 font-black transition-all ${form.sessionDuration===v?'bg-sky-500 text-white shadow-md':'bg-gray-100 text-gray-500'}`}>{v} min</button>)}</div></div>
          <div><p className="text-sm font-bold text-gray-400 mb-2">Descanso entre fusiones</p><div className="flex gap-2 flex-wrap">{[10,15,20,25,30].map(v=><button key={v} onClick={()=>setForm(f=>({...f,restDuration:v}))} className={`btn rounded-2xl py-2 px-3 font-black text-sm transition-all ${form.restDuration===v?'bg-emerald-500 text-white shadow-md':'bg-gray-100 text-gray-500'}`}>{v}s</button>)}</div></div>
        </div>
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-3">
          <h3 className="font-black text-gray-600">Nivel inicial</h3>
          <div className="flex gap-2">{[1,2,3,4,5].map(v=><button key={v} onClick={()=>setForm(f=>({...f,initialLevel:v}))} className={`btn flex-1 rounded-2xl py-3 font-black transition-all ${form.initialLevel===v?'bg-amber-400 text-white shadow-md':'bg-gray-100 text-gray-500'}`}>{v}</button>)}</div>
        </div>
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-4">
          <div><h3 className="font-black text-gray-600">Contraste anaglifo (Ambliopia)</h3><p className="text-xs text-gray-400 font-semibold mt-1">Reduce el contraste del ojo SANO (dominante). El sistema ajusta automaticamente segun rendimiento cada 10 ensayos.</p></div>
          {([['leftEyeContrast','Ojo IZQUIERDO (lente rojo)','#ef4444','#fff1f0'],['rightEyeContrast','Ojo DERECHO (lente cyan)','#06b6d4','#ecfeff']] as const).map(([key,label,color,bg])=>(
            <div key={key} className="flex flex-col gap-2 rounded-2xl p-3" style={{ background:bg }}>
              <div className="flex justify-between items-center"><p className="text-sm font-black" style={{ color }}>{label}</p><span className="text-lg font-black text-gray-700">{Math.round(form[key]*100)}%</span></div>
              <input type="range" min="10" max="100" step="10" value={Math.round(form[key]*100)} onChange={e=>setForm(f=>({...f,[key]:parseInt(e.target.value)/100}))} style={{ background:`linear-gradient(to right,${color} ${Math.round(form[key]*100)}%,#e5e7eb ${Math.round(form[key]*100)}%)` }} className="w-full"/>
              <p className="text-xs text-gray-400 font-semibold">{form[key]<0.7?'Reducido (modo ambliopia)':form[key]<1.0?'Ligeramente reducido':'Normal (100%)'}</p>
            </div>
          ))}
          <button onClick={()=>setForm(f=>({...f,leftEyeContrast:1.0,rightEyeContrast:1.0}))} className="btn bg-gray-100 text-gray-500 font-bold rounded-2xl py-2 text-sm hover:bg-gray-200 transition-all">Reset contraste (100%/100%)</button>
        </div>
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-3">
          <h3 className="font-black text-gray-600">Pantalla y calibracion</h3>
          <p className="text-xs text-gray-400 font-semibold">Configurada: <span className="font-black text-gray-600">{form.screenInches}"</span></p>
          <button onClick={onCalibrate} className="btn border-2 border-violet-200 text-violet-500 font-bold rounded-2xl py-3 hover:bg-violet-50 transition-all">Volver a calibrar</button>
        </div>
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-3">
          <h3 className="font-black text-gray-600">Seguridad</h3>
          <input type="password" value={form.pin} maxLength={8} onChange={e=>setForm(f=>({...f,pin:e.target.value}))} placeholder="Nuevo PIN" className="border-2 border-gray-200 rounded-2xl px-4 py-3 font-bold text-gray-700 focus:border-sky-300 outline-none transition-all"/>
        </div>
        <div className="bg-white rounded-3xl shadow p-5 flex flex-col gap-3">
          <h3 className="font-black text-red-400">Zona de peligro</h3>
          {!confirmReset ? <button onClick={()=>setConfirmReset(true)} className="btn border-2 border-red-200 text-red-400 font-bold rounded-2xl py-3 hover:bg-red-50 transition-all">Resetear todo el progreso</button> : (
            <div className="flex flex-col gap-3">
              <p className="text-red-500 font-bold text-sm text-center">Seguro? Se borrara todo el historial.</p>
              <div className="flex gap-3">
                <button onClick={()=>{onReset();setConfirmReset(false)}} className="btn flex-1 bg-red-500 text-white font-black rounded-2xl py-3">Si, resetear</button>
                <button onClick={()=>setConfirmReset(false)} className="btn flex-1 bg-gray-100 text-gray-600 font-bold rounded-2xl py-3">Cancelar</button>
              </div>
            </div>
          )}
        </div>
        <button onClick={()=>{onSave(form);onBack()}} className="btn bg-sky-500 text-white font-black text-lg rounded-3xl py-4 shadow-xl hover:bg-sky-400 transition-all" style={{ boxShadow:'0 8px 28px rgba(14,165,233,0.38)' }}>Guardar configuracion</button>
      </div>
    </div>
  )
}