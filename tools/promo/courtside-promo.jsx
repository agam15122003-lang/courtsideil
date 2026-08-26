/* CourtSide — סרטון תדמית 9:16, ~46 שניות.
   המסכים הם צילומים אמיתיים ממסמך המסירה של המוצר (design_handoff/design/Courtside Mobile.dc.html).
   פלטה, טיפוגרפיה ותוכן לפי DESIGN.md ו-src/Landing.jsx.

   ⚠ הטקסטים כאן נכתבו מחדש (25.8.2026). הכלל: כל משפט מסביר **למה כדאי**,
   לא **מה יש**. הגרסה הקודמת תיארה פיצ'רים («דף אחד. עט או הקלדה.»);
   הזו מסבירה מה נוח יותר מהמחברת ומה אפשר כאן שאי אפשר על נייר —
   לא הולך לאיבוד, מחפשים במקום להיזכר, מצטבר לבד, עובר בלחיצה.

   שני כללי ניסוח:
   · פעולה בציווי למה שהמאמן עושה («תבנה», «תשרטט», «תסגור»), ומשפט חיווי
     למה שהמערכת עושה בשבילו («הלו״ז ממלא את עצמו»).
   · בלי רשימות עם נקודתיים ובלי הבטחות שאי אפשר לאמת. «על הפרקט» ירד —
     הוא סתר את ההחלטה שהאפליקציה אינה בשימוש תוך כדי אימון. */

const { CompositionStage, useComposition, Captions, Easing, animate, clamp } = window;
const { useTweaks, TweaksPanel, TweakSection, TweakToggle, TweakColor, TweakText } = window;

const W = 1080, H = 1920;
const NAVY1 = '#17264A', NAVY2 = '#0A1428', DEEP = '#07101f';
const TX = '#EEF2F8', MUT = '#9AA6BB', LN = '#2C374D';
const DISP = "'Heebo', system-ui, sans-serif";
const BODY = "'Rubik', system-ui, sans-serif";

const MOTION = {
  enter: (o) => animate(Object.assign({ ease: Easing.easeOutCubic }, o)),
  glide: (o) => animate(Object.assign({ ease: Easing.easeInOutCubic }, o)),
  pop: (o) => animate(Object.assign({ ease: Easing.easeOutBack }, o)),
};

/* מסך הטלפון: 520 רחב. הצילומים ברוחב 784 → מוצגים ב-520 (יחס 0.663) */
const SW = 520, SH = 1120, K = SW / 784;
const SCREENS = [
  { id: 'Home', src: 'assets/screen-home.png', ih: 4200, p0: 0, p1: -880, word: 'הכל במקום אחד.', sub: 'לא מחפש במחברת ולא גולל בוואטסאפ. נכנס ורואה.' },
  { id: 'Plan', src: 'assets/screen-notebook.png', ih: 2814, p0: -60, p1: -740, word: 'תבנה את האימון שלך.', sub: 'כמו במחברת, רק שכלום לא הולך לאיבוד — והאימון חוזר בלחיצה.' },
  { id: 'Drills', src: 'assets/screen-drills.png', ih: 2348, p0: 0, p1: -420, word: 'צריך תרגיל?', sub: 'במקום לנסות להיזכר איפה ראית אותו — מחפש מילה, ומוצא.' },
  { id: 'Tactics', src: 'assets/screen-tactics.png', ih: 2352, p0: -90, p1: -470, word: 'תשרטט את המהלך.', sub: 'על לוח זה נמחק אחרי חמש דקות. כאן זה נשאר עם התרגיל.' },
  { id: 'Review', src: 'assets/screen-review.png', ih: 2520, p0: -40, p1: -540, word: 'תסגור את האימון בדקה.', sub: 'מי הגיע וכמה זה היה קשה לו — והכל מצטבר לבד לאורך העונה.' },
  { id: 'Player', src: 'assets/screen-player.png', ih: 1956, p0: 0, p1: -180, word: 'ולכל שחקן יש כרטיס.', sub: 'במחברת היית מדפדף חודשיים אחורה. כאן זה כבר מסודר.' },
  { id: 'Season', src: 'assets/screen-schedule.png', ih: 2694, p0: -40, p1: -620, word: 'והלו״ז ממלא את עצמו.', sub: 'קובע ימי אימון פעם אחת, והם חוזרים כל שבוע לבד.' },
  { id: 'Community', src: 'assets/screen-community.png', ih: 3404, p0: -40, p1: -1000, word: 'ואתה לא לבד בזה.', sub: 'מערך שלם של מאמן אחר עובר אליך בלחיצה. תשנה מה שבא לך.' },
];

