// Faux serveur Supabase pour tester l'interface sans internet.
// Il reproduit les règles de supabase/schema.sql (familles séparées, droits adulte/enfant, garde-fous).
const crypto = require('crypto');
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const uuid = () => crypto.randomUUID();

class FakeServer {
  constructor() {
    this.users = new Set(); this.links = {}; this.failures = {};
    this.t = { families: [], members: [], tasks: [], rewards: [], entries: [], redemptions: [] };
    this.objects = {};
  }
  me(uid) { return this.links[uid] || null; }
  isAdult(uid) { const l = this.me(uid); const m = l && this.t.members.find((x) => x.id === l.member_id); return !!m && m.role === 'adult'; }
  rls(msg) { return { error: { code: '42501', message: msg || 'new row violates row-level security policy' } }; }
  raise(msg) { return { error: { code: 'P0001', message: msg } }; }
  ok(data) { return { data: data === undefined ? null : data, error: null }; }

  handle(uid, op, a) {
    if (op === 'signup') { const u = uuid(); this.users.add(u); return { uid: u }; }
    if (!uid || !this.users.has(uid)) return { error: { code: 'not_signed_in', message: 'no session' } };
    if (op === 'table') return this.table(uid, a);
    if (op === 'rpc') return this.rpc(uid, a.n, a.a || {});
    return this.storage(uid, op, a);
  }

  select(uid, table) {
    const l = this.me(uid); if (!l) return [];
    if (table === 'member_users') return [{ member_id: l.member_id, family_id: l.family_id }];
    if (table === 'families') return this.isAdult(uid) ? this.t.families.filter((f) => f.id === l.family_id) : [];
    return this.t[table].filter((r) => r.family_id === l.family_id);
  }

  table(uid, a) {
    const { table, op } = a; const l = this.me(uid); const adult = this.isAdult(uid);
    if (op === 'select') {
      const rows = this.select(uid, table);
      return a.single ? this.ok(rows[0] || null) : this.ok(rows);
    }
    if (!l) return this.rls();
    const fam = l.family_id; const t = this.t[table];
    if (op === 'insert' || op === 'upsert') {
      const r = { ...a.payload };
      if (r.family_id !== fam) return this.rls();
      if (op === 'upsert' && t.find((x) => x.id === r.id)) return this.table(uid, { table, op: 'update', patch: r, eq: ['id', r.id], single: false });
      r.created_at = new Date().toISOString();
      if (table === 'members') {
        if (!adult) return this.rls();
        r.name = String(r.name).trim(); r.name_key = norm(r.name);
        if (t.some((x) => x.family_id === fam && x.name_key === r.name_key)) return this.raise('duplicate key value violates unique constraint "members_family_id_name_key_key"');
      } else if (table === 'tasks' || table === 'rewards') {
        if (!adult) return this.rls();
      } else if (table === 'entries') {
        if (!(adult || (r.member_id === l.member_id && r.status === 'pending'))) return this.rls();
        const mem = this.t.members.find((m) => m.id === r.member_id && m.family_id === fam); if (!mem) return this.raise('Membre inconnu.');
        r.created_by = l.member_id;
        if (adult) { if (r.status === 'approved') { r.decided_by = l.member_id; r.decided_at = new Date().toISOString(); } }
        else {
          const task = this.t.tasks.find((x) => x.id === r.task_id && x.family_id === fam);
          if (!task) return this.raise('Choisis une tâche de la liste.');
          if (!r.photo_path) return this.raise('Une photo est obligatoire.');
          r.label = task.label; r.points = task.points; r.status = 'pending';
        }
      } else if (table === 'redemptions') {
        if (!(adult || (r.member_id === l.member_id && r.status === 'pending'))) return this.rls();
        const rw = this.t.rewards.find((x) => x.id === r.reward_id && x.family_id === fam); if (!rw) return this.raise('Récompense inconnue.');
        r.label = rw.label; r.cost = rw.cost;
        const bal = this.balance(r.member_id); if (bal < rw.cost) return this.raise('Pas assez de points.');
        if (adult) { if (r.status === 'approved') { r.decided_by = l.member_id; r.decided_at = new Date().toISOString(); } } else r.status = 'pending';
      }
      t.push(r); return this.ok();
    }
    if (op === 'update') {
      if (!adult) return this.ok();
      const rows = t.filter((x) => x.family_id === fam && x[a.eq[0]] === a.eq[1]);
      for (const row of rows) {
        const p = a.patch;
        if (table === 'members') {
          if (p.role === 'child' && row.role === 'adult' && !t.some((x) => x.family_id === fam && x.role === 'adult' && x.id !== row.id)) return this.raise('Il faut garder au moins un adulte.');
          if (p.name !== undefined) { row.name = String(p.name).trim(); row.name_key = norm(row.name); }
          if (p.role) row.role = p.role;
        } else if (table === 'entries' || table === 'redemptions') {
          if (p.status && p.status !== row.status) { row.status = p.status; row.decided_by = l.member_id; row.decided_at = new Date().toISOString(); }
          if ('photo_path' in p) row.photo_path = p.photo_path;
        } else Object.assign(row, p, { id: row.id, family_id: fam });
      }
      return this.ok();
    }
    if (op === 'delete') {
      if (!adult) return this.ok();
      const rows = t.filter((x) => x.family_id === fam && x[a.eq[0]] === a.eq[1]);
      for (const row of rows) {
        if (table === 'members') {
          if (row.role === 'adult' && !t.some((x) => x.family_id === fam && x.role === 'adult' && x.id !== row.id)) return this.raise('Il faut garder au moins un adulte.');
          this.t.entries = this.t.entries.filter((e) => e.member_id !== row.id);
          this.t.redemptions = this.t.redemptions.filter((e) => e.member_id !== row.id);
          for (const k of Object.keys(this.links)) if (this.links[k].member_id === row.id) delete this.links[k];
        }
        this.t[table] = this.t[table].filter((x) => x !== row);
      }
      return this.ok();
    }
    return this.ok();
  }

