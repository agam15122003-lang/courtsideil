// מוק של supabase-js לצילום סרטוני ההדרכה.
//
// למה מוק ולא חשבון אמיתי: הקלטה של החשבון האמיתי הייתה מציגה שמות של
// קטינים אמיתיים בסרטון שמופץ בוואטסאפ. כאן הכול נתוני דמו.
// המוק הזה **לא נכנס לאפליקציה** — הוא נטען רק דרך vite.config.mjs
// שבתיקייה הזו, שממפה אליו את './supabaseClient'.
const COACH = 'coach-1'
const TEAM = 'נערים ב׳ (בנים)'
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const days = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d }
const iso = (n) => days(n).toISOString()
const now = new Date().toISOString()
const Y = ymd(days(-2)), N = ymd(days(1)), N2 = ymd(days(3)), N3 = ymd(days(5))
const S_PAST = '11111111-1111-4111-8111-111111111111'
const S_NEXT = '22222222-2222-4222-8222-222222222222'
const PLAN_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const PLAN_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'

const PROFILE = {
  id: COACH, first_name: 'דני', last_name: 'אבידן', club: 'הפועל ויתקין', age_groups: [TEAM],
  role: 'coach', is_admin: false, banned: false, avatar_url: null, phone: null, phone_public: false,
  approval_status: 'active', birth_year: 1988, created_at: '2026-06-01T00:00:00Z',
  bio: 'מאמן נערים ב׳ בהפועל ויתקין. מאמין באימון שמתחיל מהסגל ונגמר בסקירה.',
}

const NAMES = [
  ['יובל לוי', '4', 'רכז'], ['איתי כהן', '7', 'קלע'], ['נועם פרץ', '11', 'כנף'],
  ['עידו מזרחי', '15', 'סנטר'], ['דניאל ברק', '23', 'כנף'], ['אורי שלו', '5', 'רכז'],
  ['רן אבידן', '8', 'קלע'], ['גיא נחום', '12', 'כנף'], ['עומר טל', '14', 'סנטר'],
  ['אלון ביטון', '9', 'כנף'], ['יהלי דגן', '3', 'רכז'], ['מתן אשכנזי', '21', 'סנטר'],
]
const roster = NAMES.map(([name, number, position], i) => ({
  id: 'r' + (i + 1), coach_id: COACH, team: TEAM, name, number, position,
  status: i === 10 ? 'injured' : 'active', player_id: null,
  injury_note: i === 10 ? 'קרסול — חוזר בעוד שבועיים' : null,
  birth_year: 2011, phone: null, notes: null, created_at: '2026-08-01T00:00:00Z',
}))

// היסטוריית נוכחות של ארבעה אימונים — כדי שאחוזי הנוכחות יהיו אמיתיים
const attendance = []
for (const [d, absent] of [[-2, ['r3', 'r11']], [-5, ['r11']], [-7, ['r6', 'r11']], [-9, []]]) {
  for (const p of roster) {
    attendance.push({
      coach_id: COACH, team: TEAM, session_date: ymd(days(d)), player_id: p.id,
      status: absent.includes(p.id) ? 'absent' : 'present',
    })
  }
}

const DRILLS = [
  ['מסירות בזוגות בתנועה', 'מסירה', 8, 'שני שחקנים רצים לאורך המגרש ומוסרים בלי להפסיק את הריצה.'],
  ['שלוש נגד שתיים', 'התקפה', 12, 'יתרון מספרי — קבלת החלטה מהירה והשלמה לסל.'],
  ['הגנת אדם — החלקות', 'הגנה', 10, 'עבודת רגליים בהגנה, בלי כדור, עם שינויי כיוון.'],
  ['זריקות מהפינה', 'קליעה', 10, 'חמש סדרות מכל פינה, עם מסירה מהצד.'],
  ['כדרור יד חלשה', 'כדרור', 7, 'כדרור לאורך המגרש ביד שמאל בלבד, עם קונוסים.'],
  ['ריבאונד וסגירה', 'ריבאונד', 8, 'סגירת שחקן אחרי זריקה, ואז שחרור לריבאונד.'],
  ['מעבר מהיר', 'התקפה', 12, 'מהגנה להתקפה בשלוש מסירות או פחות.'],
  ['חימום דינמי', 'חימום', 10, 'ריצה קלה, פתיחת מפרקים והאצות קצרות.'],
]
const drills = DRILLS.map(([title, category, duration_minutes, description], i) => ({
  id: 'd' + (i + 1), created_by: COACH, title, category, duration_minutes, description,
  is_public: true, age_groups: [TEAM], tags: [category], equipment: 'כדורים, קונוסים',
  players_min: 4, players_max: 12, created_at: iso(-20 + i), drill_ratings: [],
  saved_drills: [], video_url: null, diagram: null,
}))