function Mark({ size, accent }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <circle cx="42" cy="55" r="22" fill={accent} />
      <circle cx="42" cy="55" r="9" fill="#fff" />
      <path d="M60 45 L82 38 L82 52 L62 58 Z" fill={accent} />
      <circle cx="78" cy="30" r="6" fill={accent} />
    </svg>
  );
}

function CourtLines({ opacity }) {
  return (
    <svg viewBox="0 0 360 460" width={1500} height={1916}
      style={{ position: 'absolute', left: -210, top: 0, opacity }} aria-hidden="true">
      <g stroke="#DDE7F6" strokeWidth="1.4" fill="none">
        <rect x="22" y="22" width="316" height="416" rx="10" />
        <line x1="22" y1="230" x2="338" y2="230" />
        <circle cx="180" cy="230" r="44" />
        <rect x="120" y="24" width="120" height="128" />
        <circle cx="180" cy="152" r="38" />
        <path d="M62 24 Q62 148 62 148 Q180 244 298 148 Q298 24 298 24" />
        <rect x="120" y="308" width="120" height="128" />
        <circle cx="180" cy="308" r="38" />
        <path d="M62 436 Q62 312 62 312 Q180 216 298 312 Q298 436 298 436" />
      </g>
    </svg>
  );
}

/* ציפים מפוזרים — הסצנה הפותחת */
const CHIPS = [
  { text: 'מחברת בתיק', x: 150, y: 620, r: -7 },
  { text: 'וואטסאפ', x: 640, y: 500, r: 5 },
  { text: 'פתקים בכיס', x: 230, y: 1060, r: 4 },
  { text: 'ומה שתזכור', x: 630, y: 1180, r: -5 },
];

function Chips({ T, C }) {
  const gather = MOTION.glide({ from: 0, to: 1, start: C.Home - 0.9, end: C.Home + 0.6 })(T);
  const fade = 1 - clamp((T - (C.Home - 0.5)) / 0.8, 0, 1);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: clamp(T / 0.9, 0, 1) * fade }}>
      {CHIPS.map((c, i) => {
        const drift = Math.sin(T * 0.8 + i * 1.7) * 16;
        const x = c.x + (540 - c.x) * gather;
        const y = c.y + drift * (1 - gather) + (940 - c.y) * gather;
        return (
          <span key={c.text} style={{
            position: 'absolute', left: x, top: y,
            transform: `translate(-50%,-50%) rotate(${c.r * (1 - gather)}deg) scale(${1 - gather * 0.5})`,
            padding: '16px 32px', borderRadius: 999,
            background: 'rgba(10,20,40,0.5)', border: '1px solid rgba(226,234,246,0.22)',
            backdropFilter: 'blur(6px)', font: `500 52px ${BODY}`, color: '#E4EBF6',
            whiteSpace: 'nowrap', boxShadow: '0 12px 34px rgba(4,10,22,0.42)',
          }}>{c.text}</span>
        );
      })}
    </div>
  );
}

/* כל הצילומים חיים כל הזמן; רק השקיפות והפאן משתנים — מעבר רך בין מסך למסך */
function Screens({ T, C }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0F141E' }}>
      {SCREENS.map((s, i) => {
        const from = C[s.id];
        const to = i + 1 < SCREENS.length ? C[SCREENS[i + 1].id] : C.Close;
        const o = clamp((T - (from - 0.45)) / 0.8, 0, 1) * (1 - clamp((T - (to - 0.45)) / 0.8, 0, 1));
        const pan = MOTION.glide({ from: s.p0, to: s.p1, start: from - 0.3, end: to - 0.1 })(T);
        return (
          <img key={s.id} src={s.src} alt=""
            style={{
              position: 'absolute', left: 0, top: 0, width: SW, height: s.ih * K,
              transform: `translateY(${pan}px) scale(${1 + (1 - o) * 0.03})`,
              opacity: o, visibility: o <= 0.002 ? 'hidden' : 'visible',
            }} />
        );
      })}
    </div>
  );
}