  balance(mid) {
    const got = this.t.entries.filter((e) => e.member_id === mid && e.status === 'approved').reduce((s, e) => s + e.points, 0);
    const out = this.t.redemptions.filter((r) => r.member_id === mid && r.status !== 'rejected').reduce((s, r) => s + r.cost, 0);
    return got - out;
  }

  rpc(uid, name, a) {
    if (name === 'create_family') {
      const n = String(a.p_name || '').trim(); if (!n || n.length > 30) return this.raise('Entre ton prénom.');
      const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
      const f = { id: uuid(), code }; this.t.families.push(f);
      const m = { id: uuid(), family_id: f.id, name: n, name_key: norm(n), role: 'adult', hue: 0, created_at: new Date().toISOString() }; this.t.members.push(m);
      this.links[uid] = { member_id: m.id, family_id: f.id }; return this.ok(code);
    }
    if (name === 'join_family') {
      const fails = (this.failures[uid] = this.failures[uid] || []);
      if (fails.length >= 10) return this.ok({ ok: false, error: 'throttled' });
      const code = String(a.p_code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const f = this.t.families.find((x) => x.code === code);
      if (!f) { fails.push(Date.now()); return this.ok({ ok: false, error: 'bad_code' }); }
      const m = this.t.members.find((x) => x.family_id === f.id && x.name_key === norm(a.p_name));
      if (!m) return this.ok({ ok: false, error: 'no_profile' });
      this.links[uid] = { member_id: m.id, family_id: f.id }; return this.ok({ ok: true, member_id: m.id });
    }
    if (name === 'leave_family') { delete this.links[uid]; return this.ok(); }
    if (name === 'delete_family') {
      if (!this.isAdult(uid)) return this.raise('Réservé aux adultes.');
      const fam = this.me(uid).family_id;
      for (const k of Object.keys(this.t)) this.t[k] = this.t[k].filter((r) => (k === 'families' ? r.id !== fam : r.family_id !== fam));
      for (const k of Object.keys(this.links)) if (this.links[k].family_id === fam) delete this.links[k];
      for (const p of Object.keys(this.objects)) if (p.startsWith(fam + '/')) delete this.objects[p];
      return this.ok();
    }
    return this.raise('rpc inconnue');
  }

  storage(uid, op, a) {
    const l = this.me(uid); if (!l) return this.rls();
    const inFam = (p) => String(p).split('/')[0] === l.family_id;
    if (op === 'upload') { if (!inFam(a.p)) return this.rls(); this.objects[a.p] = a.d; return this.ok({ path: a.p }); }
    if (op === 'download') { if (!inFam(a.p) || !this.isAdult(uid) || !this.objects[a.p]) return { data: null, error: { message: 'Object not found' } }; return this.ok(this.objects[a.p]); }
    if (op === 'remove') { for (const p of a.ps) if (inFam(p)) delete this.objects[p]; return this.ok([]); }
    if (op === 'list') { if (!inFam(a.f) || !this.isAdult(uid)) return this.ok([]); return this.ok(Object.keys(this.objects).filter((p) => p.startsWith(a.f + '/')).map((p) => ({ name: p.split('/')[1] }))); }
    return this.ok();
  }
}

// Code injecté dans la page à la place de supabase-js.
const clientScript = `
(() => {
  const call = (op, args) => window.__srv(localStorage.getItem('fake_uid'), op, args);
  const b2d = (blob) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
  window.supabase = { createClient() {
    const auth = {
      getSession: async () => ({ data: { session: localStorage.getItem('fake_uid') ? {} : null }, error: null }),
      signInAnonymously: async () => { const r = await window.__srv(null, 'signup', {}); localStorage.setItem('fake_uid', r.uid); return { data: {}, error: null }; },
    };
    const qb = (table) => {
      const st = { table, op: 'select', eq: null, single: false, payload: null, patch: null };
      const q = {
        select() { return q; }, insert(r) { st.op = 'insert'; st.payload = r; return q; }, upsert(r) { st.op = 'upsert'; st.payload = r; return q; },
        update(p) { st.op = 'update'; st.patch = p; return q; }, delete() { st.op = 'delete'; return q; },
        eq(c, v) { st.eq = [c, v]; return q; }, maybeSingle() { st.single = true; return q; },
        then(res, rej) { return call('table', st).then(res, rej); },
      }; return q;
    };
    return { auth, from: qb, rpc: (n, a) => call('rpc', { n, a }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
      storage: { from: () => ({
        upload: async (p, blob) => call('upload', { p, d: await b2d(blob) }),
        download: async (p) => { const r = await call('download', { p }); if (r.error) return r; const blob = await (await fetch(r.data)).blob(); return { data: blob, error: null }; },
        remove: (ps) => call('remove', { ps }), list: (f) => call('list', { f }),
      }) } };
  } };
})();`;
module.exports = { FakeServer, clientScript };