// תרגילים ששיתפו מאמנים אחרים — זה מה שרואים בטאב «מהקהילה»
const COMMUNITY_DRILLS = [
  ['סגירת ריבאונד 1 על 1', 'ריבאונד', 9, 'coach-2', 'המגן סוגר את התוקף אחרי זריקה ולוקח את הכדור. שתי דקות לכל זוג.'],
  ['חמישה מגעים לפני זריקה', 'התקפה', 14, 'coach-3', 'משחקון שמכריח מסירות: אין זריקה לפני חמישה מגעים.'],
  ['שתי כדורים — תיאום ידיים', 'כדרור', 8, 'coach-4', 'כדרור בשני כדורים במקביל, לסירוגין ואז יחד.'],
  ['לחץ כל המגרש 2 על 2', 'הגנה', 12, 'coach-2', 'לחץ מלא אחרי סל, עם שינוי תפקידים כל דקה.'],
  ['זריקות אחרי ריצה', 'קליעה', 10, 'coach-3', 'ריצה לקו העונשין, קבלת מסירה וזריקה בתנועה.'],
].map(([title, category, duration_minutes, by, description], i) => ({
  id: 'cd' + (i + 1), created_by: by, title, category, duration_minutes, description,
  is_public: true, age_groups: [TEAM], tags: [category], equipment: 'כדורים',
  players_min: 4, players_max: 14, created_at: iso(-15 + i),
  drill_ratings: [{ rating: 5, user_id: 'coach-3' }, { rating: 4, user_id: 'coach-4' }],
  saved_drills: [], video_url: null, diagram: null,
  author: { first_name: by === 'coach-2' ? 'תמר' : by === 'coach-3' ? 'רון' : 'מיכל',
            last_name: by === 'coach-2' ? 'כהן' : by === 'coach-3' ? 'לוי' : 'שרון',
            club: by === 'coach-2' ? 'מכבי אשדוד' : by === 'coach-3' ? 'הפועל חיפה' : 'אליצור נתניה' },
}))

// תוכניות אימון ששיתפו מאמנים אחרים
const COMMUNITY_PLANS = [
  { id: 'cp1', created_by: 'coach-3', name: 'אימון פתיחת עונה — 75 דקות', is_public: true, is_draft: false,
    created_at: iso(-9), updated_at: iso(-9), team: 'נערים א׳', duration_minutes: 75, session_date: null,
    plan_items: [{ id: 'i1', duration_minutes: 10, drill: { category: 'חימום' } }, { id: 'i2', duration_minutes: 25, drill: { category: 'כדרור' } }, { id: 'i3', duration_minutes: 25, drill: { category: 'התקפה' } }, { id: 'i4', duration_minutes: 15, drill: { category: 'קליעה' } }] },
  { id: 'cp2', created_by: 'coach-2', name: 'אימון הגנה קבוצתית', is_public: true, is_draft: false,
    created_at: iso(-16), updated_at: iso(-16), team: 'נערות ב׳', duration_minutes: 90, session_date: null,
    plan_items: [{ id: 'i5', duration_minutes: 12, drill: { category: 'חימום' } }, { id: 'i6', duration_minutes: 40, drill: { category: 'הגנה' } }, { id: 'i7', duration_minutes: 25, drill: { category: 'ריבאונד' } }, { id: 'i8', duration_minutes: 13, drill: { category: 'קליעה' } }] },
  { id: 'cp3', created_by: 'coach-4', name: 'אימון קצר ליום משחק', is_public: true, is_draft: false,
    created_at: iso(-22), updated_at: iso(-22), team: 'ילדים', duration_minutes: 45, session_date: null,
    plan_items: [{ id: 'i9', duration_minutes: 15, drill: { category: 'חימום' } }, { id: 'i10', duration_minutes: 20, drill: { category: 'התקפה' } }, { id: 'i11', duration_minutes: 10, drill: { category: 'קליעה' } }] },
]

