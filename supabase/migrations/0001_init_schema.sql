-- REFERENCE ONLY. This schema is already applied to the hosted Supabase
-- project (migration `init_schema`). Do not run it against that project.

-- Households & membership
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members(user_id);

-- Family members who give scores (kids without login too)
create table public.people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  emoji text,
  color text,
  created_at timestamptz not null default now()
);
create index people_household_idx on public.people(household_id);

-- Shared TMDB cache
create table public.movies (
  tmdb_id integer primary key,
  title text not null,
  original_title text,
  year integer,
  poster_path text,
  genre_ids integer[] not null default '{}',
  runtime integer,
  certification_nl text,
  overview text,
  cached_at timestamptz not null default now()
);

-- Watch events
create table public.watches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  tmdb_id integer not null references public.movies(tmdb_id),
  watched_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index watches_household_idx on public.watches(household_id, watched_on desc);
create index watches_tmdb_idx on public.watches(tmdb_id);

-- Scores per person per watch
create table public.ratings (
  watch_id uuid not null references public.watches(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (watch_id, person_id)
);
create index ratings_person_idx on public.ratings(person_id);

-- Dismissed suggestions
create table public.dismissed (
  household_id uuid not null references public.households(id) on delete cascade,
  tmdb_id integer not null,
  created_at timestamptz not null default now(),
  primary key (household_id, tmdb_id)
);

-- Helper: is current user member of household
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid())
  );
$$;

-- Bootstrap: create household and add current user as member
create or replace function public.create_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  insert into public.households(name) values (household_name) returning id into new_id;
  insert into public.household_members(household_id, user_id) values (new_id, (select auth.uid()));
  return new_id;
end;
$$;

-- Keep-alive ping for the daily cron (anon may call)
create or replace function public.ping()
returns integer
language sql
stable
set search_path = ''
as $$ select 1; $$;

revoke execute on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;
revoke execute on function public.create_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.ping() to anon, authenticated;

-- RLS
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.people enable row level security;
alter table public.movies enable row level security;
alter table public.watches enable row level security;
alter table public.ratings enable row level security;
alter table public.dismissed enable row level security;

create policy "members read household" on public.households
  for select to authenticated using (public.is_household_member(id));
create policy "members update household" on public.households
  for update to authenticated using (public.is_household_member(id)) with check (public.is_household_member(id));

create policy "members read membership" on public.household_members
  for select to authenticated using (public.is_household_member(household_id));
create policy "members add members" on public.household_members
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "members remove members" on public.household_members
  for delete to authenticated using (public.is_household_member(household_id));

create policy "members manage people" on public.people
  for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

create policy "auth read movies" on public.movies
  for select to authenticated using (true);
create policy "auth insert movies" on public.movies
  for insert to authenticated with check (true);
create policy "auth update movies" on public.movies
  for update to authenticated using (true) with check (true);

create policy "members manage watches" on public.watches
  for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

create policy "members manage ratings" on public.ratings
  for all to authenticated
  using (exists (select 1 from public.watches w where w.id = watch_id and public.is_household_member(w.household_id)))
  with check (
    exists (select 1 from public.watches w where w.id = watch_id and public.is_household_member(w.household_id))
    and exists (select 1 from public.people p join public.watches w on w.household_id = p.household_id
                where p.id = person_id and w.id = watch_id)
  );

create policy "members manage dismissed" on public.dismissed
  for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
