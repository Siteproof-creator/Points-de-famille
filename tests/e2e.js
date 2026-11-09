// Parcours complets de l'application avec un faux Supabase (aucun accès internet nécessaire).
// Lancer :  node tests/e2e.js     (nécessite : npm i -D playwright, puis npx playwright install chromium)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { FakeServer, clientScript } = require('./fake-supabase');

const WWW = path.join(__dirname, '..', 'www');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const results = []; let failed = 0;
const check = (name, ok, extra) => { results.push((ok ? 'OK   ' : 'FAIL ') + name + (ok ? '' : '  -> ' + (extra || ''))); if (!ok) failed++; };

(async () => {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(WWW, p);
    if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  }).listen(0);
  const url = 'http://localhost:' + server.address().port + '/';
  const fake = new FakeServer();
  const browser = await chromium.launch();
  const errors = [];
  async function device(name) {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 820 }, serviceWorkers: 'block' });
    await ctx.exposeFunction('__srv', (uid, op, a) => fake.handle(uid, op, a));
    await ctx.addInitScript(clientScript);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    await page.goto(url); return page;
  }
  const refresh = async (p) => { await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await p.waitForTimeout(500); };
  const text = async (p, sel) => (await p.textContent(sel)) || '';
  const submitSheet = async (p) => { await p.click('#sheetRoot button[type=submit]'); await p.waitForTimeout(500); };

  // ---- Maman crée la famille
  const mom = await device('maman');
  await mom.waitForSelector('[data-act=welcome]');
  check('écran d’accueil : rejoindre / créer', (await text(mom, '.intro')).includes('Rejoindre'));
  await mom.click('[data-act=welcome][data-m=create]');
  await mom.fill('#f-name', 'Maman'); await mom.click('button[type=submit]');
  await mom.waitForSelector('.codebig');
  const code = (await text(mom, '.codebig')).trim();
  check('le code de famille s’affiche (ABC-123)', /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(code), code);
  // membres
  await mom.click('[data-act=addMember]'); await mom.fill('#f-name', 'Léo'); await submitSheet(mom);
  await mom.click('[data-act=addMember]'); await mom.fill('#f-name', 'Amandine'); await mom.check('input[name=role][value=adult]', { force: true }); await submitSheet(mom);
  await mom.click('[data-act=addMember]'); await mom.fill('#f-name', 'leo'); await submitSheet(mom);
  check('doublon de prénom refusé', (await text(mom, '#err')).length > 0 || (await mom.textContent('#toast')).length > 0);
  await mom.click('[data-act=closeSheet] >> nth=1').catch(() => {});
  await mom.keyboard.press('Escape');
  // tâches + récompense
  for (const [l, p] of [['Ranger sa chambre', 5], ['Mettre la table', 3], ['Sortir les poubelles', 4]]) {
    await mom.click('[data-act=taskEdit]:not([data-id])'); await mom.fill('#f-label', l); await mom.fill('#f-pts', String(p)); await submitSheet(mom);
  }
  check('3 tâches créées', fake.t.tasks.length === 3, fake.t.tasks.length);
  await mom.click('[data-tab=rewards]'); await mom.click('[data-act=rewardEdit]');
  await mom.fill('#f-label', 'Film du soir'); await mom.fill('#f-cost', '10'); await submitSheet(mom);
  check('récompense créée', fake.t.rewards.length === 1);
  await mom.screenshot({ path: path.join(__dirname, 'out-rewards-adult.png') });

  // ---- Léo rejoint
  const kid = await device('leo');
  await kid.waitForSelector('#f-code');
  await kid.fill('#f-name', 'LÉO'); await kid.fill('#f-code', 'zzz-999'); await kid.click('button[type=submit]'); await kid.waitForTimeout(400);
  check('mauvais code refusé', (await text(kid, '#err')).includes('incorrect'));
  await kid.fill('#f-name', 'Inconnu'); await kid.fill('#f-code', code.toLowerCase()); await kid.click('button[type=submit]'); await kid.waitForTimeout(400);
  check('prénom inconnu refusé', (await text(kid, '#err')).includes('Aucun profil'));
  await kid.fill('#f-name', 'LÉO'); await kid.fill('#f-code', code.toLowerCase()); await kid.click('button[type=submit]');
  await kid.waitForSelector('.hero');
  check('Léo arrive avec le rôle enfant (pas d’onglet À valider)', (await kid.locator('[data-tab=approve]').count()) === 0 && (await text(kid, '.hi')).includes('Léo'));
  await kid.reload(); await kid.waitForSelector('.hero');
  check('connexion mémorisée après rechargement', (await text(kid, '.hi')).includes('Léo'));
  // Léo envoie une tâche
  await kid.click('[data-act=openEarn]');
  check('l’enfant choisit parmi les tâches des adultes', (await kid.locator('.taskopt').count()) === 3 && (await kid.locator('#sheetRoot input[type=text],#sheetRoot input[type=number]').count()) === 0);
  await kid.click('#sheetRoot button[type=submit]'); await kid.waitForTimeout(200);
  check('tâche obligatoire', (await text(kid, '#err')).includes('tâche'));
  await kid.check('input[name=task]', { force: true }); await kid.click('#sheetRoot button[type=submit]'); await kid.waitForTimeout(200);
  check('photo obligatoire', (await text(kid, '#err')).includes('photo'));
  await kid.setInputFiles('#f-photo', { name: 'p.png', mimeType: 'image/png', buffer: PNG }); await kid.waitForTimeout(500);
  await kid.screenshot({ path: path.join(__dirname, 'out-kid-earn.png') });
  await kid.click('#sheetRoot button[type=submit]'); await kid.waitForTimeout(700);
  const e0 = fake.t.entries[0];
  check('demande envoyée en attente, points et nom pris de la tâche', !!e0 && e0.status === 'pending' && e0.points === 3 && e0.label === 'Mettre la table', JSON.stringify(e0));
  check('photo enregistrée dans le stockage', Object.keys(fake.objects).length === 1);

  // ---- Maman valide
  await refresh(mom); await mom.click('[data-tab=approve]');
  await mom.waitForSelector('.phbox img', { timeout: 5000 });
  check('l’adulte voit la photo', true);
  await mom.screenshot({ path: path.join(__dirname, 'out-approve.png') });
  const pts = fake.t.entries[0].points;
  await mom.click('[data-act=decide][data-v=approved]'); await mom.waitForTimeout(700);
  check('validation : points comptés', fake.t.entries[0].status === 'approved');
  check('photo supprimée après décision', Object.keys(fake.objects).length === 0);
  await refresh(kid);
  check('Léo voit ses points', (await text(kid, '.big')).trim() === String(pts), await text(kid, '.big'));

  // ---- Récompense
  await kid.click('[data-tab=rewards]');
  check('récompense trop chère : encore X points', (await text(kid, '.reward')).includes('Encore'));
  await mom.click('[data-tab=home]'); await mom.click('.mrow:has-text("Léo") [data-act=adjust][data-sign="1"]');
  await mom.fill('#f-pts', '10'); await mom.fill('#f-label', 'Bonus'); await submitSheet(mom);
  check('l’adulte ajoute des points directement', fake.t.entries.some((e) => e.label === 'Bonus' && e.status === 'approved'));
  await refresh(kid); await kid.click('[data-act=redeemAsk]'); await kid.click('[data-act=redeemGo]'); await kid.waitForTimeout(600);
  check('l’enfant demande la récompense (en attente)', fake.t.redemptions[0] && fake.t.redemptions[0].status === 'pending');
  await refresh(mom); await mom.click('[data-tab=approve]');
  await mom.click('[data-act=decide][data-kind=redemptions][data-v=approved]'); await mom.waitForTimeout(600);
  check('l’adulte valide la récompense', fake.t.redemptions[0].status === 'approved');
  await refresh(kid); await kid.click('[data-tab=home]');
  check('solde de Léo après récompense', (await text(kid, '.big')).trim() === String(pts + 10 - 10), await text(kid, '.big'));

  // ---- Classement
  await kid.click('[data-tab=rank]');
  check('classement avec « (toi) »', (await text(kid, '.rname >> nth=0') + (await kid.content())).includes('(toi)'));
  await kid.click('[data-act=rank][data-p=all]');
  check('classement : période Total', (await text(kid, '.card')).includes('depuis le début'));

  // ---- Amandine (adulte)
  const ama = await device('amandine');
  await ama.fill('#f-name', 'amandine'); await ama.fill('#f-code', code); await ama.click('button[type=submit]');
  await ama.waitForSelector('.topbar');
  check('Amandine arrive avec le rôle adulte', (await ama.locator('[data-tab=approve]').count()) === 1 && (await ama.locator('[data-tab=family]').count()) === 1);

  // ---- Rôle et garde-fous
  await mom.click('[data-tab=family]'); await mom.click('.mrow:has-text("Amandine") [data-act=editMember]');
  await mom.check('input[name=role][value=child]', { force: true }); await submitSheet(mom);
  check('l’adulte peut changer un rôle', fake.t.members.find((m) => m.name === 'Amandine').role === 'child');
  await mom.click('.mrow:has-text("Maman") [data-act=editMember]'); await mom.check('input[name=role][value=child]', { force: true }); await submitSheet(mom);
  check('on ne peut pas retirer le rôle adulte à soi-même', fake.t.members.find((m) => m.name === 'Maman').role === 'adult');
  await mom.keyboard.press('Escape');

  // ---- Quitter puis rejoindre
  await kid.click('[data-act=logout]'); await kid.waitForSelector('#f-code');
  check('quitter ramène à l’accueil', true);
  await kid.fill('#f-name', 'Léo'); await kid.fill('#f-code', code); await kid.click('button[type=submit]'); await kid.waitForSelector('.hero');
  check('on peut rejoindre à nouveau', (await text(kid, '.hi')).includes('Léo'));

  // ---- Supprimer un membre
  await mom.click('.mrow:has-text("Amandine") [data-act=editMember]'); await mom.click('[data-act=delaskThing]'); await mom.click('[data-act=memberDelGo]'); await mom.waitForTimeout(600);
  check('suppression d’un membre', !fake.t.members.some((m) => m.name === 'Amandine'));

  // ---- Supprimer la famille
  await mom.screenshot({ path: path.join(__dirname, 'out-family.png') });
  await mom.click('[data-act=deleteFamilyAsk]'); await mom.fill('#f-confirm', 'oups'); await submitSheet(mom);
  check('suppression demande la confirmation', fake.t.families.length === 1);
  await mom.fill('#f-confirm', 'supprimer'); await submitSheet(mom);
  check('famille supprimée avec ses données', fake.t.families.length === 0 && fake.t.members.length === 0 && fake.t.entries.length === 0);
  check('retour à l’écran d’accueil', await mom.locator('[data-act=welcome]').count() === 2);
  await refresh(kid);
  check('l’appareil de Léo revient à l’accueil après suppression', await kid.locator('#f-code').count() === 1);

  check('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(results.join('\n')); console.log(failed ? `\n${failed} test(s) en échec` : '\nTous les tests passent');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(results.join('\n')); console.error('ERREUR TEST:', e.message); process.exit(2); });