const plans = [
  {
    id: PLAN_A, created_by: COACH, name: 'אימון הגנה — נערים ב׳', team: TEAM,
    duration_minutes: 90, created_at: iso(-6), updated_at: iso(-6), notes: 'דגש על תקשורת בהגנה',
    is_public: false, is_draft: false, session_date: null,
    plan_items: [{ id: 'pa1', duration_minutes: 10, drill: { category: 'חימום' } }, { id: 'pa2', duration_minutes: 35, drill: { category: 'הגנה' } }, { id: 'pa3', duration_minutes: 30, drill: { category: 'התקפה' } }, { id: 'pa4', duration_minutes: 15, drill: { category: 'קליעה' } }],
    sections: [
      { title: 'חימום', minutes: 10, items: ['חימום דינמי'] },
      { title: 'הגנה', minutes: 35, items: ['הגנת אדם — החלקות', 'ריבאונד וסגירה'] },
      { title: 'משחק', minutes: 30, items: ['שלוש נגד שתיים'] },
      { title: 'סיום', minutes: 15, items: ['זריקות מהפינה'] },
    ],
  },
  {
    id: PLAN_B, created_by: COACH, name: 'אימון מעבר מהיר', team: TEAM,
    duration_minutes: 75, created_at: iso(-13), updated_at: iso(-13), notes: null,
    is_public: true, is_draft: false, session_date: null,
    plan_items: [{ id: 'pb1', duration_minutes: 10, drill: { category: 'חימום' } }, { id: 'pb2', duration_minutes: 25, drill: { category: 'מסירה' } }, { id: 'pb3', duration_minutes: 30, drill: { category: 'התקפה' } }, { id: 'pb4', duration_minutes: 10, drill: { category: 'כדרור' } }],
    sections: [
      { title: 'חימום', minutes: 10, items: ['חימום דינמי'] },
      { title: 'מסירות', minutes: 25, items: ['מסירות בזוגות בתנועה'] },
      { title: 'מעבר', minutes: 30, items: ['מעבר מהיר'] },
      { title: 'סיום', minutes: 10, items: ['כדרור יד חלשה'] },
    ],
  },
]

const posts = [
  {
    id: 'p1', user_id: 'coach-2', content: 'מישהו מכיר תרגיל טוב לעבודה על מסירה מהאוויר לנערים ב׳? נתקעתי.',
    created_at: iso(-1), likes_count: 4, comments_count: 3, image_url: null, kind: 'post',
    author: { first_name: 'תמר', last_name: 'כהן', club: 'מכבי אשדוד', avatar_url: null },
  },
  {
    id: 'p2', user_id: 'coach-3', content: 'סיימנו עונה עם 14 ניצחונות. תודה לכל מי שעזר בעצות כאן — במיוחד על תרגילי המעבר המהיר.',
    created_at: iso(-2), likes_count: 21, comments_count: 7, image_url: null, kind: 'post',
    author: { first_name: 'רון', last_name: 'לוי', club: 'הפועל חיפה', avatar_url: null },
  },
  {
    id: 'p3', user_id: 'coach-4', content: 'טיפ קטן: אני מסמן נוכחות בטלפון כבר בחימום, ולא בסוף. חוסך לי חמש דקות בכל אימון.',
    created_at: iso(-3), likes_count: 12, comments_count: 2, image_url: null, kind: 'post',
    author: { first_name: 'מיכל', last_name: 'שרון', club: 'אליצור נתניה', avatar_url: null },
  },
]

const videos = [
  ['הגנת אזור 2-3 — הסבר מלא', 'הגנה', 'dQw4w9WgXcQ'],
  ['תרגילי כדרור לנוער', 'כדרור', 'dQw4w9WgXcQ'],
  ['פיק אנד רול — יסודות', 'התקפה', 'dQw4w9WgXcQ'],
  ['בניית אימון של 90 דקות', 'אימון', 'dQw4w9WgXcQ'],
].map(([title, category, yt], i) => ({
  id: 'v' + (i + 1), created_by: COACH, title, category,
  url: 'https://www.youtube.com/watch?v=' + yt, note: null, created_at: iso(-10 + i),
}))

