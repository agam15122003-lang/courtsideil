// ===== חיבור לאיגוד הכדורסל (ibasketball.co.il) =====
// API חוקי וגלוי (SportsPress REST, CORS פתוח). מבנה הנתונים:
//   • "ליגות" (sp_league) בנויות כעץ: צומת-עונה (למשל "2025-2026", parent=0)
//     ומתחתיו עשרות ליגות אמיתיות ששמן מקודד קטגוריה+אזור ("נערים א דרום",
//     "קט סל א אשקלון", "ארצית נשים מרכז" וכו').
//   • קבוצות (sp_team) משויכות לליגה דרך teams?leagues=<id>.
//   • טבלת הליגה: tables?leagues=<id>  (כשיש — בחלק מהליגות אין טבלה).
//   • משחקים: events?leagues=<id> / events?teams=<id>  (ה-REST הציבורי חשוף חלקית).

const IBBA = 'https://ibasketball.co.il/wp-json/sportspress/v2'

export const clean = (s) =>
  String(s || '')
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, '׳')
    .replace(/&amp;/g, '&')
    .trim()

// ליבת שם המועדון (בלי "הפועל"/"מכבי"...) — לחיפוש קבוצות
export const clubCore = (club) =>
  clean(club).replace(/^(הפועל|מכבי|בית"ר|אליצור|עירוני|מ\.?כ\.?|מ\.?ס\.?|א\.ס\.?|ע\.ל\.ה\.?|אס"א|אנ"ד)\s+/, '').trim()

// נירמול עברי להשוואות (בלי רווחים/גרשיים/ניקוד-מרכאות)
const norm = (s) => clean(s).replace(/[\s׳'"’״]/g, '')

async function jget(path) {
  const r = await fetch(`${IBBA}${path}`)
  if (!r.ok) throw new Error(`IBA ${r.status}`)
  return r.json()
}

const title = (o) => clean(o?.title?.rendered ?? o?.title ?? o?.name ?? '')

// ---- צומת העונה הנוכחית (נשמר בזיכרון לכל הסשן) ----
let _seasonNode = null
export async function currentSeasonNode() {
  if (_seasonNode) return _seasonNode
  const tops = await jget('/leagues?parent=0&per_page=100')
  let best = null
  for (const l of tops) {
    const m = /^(\d{4})-(\d{4})$/.exec(clean(l.name))
    if (m && (!best || +m[1] > best.year)) best = { id: l.id, name: clean(l.name), year: +m[1] }
  }
  _seasonNode = best
  return best
}

// ---- כל הליגות של העונה הנוכחית (עם pagination) ----
let _allLeagues = null
export async function allLeagues() {
  if (_allLeagues) return _allLeagues
  const node = await currentSeasonNode()
  if (!node) return []
  const out = []
  for (let page = 1; page <= 10; page++) {
    const batch = await jget(`/leagues?parent=${node.id}&per_page=100&page=${page}`)
    if (!Array.isArray(batch) || !batch.length) break
    out.push(...batch.map((l) => ({ id: l.id, name: clean(l.name), count: l.count })))
    if (batch.length < 100) break
  }
  _allLeagues = out
  return out
}

// אזורים נפוצים בשמות הליגות — לחילוץ "האזור" שהמאמן בוחר
const REGIONS = ['צפון', 'דרום', 'מרכז', 'שרון', 'דן', 'חיפה', 'ירושלים', 'גליל', 'שפלה', 'השרון', 'לאומית', 'ארצית', 'עמק']
export const regionOf = (leagueName) => REGIONS.find((r) => norm(leagueName).includes(norm(r))) || ''

// מילות-קטגוריה לפי שכבת הגיל של המאמן (כולל וריאציות בנים/בנות)
function categoryNeedles(ageGroupEntry) {
  const n = norm(ageGroupEntry)
  const girls = n.includes('בנות')
  const out = []
  const add = (...xs) => xs.forEach((x) => out.push(norm(x)))
  if (n.includes('קטסל')) add('קטסל')
  else if (n.includes('ילדים')) add(girls ? 'ילדות' : 'ילדים', 'ילדים')
  else if (n.includes('נערים')) add(girls ? 'נערות' : 'נערים', girls ? 'נערות' : 'נערים')
  else if (n.includes('נוער')) add('נוער')
  else if (n.includes('בוגרים')) add('ארצית', 'לאומית', 'בוגרים')
  else if (n.includes('ביתספר')) add('קטסל', 'מיני')
  // אות שכבה (א/ב) אם קיימת — לחידוד
  const lvl = /נערים?\s*([אב])|ילדים?\s*([אב])|קט\s*סל\s*([אב])|נער(?:ים|ות)\s*([אב])/.exec(clean(ageGroupEntry))
  return { needles: [...new Set(out)], level: lvl ? (lvl[1] || lvl[2] || lvl[3] || lvl[4]) : '', girls }
}

// סינון הליגות לפי שכבת הגיל שהמאמן בחר (best-effort; תמיד אפשר "הצג הכול")
export function leaguesForAge(leagues, ageGroupEntry) {
  if (!ageGroupEntry) return leagues
  const { needles, girls } = categoryNeedles(ageGroupEntry)
  if (!needles.length) return leagues
  return leagues.filter((l) => {
    const nm = norm(l.name)
    const hit = needles.some((nd) => nm.includes(nd))
    if (!hit) return false
    // התאמת מגדר: בנות → שם מכיל נשים/נערות/בנות/ילדות; בנים → לא
    const isGirlLeague = /נשים|נערות|בנות|ילדות/.test(l.name)
    return girls ? isGirlLeague : !isGirlLeague
  })
}

// קבוצות בליגה ספציפית
export async function teamsInLeague(leagueId) {
  const ts = await jget(`/teams?leagues=${leagueId}&per_page=100`)
  return (ts || []).map((t) => ({ id: t.id, title: title(t) })).filter((t) => t.title)
}

// ---- משחקים של הקבוצה/הליגה ----
export async function leagueGames(leagueId, teamId) {
  const q = teamId ? `teams=${teamId}` : `leagues=${leagueId}`
  const ev = await jget(`/events?${q}&per_page=100`)
  const vids = [...new Set((ev || []).flatMap((e) => e.venues || []))]
  const vmap = {}
  await Promise.all(
    vids.map(async (vid) => {
      try {
        const v = await jget(`/venues/${vid}`)
        vmap[vid] = title(v)
      } catch { /* venue optional */ }
    })
  )
  let myTail = ''
  if (teamId) {
    try {
      const me = await jget(`/teams/${teamId}`)
      myTail = title(me).split(' ').slice(-1)[0]
    } catch { /* ignore */ }
  }
  return (ev || [])
    .map((e) => {
      const t = clean(e.title?.rendered)
      const sides = t.split(/\s+[–—-]\s+/)
      const opp = sides.length === 2 ? sides.find((s) => myTail && !s.includes(myTail)) || sides[1] : t
      return {
        date: (e.date || '').split('T')[0],
        time: (e.date || '').split('T')[1]?.slice(0, 5) || '',
        opponent: (opp || '').trim(),
        location: (e.venues || []).map((v) => vmap[v]).filter(Boolean).join(', '),
      }
    })
    .filter((g) => g.date)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ---- טבלת הליגה (standings) — נבנית מנתונים חיים, מתעדכנת בכל טעינה ----
export async function leagueStandings(leagueId) {
  const tb = await jget(`/tables?leagues=${leagueId}&per_page=2`)
  const table = (tb || [])[0]
  if (!table || !table.data) return { hasTable: false, title: '', rows: [] }
  const rows = Object.entries(table.data)
    .filter(([k]) => k !== '0')
    .map(([id, v]) => ({
      id,
      pos: +v.pos || 0,
      name: clean(v.name),
      gp: +v.gp || 0,
      w: +v.w || 0,
      l: +v.l || 0,
      pts: +v.pts || 0,
      bf: +v.bf || 0,
      ba: +v.ba || 0,
      bd: +v.bd || 0,
    }))
    .sort((a, b) => a.pos - b.pos)
  return { hasTable: rows.length > 0, title: clean(table.title?.rendered), rows }
}
