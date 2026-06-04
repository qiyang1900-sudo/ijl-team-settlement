create table if not exists league_players (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique,
  reading text,
  position_label text,
  roster_role text,
  current_team_id uuid references teams(id) on delete set null,
  current_team_short_name text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists monthly_player_assignments (
  id uuid primary key default gen_random_uuid(),
  target_month text not null,
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references league_players(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_month, team_id, player_id)
);

revoke all privileges on table public.league_players from anon;
revoke all privileges on table public.league_players from authenticated;
grant select, insert, update, delete on table public.league_players to service_role;

revoke all privileges on table public.monthly_player_assignments from anon;
revoke all privileges on table public.monthly_player_assignments from authenticated;
grant select, insert, update, delete on table public.monthly_player_assignments to service_role;

alter table league_players enable row level security;
alter table monthly_player_assignments enable row level security;

drop policy if exists "league players are readable" on league_players;
create policy "league players are readable"
on league_players for select
using (true);

drop policy if exists "league players are writable" on league_players;
create policy "league players are writable"
on league_players for insert
with check (true);

drop policy if exists "league players are updatable" on league_players;
create policy "league players are updatable"
on league_players for update
using (true)
with check (true);

drop policy if exists "league players are deletable" on league_players;
create policy "league players are deletable"
on league_players for delete
using (true);

drop policy if exists "monthly player assignments are readable" on monthly_player_assignments;
create policy "monthly player assignments are readable"
on monthly_player_assignments for select
using (true);

drop policy if exists "monthly player assignments are writable" on monthly_player_assignments;
create policy "monthly player assignments are writable"
on monthly_player_assignments for insert
with check (true);

drop policy if exists "monthly player assignments are updatable" on monthly_player_assignments;
create policy "monthly player assignments are updatable"
on monthly_player_assignments for update
using (true)
with check (true);

drop policy if exists "monthly player assignments are deletable" on monthly_player_assignments;
create policy "monthly player assignments are deletable"
on monthly_player_assignments for delete
using (true);

with seed(team_short_name, handle, reading, position_label, roster_role, sort_order) as (
  values
    ('AWG', 'Aez', 'アエジ', '队员', '求生者', 101),
    ('AWG', 'batoru', 'バトル', '队员', '求生者', 102),
    ('AWG', 'Emmko', 'エムコ', '队员', '求生者', 103),
    ('AWG', 'Nameko', 'ナメコ', '队员', '求生者', 104),
    ('AWG', 'Scorpion', 'スコーピオン', '队员', '求生者', 105),
    ('AWG', 'yukakina', 'ユカキナ', '队长', '监管者', 106),
    ('AWG', 'yun', 'ユン', '队员', '监管者', 107),
    ('AWG', 'tai', 'タイ', '教练', '教练', 108),
    ('AXIZ', 'Atto', 'アット', '队员', '求生者', 201),
    ('AXIZ', 'monoP', 'モノピー', '队员', '求生者', 202),
    ('AXIZ', 'Nyan', 'ニャン', '队长', '求生者', 203),
    ('AXIZ', 'Takakou', 'タカコウ', '队员', '求生者', 204),
    ('AXIZ', 'Kakiri', 'カキリ', '队员', '监管者', 205),
    ('AXIZ', 'Toki', 'トキ', '教练', '教练', 206),
    ('DFM', 'Amand', 'アマンダ', '队员', '求生者', 301),
    ('DFM', 'Appai', 'アッパイ', '队员', '求生者', 302),
    ('DFM', 'Felix', 'フェリックス', '队长', '求生者', 303),
    ('DFM', 'Takoyaki', 'タコヤキ', '队员', '求生者', 304),
    ('DFM', 'vaNi', 'バニ', '队员', '求生者', 305),
    ('DFM', 'mzk', 'マジカ', '队员', '监管者', 306),
    ('DFM', 'Yami', 'ヤミ', '队员', '监管者', 307),
    ('DFM', 'Kokua', 'コクア', '教练', '教练', 308),
    ('FL', 'Katsuki', 'カツキ', '队员', '求生者', 401),
    ('FL', 'maeken', 'マエケン', '队长', '求生者', 402),
    ('FL', 'moririn', 'モリリン', '队员', '求生者', 403),
    ('FL', 'Sasori', 'サソリ', '队员', '求生者', 404),
    ('FL', 'Hasha', 'ハシャ', '队员', '监管者', 405),
    ('FL', 'PiPiCha', 'ピピチャ', '队员', '监管者', 406),
    ('FL', 'noNino', 'ノニノ', '教练', '教练', 407),
    ('QTD', 'Myme', 'マイミー', '队员', '求生者', 501),
    ('QTD', 'Pendk', 'ペンダコ', '队员', '求生者', 502),
    ('QTD', 'Terad', 'テラダ', '队员', '求生者', 503),
    ('QTD', 'yomi1', 'ヨミー', '队员', '求生者', 504),
    ('QTD', 'zizi', 'ジジ', '队长', '求生者', 505),
    ('QTD', 'Irohasu', 'イロハス', '队员', '监管者', 506),
    ('QTD', 'Kotami', 'コタミ', '队员', '监管者', 507),
    ('QTD', 'Kruger', 'クルーガー', '教练', '教练', 508),
    ('RC', 'City', 'シティ', '队员', '求生者', 601),
    ('RC', 'fuku', 'フクフク', '队员', '求生者', 602),
    ('RC', 'Unpyi', 'ユンピー', '队员', '求生者', 603),
    ('RC', 'Yougg', 'ヨウジージー', '队员', '求生者', 604),
    ('RC', 'AKa', 'アカ', '队员', '监管者', 605),
    ('RC', 'Alf', 'アルフ', '队长', '监管者', 606),
    ('RC', 'hhu', 'ハフウ', '教练', '教练', 607),
    ('SZ', '4ta5', 'シタゴ', '队员', '求生者', 701),
    ('SZ', 'mone', 'モネ', '队长', '求生者', 702),
    ('SZ', 'soar', 'ソーラ', '队员', '求生者', 703),
    ('SZ', 'tarako', 'タラコ', '队员', '求生者', 704),
    ('SZ', 'yora', 'ヨーラ', '队员', '求生者', 705),
    ('SZ', 'Burio', 'ブリオ', '队员', '监管者', 706),
    ('SZ', 'Latty', 'ラスティ', '队员', '监管者', 707),
    ('SZ', 'gnk', 'ゲンゲンキ', '教练', '教练', 708),
    ('ZETA', 'Alphar', 'アルファード', '队员', '求生者', 801),
    ('ZETA', 'DoLisu', 'ドリス', '队长', '求生者', 802),
    ('ZETA', 'Hametu', 'ハメツ', '队员', '求生者', 803),
    ('ZETA', 'Shinami', 'シナミ', '队员', '求生者', 804),
    ('ZETA', 'mkmldy', 'ミコメロディ', '队员', '监管者', 805),
    ('ZETA', 'Rose', 'ローズ', '队员', '监管者', 806),
    ('ZETA', 'MiraiK', 'ミライカン', '教练', '教练', 807)
)
insert into league_players (
  handle,
  reading,
  position_label,
  roster_role,
  current_team_id,
  current_team_short_name,
  sort_order,
  updated_at
)
select
  seed.handle,
  seed.reading,
  seed.position_label,
  seed.roster_role,
  teams.id,
  seed.team_short_name,
  seed.sort_order,
  now()
from seed
left join teams on teams.short_name = seed.team_short_name
on conflict (handle) do update set
  reading = excluded.reading,
  position_label = excluded.position_label,
  roster_role = excluded.roster_role,
  current_team_id = coalesce(league_players.current_team_id, excluded.current_team_id),
  current_team_short_name = coalesce(league_players.current_team_short_name, excluded.current_team_short_name),
  sort_order = excluded.sort_order,
  updated_at = now();