export const DB = {
  profiles: [
    PROFILE,
    { id: 'coach-2', first_name: 'תמר', last_name: 'כהן', club: 'מכבי אשדוד', role: 'coach', banned: false, age_groups: ['נערות ב׳'], avatar_url: null },
    { id: 'coach-3', first_name: 'רון', last_name: 'לוי', club: 'הפועל חיפה', role: 'coach', banned: false, age_groups: ['נערים א׳'], avatar_url: null },
    { id: 'coach-4', first_name: 'מיכל', last_name: 'שרון', club: 'אליצור נתניה', role: 'coach', banned: false, age_groups: ['ילדים'], avatar_url: null },
  ],
  coach_directory: [
    { id: 'coach-2', first_name: 'תמר', last_name: 'כהן', club: 'מכבי אשדוד', age_groups: ['נערות ב׳'] },
    { id: 'coach-3', first_name: 'רון', last_name: 'לוי', club: 'הפועל חיפה', age_groups: ['נערים א׳'] },
    { id: 'coach-4', first_name: 'מיכל', last_name: 'שרון', club: 'אליצור נתניה', age_groups: ['ילדים'] },
  ],
  team_players: roster,
  schedule_entries: [
    { id: S_PAST, created_by: COACH, team: TEAM, date: Y, start_time: '18:00', end_time: '19:30', is_personal: false, plan: null, plan_id: PLAN_A, location: 'אולם ויתקין', kind: 'practice' },
    { id: S_NEXT, created_by: COACH, team: TEAM, date: N, start_time: '18:00', end_time: '19:30', is_personal: false, plan: null, plan_id: PLAN_B, location: 'אולם ויתקין', kind: 'practice' },
    { id: 'e3', created_by: COACH, team: TEAM, date: N2, start_time: '18:00', end_time: '19:30', is_personal: false, plan: null, plan_id: null, location: 'אולם ויתקין', kind: 'practice' },
    { id: 'e4', created_by: COACH, team: TEAM, date: N3, start_time: '10:00', end_time: '11:30', is_personal: false, plan: null, plan_id: null, location: 'היכל אשדוד', kind: 'game' },
  ],
  team_practice_slots: [
    { id: 's1', coach_id: COACH, team: TEAM, weekday: 0, start_time: '18:00', end_time: '19:30', location: 'אולם ויתקין' },
    { id: 's2', coach_id: COACH, team: TEAM, weekday: 2, start_time: '18:00', end_time: '19:30', location: 'אולם ויתקין' },
  ],
  practice_attendance: attendance,
  session_reviews: [
    { id: 'sr1', coach_id: COACH, session_id: S_PAST, session_date: Y, team: TEAM, what_worked: 'התקשורת בהגנה הייתה הכי טובה העונה.', what_next: 'לעבוד על סגירת ריבאונד — איבדנו ארבעה כדורים שנייה.', rating: 4, created_at: iso(-2) },
  ],
  // ⚠ רק מי שהיה נוכח מקבל ציון עומס. בלי הסינון הזה שחקן מסומן «נעדר»
  //   הופיע עם 9/10 בסרטון ההדרכה — פרט קטן שנראה כמו באג.
  session_effort: roster.filter((p) => !['r3', 'r11'].includes(p.id)).slice(0, 8).map((p, i) => ({
    id: 'ef' + i, coach_id: COACH, team: TEAM, session_type: 'practice', session_id: S_PAST,
    session_date: Y, roster_id: p.id, player_id: null, effort: [8, 7, 9, 6, 8, 7, 9, 8][i], source: 'coach', coach_ack: false,
  })),
  session_goal_marks: [
    { id: 'm1', coach_id: COACH, session_id: S_PAST, goal_id: 'g-team', roster_id: 'r1', player_id: null, met: true, created_at: now },
    { id: 'm2', coach_id: COACH, session_id: S_PAST, goal_id: 'g-team', roster_id: 'r2', player_id: null, met: true, created_at: now },
  ],
  player_goals: [
    { id: 'g-team', coach_id: COACH, player_id: null, roster_id: null, team: TEAM, period: 'week', title: 'תקשורת בהגנה — לקרוא כל חילוף', status: 'active', metric_type: 'checkbox', progress_value: 0, target_value: null, unit: null, due_date: null, created_at: iso(-4), created_by: COACH },
    { id: 'g-r1', coach_id: COACH, player_id: null, roster_id: 'r1', team: TEAM, period: 'month', title: 'יד שמאל בכדרור', status: 'active', metric_type: 'checkbox', progress_value: 0, target_value: null, unit: null, due_date: null, created_at: iso(-8), created_by: COACH },
    { id: 'g-r2', coach_id: COACH, player_id: null, roster_id: 'r2', team: TEAM, period: 'month', title: '100 זריקות עונשין ביום', status: 'active', metric_type: 'count', progress_value: 60, target_value: 100, unit: 'זריקות', due_date: N2, created_at: iso(-8), created_by: COACH },
  ],
  player_goal_logs: [],
  player_feedback: [
    { id: 'f1', coach_id: COACH, roster_id: 'r1', player_id: null, content: 'מוביל בהגנה, מדבר על המגרש. לתת לו יותר אחריות בהתקפה.', rating: 5, created_at: iso(-2), session_id: S_PAST, session_type: 'practice', session_date: Y },
    { id: 'f2', coach_id: COACH, roster_id: 'r4', player_id: null, content: 'חזק מתחת לסל. צריך לבקש את הכדור יותר.', rating: 4, created_at: iso(-2), session_id: S_PAST, session_type: 'practice', session_date: Y },
  ],
  player_assignments: [
    { id: 'a-team', coach_id: COACH, team: TEAM, player_id: null, roster_id: null, title: '100 זריקות עונשין עד יום חמישי', note: null, due_date: N2, status: 'active', target_value: 100, unit: 'זריקות', drill: null, plan: null, created_at: iso(-3) },
    { id: 'a-r2', coach_id: COACH, team: null, player_id: null, roster_id: 'r2', title: 'עבודה על יד שמאל — 10 דקות ביום', note: null, due_date: null, status: 'active', target_value: null, unit: null, drill: null, plan: null, created_at: iso(-2) },
  ],
  assignment_coach_marks: [
    { assignment_id: 'a-team', roster_id: 'r1', coach_id: COACH, done_at: now, progress_value: 100, updated_at: now },
    { assignment_id: 'a-team', roster_id: 'r2', coach_id: COACH, done_at: null, progress_value: 60, updated_at: now },
    { assignment_id: 'a-team', roster_id: 'r3', coach_id: COACH, done_at: now, progress_value: 100, updated_at: now },
  ],
  assignment_completions: [],
  team_goals: [], team_iba: [], team_staff: [], team_join_codes: [], team_memberships: [],
  team_games: [
    { id: 'tg1', coach_id: COACH, team: TEAM, game_date: N3, opponent: 'מכבי אשדוד', location: 'היכל אשדוד', is_home: false, start_time: '10:00' },
  ],
  messages: [
    { id: 'msg1', sender_id: 'coach-2', recipient_id: COACH, content: 'היי דני, מתאים לכם משחק אימון בשבת הבאה?', created_at: iso(-1), read_at: null },
  ],
  community_posts: posts,
  notifications: [
    { id: 'n1', user_id: COACH, actor_id: 'coach-2', type: 'message', content: 'שלחה לך הודעה', nav: 'messages', read_at: null, created_at: iso(-1), actor: { first_name: 'תמר', last_name: 'כהן' } },
    { id: 'n2', user_id: COACH, actor_id: 'coach-3', type: 'like', content: 'אהב את הפוסט שלך', nav: 'community', read_at: null, created_at: iso(-2), actor: { first_name: 'רון', last_name: 'לוי' } },
  ],
  drills: [...drills, ...COMMUNITY_DRILLS],
  public_drills: [...drills, ...COMMUNITY_DRILLS],
  training_plans: [...plans, ...COMMUNITY_PLANS],
  coach_notes: [],
  game_attendance: [], practice_rsvp: [],
  drill_videos: videos,
  video_ratings: [
    { video_id: 'v1', user_id: COACH, rating: 5 },
    { video_id: 'v1', user_id: 'coach-2', rating: 4 },
    { video_id: 'v2', user_id: 'coach-3', rating: 4 },
  ],
  videos,
  dossier_people: [], club_roles: [], game_requests: [], coach_meetings: [],
  saved_drills: [], drill_ratings: [], community_comments: [], community_likes: [],
  __rpc_my_profile: [PROFILE],
}