function Close({ T, C, accent, accentDeep, cta, site }) {
  const on = clamp((T - (C.Close - 0.4)) / 0.6, 0, 1);
  const markS = MOTION.pop({ from: 0.6, to: 1, start: C.Close - 0.2, end: C.Close + 0.8 })(T);
  const titleY = MOTION.enter({ from: 48, to: 0, start: C.Close + 0.2, end: C.Close + 1.1 })(T);
  const titleO = clamp((T - (C.Close + 0.2)) / 0.7, 0, 1);
  const ctaS = MOTION.pop({ from: 0.84, to: 1, start: C.Close + 1.2, end: C.Close + 1.9 })(T);
  const ctaO = clamp((T - (C.Close + 1.2)) / 0.5, 0, 1);
  const line = MOTION.glide({ from: 0, to: 1, start: C.Close + 0.5, end: C.Close + 4.6 })(T);
  const glow = 0.5 + 0.5 * Math.sin((T - C.Close) * 2.2);

  return (
    <div style={{
      position: 'absolute', inset: 0, opacity: on, direction: 'rtl',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '0 88px', boxSizing: 'border-box', textAlign: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, transform: `scale(${markS})` }}>
        <Mark size={108} accent={accent} />
        <span style={{ font: `900 96px ${DISP}`, color: TX, letterSpacing: '-0.03em' }}>CourtSide</span>
      </div>
      <div style={{
        transform: `translateY(${titleY}px)`, opacity: titleO, marginTop: 30,
        font: `900 72px ${DISP}`, color: TX, lineHeight: 1.16, letterSpacing: '-0.025em', textWrap: 'pretty',
      }}>
        כל העונה שלך,<br />
        <span style={{ color: '#F0A878' }}>במקום אחד.</span>
      </div>
      <div style={{
        marginTop: 34, opacity: titleO, font: `700 40px ${DISP}`, color: '#F0A878',
        letterSpacing: '-0.015em',
      }}>בחינם · בעברית · בלי להתקין כלום</div>
      <div style={{
        marginTop: 44, transform: `scale(${ctaS})`, opacity: ctaO,
        padding: '28px 66px', borderRadius: 999, background: accentDeep,
        boxShadow: `0 0 ${30 + glow * 36}px rgba(232,118,58,${0.22 + glow * 0.22})`,
        font: `700 46px ${BODY}`, color: '#fff', whiteSpace: 'nowrap',
      }}>{cta}</div>
      {site ? (
        <div style={{ marginTop: 28, opacity: ctaO, font: `500 34px ${BODY}`, color: '#F0A878' }} dir="ltr">{site}</div>
      ) : null}
      <div style={{
        position: 'absolute', bottom: 96, left: 88, right: 88, height: 5,
        borderRadius: 999, background: 'rgba(226,234,246,0.14)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${line * 100}%`, borderRadius: 999,
          background: `linear-gradient(90deg,${accent},#F0A878)`,
        }} />
      </div>
    </div>
  );
}

