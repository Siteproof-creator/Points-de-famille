-- Points de famille : base de données Supabase
-- À exécuter une seule fois (SQL Editor) sur un projet neuf.
-- Prérequis dans le tableau de bord : Authentication > Sign In / Providers > "Allow anonymous sign-ins" activé.

-- ============ Tables ============
create table public.families (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  name_key text not null,
  role text not null check (role in ('adult','child')),
  hue int not null default 0,
  created_at timestamptz not null default now(),
  unique (family_id, name_key)
);

-- Lie un appareil (utilisateur anonyme) à un profil de la famille.
create table public.member_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade
);
create index on public.member_users (member_id);
create index on public.member_users (family_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  points int not null check (points between 1 and 1000),
  created_at timestamptz not null default now()
);
create index on public.tasks (family_id);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  cost int not null check (cost between 1 and 100000),
  created_at timestamptz not null default now()
);
create index on public.rewards (family_id);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  points int not null check (points between -1000 and 1000 and points <> 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  photo_path text,
  created_by uuid references public.members(id) on delete set null,
  decided_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index on public.entries (family_id);
create index on public.entries (member_id);
create index on public.entries (task_id);
create index on public.entries (created_by);
create index on public.entries (decided_by);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  reward_id uuid references public.rewards(id) on delete set null,
  label text not null,
  cost int not null check (cost > 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index on public.redemptions (family_id);
create index on public.redemptions (member_id);
create index on public.redemptions (reward_id);
create index on public.redemptions (decided_by);

-- Essais ratés de code de famille (limite anti-devinette).
create table public.join_failures (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index on public.join_failures (user_id, created_at);

-- ============ Fonctions utilitaires ============
create or replace function public.norm_name(t text) returns text
language sql immutable set search_path = public as $$
  select translate(lower(btrim(regexp_replace(coalesce(t,''), '\s+', ' ', 'g'))),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ', 'aaaaaaceeeeiiiinooooouuuuyyoa')
$$;

create or replace function public.my_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select member_id from public.member_users where user_id = auth.uid()
$$;

create or replace function public.my_family_id() returns uuid
language sql stable security definer set search_path = public as $$
  select family_id from public.member_users where user_id = auth.uid()
$$;

create or replace function public.i_am_adult() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.member_users u join public.members m on m.id = u.member_id
    where u.user_id = auth.uid() and m.role = 'adult')
$$;

-- ============ Garde-fous (triggers) ============
create or replace function public.members_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'adult'
       and exists (select 1 from public.families where id = old.family_id)
       and not exists (select 1 from public.members where family_id = old.family_id and role = 'adult' and id <> old.id) then
      raise exception 'Il faut garder au moins un adulte.';
    end if;
    return old;
  end if;
  new.name := btrim(new.name);
  new.name_key := public.norm_name(new.name);
  if tg_op = 'UPDATE' then
    new.family_id := old.family_id;
    if old.role = 'adult' and new.role = 'child'
       and not exists (select 1 from public.members where family_id = old.family_id and role = 'adult' and id <> old.id) then
      raise exception 'Il faut garder au moins un adulte.';
    end if;
  end if;
  return new;
end $$;
create trigger members_before_write before insert or update or delete on public.members
  for each row execute function public.members_before_write();

create or replace function public.entries_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare t public.tasks%rowtype;
begin
  if not exists (select 1 from public.members where id = new.member_id and family_id = new.family_id) then
    raise exception 'Membre inconnu.';
  end if;
  new.created_by := public.my_member_id();
  if public.i_am_adult() then
    if new.status = 'approved' then
      new.decided_by := new.created_by; new.decided_at := now();
    end if;
  else
    -- Un enfant ne choisit que dans la liste des tâches ; les points viennent de la tâche.
    select * into t from public.tasks where id = new.task_id and family_id = new.family_id;
    if not found then raise exception 'Choisis une tâche de la liste.'; end if;
    if new.photo_path is null then raise exception 'Une photo est obligatoire.'; end if;
    new.label := t.label; new.points := t.points;
    new.status := 'pending'; new.decided_by := null; new.decided_at := null;
  end if;
  return new;
end $$;
create trigger entries_before_insert before insert on public.entries
  for each row execute function public.entries_before_insert();

create or replace function public.entries_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.family_id := old.family_id; new.member_id := old.member_id;
  new.points := old.points; new.label := old.label; new.created_by := old.created_by;
  if new.status <> old.status then
    new.decided_by := public.my_member_id(); new.decided_at := now();
  end if;
  return new;
end $$;
create trigger entries_before_update before update on public.entries
  for each row execute function public.entries_before_update();

create or replace function public.redemptions_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.rewards%rowtype; bal int;
begin
  if not exists (select 1 from public.members where id = new.member_id and family_id = new.family_id) then
    raise exception 'Membre inconnu.';
  end if;
  select * into r from public.rewards where id = new.reward_id and family_id = new.family_id;
  if not found then raise exception 'Récompense inconnue.'; end if;
  new.label := r.label; new.cost := r.cost;
  bal := coalesce((select sum(points) from public.entries where member_id = new.member_id and status = 'approved'), 0)
       - coalesce((select sum(cost) from public.redemptions where member_id = new.member_id and status <> 'rejected'), 0);
  if bal < r.cost then raise exception 'Pas assez de points.'; end if;
  if public.i_am_adult() then
    if new.status = 'approved' then new.decided_by := public.my_member_id(); new.decided_at := now(); end if;
  else
    new.status := 'pending'; new.decided_by := null; new.decided_at := null;
  end if;
  return new;
end $$;
create trigger redemptions_before_insert before insert on public.redemptions
  for each row execute function public.redemptions_before_insert();

create or replace function public.redemptions_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.family_id := old.family_id; new.member_id := old.member_id;
  new.cost := old.cost; new.label := old.label; new.reward_id := old.reward_id;
  if new.status <> old.status then
    new.decided_by := public.my_member_id(); new.decided_at := now();
  end if;
  return new;
end $$;
create trigger redemptions_before_update before update on public.redemptions
  for each row execute function public.redemptions_before_update();

-- ============ Sécurité (RLS) : chaque famille ne voit que ses données ============
alter table public.families     enable row level security;
alter table public.members      enable row level security;
alter table public.member_users enable row level security;
alter table public.tasks        enable row level security;
alter table public.rewards      enable row level security;
alter table public.entries      enable row level security;
alter table public.redemptions  enable row level security;
alter table public.join_failures enable row level security;

create policy families_select on public.families for select to authenticated
  using (id = public.my_family_id() and public.i_am_adult());

create policy member_users_select on public.member_users for select to authenticated
  using (user_id = (select auth.uid()));

create policy members_select on public.members for select to authenticated using (family_id = public.my_family_id());
create policy members_insert on public.members for insert to authenticated
  with check (family_id = public.my_family_id() and public.i_am_adult());
create policy members_update on public.members for update to authenticated
  using (family_id = public.my_family_id() and public.i_am_adult())
  with check (family_id = public.my_family_id() and public.i_am_adult());
create policy members_delete on public.members for delete to authenticated
  using (family_id = public.my_family_id() and public.i_am_adult());

create policy tasks_select on public.tasks for select to authenticated using (family_id = public.my_family_id());
create policy tasks_insert on public.tasks for insert to authenticated
  with check (family_id = public.my_family_id() and public.i_am_adult());
create policy tasks_update on public.tasks for update to authenticated
  using (family_id = public.my_family_id() and public.i_am_adult())
  with check (family_id = public.my_family_id() and public.i_am_adult());
create policy tasks_delete on public.tasks for delete to authenticated
  using (family_id = public.my_family_id() and public.i_am_adult());

create policy rewards_select on public.rewards for select to authenticated using (family_id = public.my_family_id());
create policy rewards_insert on public.rewards for insert to authenticated
  with check (family_id = public.my_family_id() and public.i_am_adult());
create policy rewards_update on public.rewards for update to authenticated
  using (family_id = public.my_family_id() and public.i_am_adult())
  with check (family_id = public.my_family_id() and public.i_am_adult());
create policy rewards_delete on public.rewards for delete to authenticated
  using (family_id = public.my_family_id() and public.i_am_adult());

create policy entries_select on public.entries for select to authenticated using (family_id = public.my_family_id());
create policy entries_insert on public.entries for insert to authenticated
  with check (family_id = public.my_family_id()
    and (public.i_am_adult() or (member_id = public.my_member_id() and status = 'pending')));
create policy entries_update on public.entries for update to authenticated
  using (family_id = public.my_family_id() and public.i_am_adult())
  with check (family_id = public.my_family_id() and public.i_am_adult());
create policy entries_delete on public.entries for delete to authenticated
  using (family_id = public.my_family_id() and public.i_am_adult());

create policy redemptions_select on public.redemptions for select to authenticated using (family_id = public.my_family_id());
create policy redemptions_insert on public.redemptions for insert to authenticated
  with check (family_id = public.my_family_id()
    and (public.i_am_adult() or (member_id = public.my_member_id() and status = 'pending')));
create policy redemptions_update on public.redemptions for update to authenticated
  using (family_id = public.my_family_id() and public.i_am_adult())
  with check (family_id = public.my_family_id() and public.i_am_adult());
create policy redemptions_delete on public.redemptions for delete to authenticated
  using (family_id = public.my_family_id() and public.i_am_adult());

-- ============ Fonctions appelées par l'application ============
create or replace function public.create_family(p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_fam uuid; v_mem uuid; v_code text; i int;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_uid is null then raise exception 'Non connecté.'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 30 then raise exception 'Entre ton prénom.'; end if;
  loop
    v_code := '';
    for i in 1..6 loop v_code := v_code || substr(alphabet, 1 + floor(random() * 32)::int, 1); end loop;
    exit when not exists (select 1 from public.families f where f.code = v_code);
  end loop;
  insert into public.families (code) values (v_code) returning id into v_fam;
  insert into public.members (family_id, name, role, hue) values (v_fam, p_name, 'adult', 0) returning id into v_mem;
  insert into public.member_users (user_id, member_id, family_id) values (v_uid, v_mem, v_fam)
    on conflict (user_id) do update set member_id = excluded.member_id, family_id = excluded.family_id;
  return v_code;
end $$;

create or replace function public.join_family(p_name text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_fam public.families%rowtype; v_mem public.members%rowtype; v_fails int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  delete from public.join_failures where created_at < now() - interval '1 day';
  select count(*) into v_fails from public.join_failures where user_id = v_uid and created_at > now() - interval '10 minutes';
  if v_fails >= 10 then return jsonb_build_object('ok', false, 'error', 'throttled'); end if;
  select * into v_fam from public.families
    where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if not found then
    insert into public.join_failures (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'bad_code');
  end if;
  select * into v_mem from public.members where family_id = v_fam.id and name_key = public.norm_name(p_name);
  if not found then return jsonb_build_object('ok', false, 'error', 'no_profile'); end if;
  insert into public.member_users (user_id, member_id, family_id) values (v_uid, v_mem.id, v_fam.id)
    on conflict (user_id) do update set member_id = excluded.member_id, family_id = excluded.family_id;
  return jsonb_build_object('ok', true, 'member_id', v_mem.id);
end $$;

create or replace function public.leave_family() returns void
language sql security definer set search_path = public as $$
  delete from public.member_users where user_id = auth.uid()
$$;

-- Supprime toute la famille et ses données (demandé par Apple pour la suppression de compte).
create or replace function public.delete_family() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.i_am_adult() then raise exception 'Réservé aux adultes.'; end if;
  delete from public.families where id = public.my_family_id();
end $$;

revoke all on function public.create_family(text), public.join_family(text, text),
  public.leave_family(), public.delete_family() from public, anon;
grant execute on function public.create_family(text), public.join_family(text, text),
  public.leave_family(), public.delete_family() to authenticated;
revoke all on function public.my_member_id(), public.my_family_id(), public.i_am_adult() from public, anon;
grant execute on function public.my_member_id(), public.my_family_id(), public.i_am_adult() to authenticated;

revoke all on function public.members_before_write(), public.entries_before_insert(), public.entries_before_update(),
  public.redemptions_before_insert(), public.redemptions_before_update() from public, anon, authenticated;

-- ============ Photos (stockage privé, un dossier par famille) ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_family_id()::text);
create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_family_id()::text and public.i_am_adult());
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_family_id()::text
         and (public.i_am_adult() or owner_id = (select auth.uid())::text));

-- ============ Synchronisation en direct entre appareils ============
alter publication supabase_realtime add table public.members, public.tasks, public.rewards, public.entries, public.redemptions;