const SESSION = { user: { id: COACH, email: 'demo@courtside.local', user_metadata: {} }, access_token: 'mock', refresh_token: 'mock', expires_at: 9999999999 }

function builder(name) {
  let rows = (DB[name] || []).map((r) => ({ ...r }))
  let op = 'select', head = false, countMode = null, single = false, maybe = false, payload = null
  const b = {}
  const filt = (fn) => { rows = rows.filter(fn); return b }
  b.select = (cols, opts) => { if (opts?.head) head = true; if (opts?.count) countMode = opts.count; return b }
  b.insert = (r) => { op = 'insert'; payload = Array.isArray(r) ? r : [r]; return b }
  b.upsert = (r) => { op = 'upsert'; payload = Array.isArray(r) ? r : [r]; return b }
  b.update = (r) => { op = 'update'; payload = r; return b }
  b.delete = () => { op = 'delete'; return b }
  b.eq = (c, v) => filt((r) => r[c] === v)
  b.neq = (c, v) => filt((r) => r[c] !== v)
  b.in = (c, arr) => filt((r) => (arr || []).includes(r[c]))
  b.is = (c, v) => filt((r) => (v === null ? r[c] == null : r[c] === v))
  b.not = (c, opr, v) => (opr === 'is' && v === null ? filt((r) => r[c] != null) : b)
  b.gte = (c, v) => filt((r) => r[c] == null || r[c] >= v)
  b.lte = (c, v) => filt((r) => r[c] == null || r[c] <= v)
  b.gt = (c, v) => filt((r) => r[c] == null || r[c] > v)
  b.lt = (c, v) => filt((r) => r[c] == null || r[c] < v)
  b.match = (obj) => { for (const [c, v] of Object.entries(obj)) filt((r) => r[c] === v); return b }
  for (const k of ['or', 'ilike', 'like', 'contains', 'overlaps', 'textSearch', 'range', 'order', 'filter', 'abortSignal', 'throwOnError', 'csv', 'returns']) b[k] = () => b
  b.limit = (n) => { rows = rows.slice(0, n); return b }
  b.single = () => { single = true; return b }
  b.maybeSingle = () => { maybe = true; return b }
  const result = () => {
    if (op === 'insert' || op === 'upsert') {
      DB[name] = DB[name] || []
      for (const r of payload) DB[name].push({ id: 'new-' + Math.random().toString(36).slice(2, 8), created_at: now, ...r })
      return { data: single || maybe ? payload[0] : payload, error: null, count: null }
    }
    if (op === 'update') {
      const ids = new Set(rows.map((r) => r.id))
      DB[name] = (DB[name] || []).map((r) => (ids.has(r.id) ? { ...r, ...payload } : r))
      return { data: null, error: null, count: null }
    }
    if (op === 'delete') {
      const ids = new Set(rows.map((r) => r.id))
      DB[name] = (DB[name] || []).filter((r) => !ids.has(r.id))
      return { data: null, error: null, count: null }
    }
    if (head) return { data: null, error: null, count: countMode ? rows.length : null }
    if (single || maybe) return { data: rows[0] || null, error: single && !rows[0] ? { code: 'PGRST116', message: 'no rows' } : null }
    return { data: rows, error: null, count: countMode ? rows.length : null }
  }
  b.then = (res, rej) => Promise.resolve().then(result).then(res, rej)
  return b
}

