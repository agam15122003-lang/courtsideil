import { chromium } from 'playwright'
const b = await chromium.launch()
// גם דסקטופ וגם «טאבלט שוכב» (1280x800 כמו הגאלאקסי)
for (const [w,h,tag] of [[1440,900,'desktop'],[1280,800,'tablet-land']]) {
  const ctx = await b.newContext({ viewport:{width:w,height:h}, locale:'he-IL', hasTouch:tag!=='desktop' })
  const p = await ctx.newPage()
  const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,150)))
  await p.goto('http://localhost:5200/tools/tutorial/harness/index.html', { waitUntil:'networkidle' })
  await p.waitForTimeout(1100)
  await p.evaluate(() => document.querySelector('[data-nav="work"]')?.click()); await p.waitForTimeout(1200)
  await p.evaluate(() => { const t=[...document.querySelectorAll('button,a')].find(e=>/תוכניות/.test(e.textContent||'')); t?.click() }); await p.waitForTimeout(1300)
  await p.evaluate(() => { const t=[...document.querySelectorAll('.coach-card button')].find(e=>e.textContent.trim()==='פתח כתוכנית'); t?.click() }); await p.waitForTimeout(1600)
  const m = await p.evaluate(() => ({
    bodyFocus: document.body.classList.contains('is-focus'),
    sidebarFixed: getComputedStyle(document.querySelector('.sidebar')).position === 'fixed',
    sidebarOff: document.querySelector('.sidebar').getBoundingClientRect().left >= window.innerWidth - 2,
    topbar: getComputedStyle(document.querySelector('.mobile-topbar')).display !== 'none',
  }))
  console.log(tag+':', JSON.stringify(m))
  // יציאה מהמסך מחזירה את הסרגל
  await p.evaluate(() => { const t=[...document.querySelectorAll('button')].find(e=>/כל התוכניות/.test(e.textContent)); t?.click() }); await p.waitForTimeout(1200)
  console.log('  אחרי יציאה — is-focus:', await p.evaluate(() => document.body.classList.contains('is-focus')),
              '| סרגל חזר:', await p.evaluate(() => getComputedStyle(document.querySelector('.sidebar')).position !== 'fixed'))
  if (errs.length) console.log('  errors:', errs)
  await ctx.close()
}
await b.close()