function Piece({ tw }) {
  const { T, CUES: C, authoredTotal } = useComposition();
  const accent = tw.accent || '#E8763A';
  const accentDeep = '#B34E1C';
  const END = authoredTotal || 46.2;

  const bgScale = MOTION.glide({ from: 1.05, to: 1.42, start: 0, end: END })(T);
  const bgX = MOTION.glide({ from: 0, to: -90, start: 0, end: END })(T);
  const veil =
    0.9
    - MOTION.glide({ from: 0, to: 0.4, start: 0, end: 1.0 })(T)
    + MOTION.glide({ from: 0, to: 0.2, start: C.Home - 0.5, end: C.Plan })(T)
    + MOTION.glide({ from: 0, to: 0.28, start: C.Community + 1.5, end: C.Close + 0.6 })(T);

  /* הטלפון עולה פעם אחת ונשאר — הזום נשמר, וכל ביט מקבל נשימה קטנה */
  const beatBreath = SCREENS.reduce((acc, s) => acc
    + MOTION.glide({ from: 0, to: 0.012, start: C[s.id] - 0.45, end: C[s.id] + 0.5 })(T)
    - MOTION.glide({ from: 0, to: 0.012, start: C[s.id] + 0.5, end: C[s.id] + 1.6 })(T), 0);
  const phY =
    MOTION.enter({ from: 2500, to: 800, start: C.Home - 1.0, end: C.Home + 0.9 })(T)
    + MOTION.glide({ from: 0, to: -30, start: C.Review, end: C.Community })(T)
    + MOTION.glide({ from: 0, to: 1900, start: C.Close - 0.9, end: C.Close + 0.7 })(T);
  const phScale =
    MOTION.enter({ from: 0.92, to: 1.42, start: C.Home - 1.0, end: C.Home + 1.2 })(T)
    + beatBreath
    - MOTION.glide({ from: 0, to: 0.6, start: C.Close - 1.0, end: C.Close + 0.5 })(T);
  const phRot = MOTION.glide({ from: -4, to: 0, start: C.Home - 0.9, end: C.Home + 1.1 })(T);
  const phO = clamp((T - (C.Home - 1.1)) / 0.5, 0, 1) * (1 - clamp((T - (C.Close - 0.55)) / 0.5, 0, 1));

  const capStyle = {
    left: '7%', right: '7%', bottom: '5.5%', direction: 'rtl', textAlign: 'right',
    padding: 0, background: 'none', pointerEvents: 'none',
  };
  const line = (word, sub) => (
    <span>
      <span style={{
        display: 'block', font: `900 82px ${DISP}`, color: TX,
        letterSpacing: '-0.035em', lineHeight: 1.05,
        textShadow: '0 6px 30px rgba(4,10,22,0.85)',
      }}>{word}</span>
      <span style={{
        display: 'block', marginTop: 12, font: `500 36px ${BODY}`, color: '#C9D5E6',
        lineHeight: 1.35, textShadow: '0 4px 20px rgba(4,10,22,0.8)', textWrap: 'pretty',
      }}>{sub}</span>
    </span>
  );
  const caps = tw.captions === false ? [] : [
    { at: 0.8, until: C.Home - 0.5, text: line('הכל אצלך בראש.', 'קצת במחברת, קצת בוואטסאפ, והשאר — שתזכור.') },
  ].concat(SCREENS.map((s, i) => {
    const to = i + 1 < SCREENS.length ? C[SCREENS[i + 1].id] : C.Close;
    return { at: C[s.id] + 0.45, until: to - 0.4, text: line(s.word, s.sub) };
  }));

  return (
    <div data-screen-label={`${T.toFixed(0)}s`}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: DEEP }}>

      <img src="public/images/hero/hero-32c9130b-lg.webp" alt=""
        style={{
          position: 'absolute', top: 0, left: -740, width: 2560, height: 1920,
          objectFit: 'cover', transform: `scale(${bgScale}) translateX(${bgX}px)`,
          transformOrigin: '50% 45%', filter: 'saturate(0.6) contrast(1.05)',
        }} />
      <div style={{
        position: 'absolute', inset: 0, opacity: clamp(veil, 0, 1),
        background: `linear-gradient(168deg,${NAVY1} 0%,${NAVY2} 62%,${DEEP} 100%)`,
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(58% 40% at 50% 32%, rgba(232,118,58,${0.09 + 0.05 * Math.sin(T * 0.6)}), rgba(232,118,58,0) 70%)`,
      }} />
      <CourtLines opacity={0.035} />

      <Chips T={T} C={C} />

      <div style={{
        position: 'absolute', left: 540, top: 0, width: 0, height: 0,
        opacity: phO, transform: `translateY(${phY}px) scale(${clamp(phScale, 0.2, 2.4)}) rotate(${phRot}deg)`,
        transformOrigin: '50% 50%',
      }}>
        <div style={{
          position: 'absolute', left: -272, top: -572, width: 544, height: 1144,
          borderRadius: 62, background: '#0a1120', padding: 12, boxSizing: 'border-box',
          boxShadow: '0 44px 90px rgba(3,8,18,0.62), 0 0 0 1px rgba(226,234,246,0.1)',
        }}>
          <div style={{
            position: 'absolute', inset: 12, borderRadius: 50, overflow: 'hidden',
            background: '#0F141E', border: `1px solid ${LN}`, width: SW, height: SH,
          }}>
            <Screens T={T} C={C} />
          </div>
          <div style={{
            position: 'absolute', top: 26, left: '50%', transform: 'translateX(-50%)',
            width: 108, height: 9, borderRadius: 999, background: '#05080f', zIndex: 5,
          }} />
        </div>
      </div>

      {/* פס תחתון רך — מפריד בין המסך לכיתוב */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 520, pointerEvents: 'none',
        background: 'linear-gradient(180deg,rgba(7,16,31,0) 0%,rgba(7,16,31,0.5) 40%,rgba(7,16,31,0.9) 100%)',
        opacity: clamp((T - (C.Home - 1.2)) / 0.8, 0, 1) * (1 - clamp((T - (C.Close - 0.7)) / 0.6, 0, 1)),
      }} />

      <Close T={T} C={C} accent={accent} accentDeep={accentDeep}
        cta={tw.ctaText || 'מתחילים בחינם'} site={tw.siteLine || ''} />

      <Captions items={caps} style={capStyle} />
    </div>
  );
}

function CourtSidePromo() {
  const [tw, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  return (
    <React.Fragment>
      <CompositionStage width={W} height={H} bg={DEEP}
        scenes={window.OM_SCENES} playback={window.OM_PLAYBACK}>
        <Piece tw={tw} />
      </CompositionStage>
      <TweaksPanel>
        <TweakSection label="עריכה" />
        <TweakToggle label="Motion editor" value={tw.motionEditor}
          onChange={(v) => setTweak('motionEditor', v)} />
        <TweakToggle label="כיתוב בסרטון" value={tw.captions}
          onChange={(v) => setTweak('captions', v)} />
        <TweakSection label="מותג" />
        <TweakColor label="צבע מבטא" value={tw.accent}
          options={['#E8763A', '#B34E1C', '#F0A878', '#1F57B0']}
          onChange={(v) => setTweak('accent', v)} />
        <TweakText label="קריאה לפעולה" value={tw.ctaText}
          onChange={(v) => setTweak('ctaText', v)} />
        <TweakText label="שורת כתובת" value={tw.siteLine}
          onChange={(v) => setTweak('siteLine', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.CourtSidePromo = CourtSidePromo;