export const supabaseConfigured = true
export const supabase = {
  from: (name) => builder(name),
  rpc: (name) => builder('__rpc_' + name),
  auth: {
    getSession: async () => ({ data: { session: SESSION }, error: null }),
    getUser: async () => ({ data: { user: SESSION.user }, error: null }),
    refreshSession: async () => ({ data: { session: SESSION }, error: null }),
    onAuthStateChange: (cb) => { setTimeout(() => cb('SIGNED_IN', SESSION), 0); return { data: { subscription: { unsubscribe() {} } } } },
    signOut: async () => ({ error: null }),
    updateUser: async () => ({ data: {}, error: null }),
  },
  channel: () => { const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => {} }; return ch },
  removeChannel: () => {},
  storage: {
    from: () => ({
      createSignedUrl: async () => ({ data: { signedUrl: '' }, error: null }),
      createSignedUrls: async (paths) => ({ data: (paths || []).map((p) => ({ path: p, signedUrl: '' })), error: null }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
      upload: async () => ({ data: {}, error: null }),
      remove: async () => ({ data: {}, error: null }),
    }),
  },
  functions: { invoke: async () => ({ data: null, error: null }) },
}
// הסיור המודרך לא אמור להיפתח באמצע צילום
try { localStorage.setItem('tour_v1', '1'); localStorage.setItem('onboarded_v1', '1') } catch { /* אין localStorage */ }
window.__DB = DB
