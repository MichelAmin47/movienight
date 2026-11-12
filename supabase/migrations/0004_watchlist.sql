-- REFERENCE ONLY. Already applied to the hosted Supabase project; do not run it.

-- Movies the household still wants to watch ("Willen we zien").
create table public.watchlist (
  household_id uuid not null references public.households(id) on delete cascade,
  tmdb_id integer not null references public.movies(tmdb_id),
  added_at timestamptz not null default now(),
  note text,
  primary key (household_id, tmdb_id)
);

create index watchlist_household_added_idx on public.watchlist (household_id, added_at desc);
create index watchlist_tmdb_id_idx on public.watchlist (tmdb_id);

alter table public.watchlist enable row level security;

create policy "members manage watchlist" on public.watchlist
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
