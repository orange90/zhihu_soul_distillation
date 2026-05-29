-- 知识蒸馏馆 · Supabase schema
-- 在 Supabase SQL Editor 中执行

create table if not exists author_skills (
  author_id        text primary key,
  author_name      text not null,
  values           text,
  thinking_style   text,
  domain           text,
  signature_view   text,
  skill_markdown   text,
  skill_desc       text,
  raw_answers      jsonb,
  weight_score     numeric default 0,
  updated_at       timestamptz not null default now()
);

-- 已有部署追加列（幂等）：
alter table author_skills add column if not exists skill_markdown text;
alter table author_skills add column if not exists skill_desc text;

create index if not exists idx_author_skills_updated_at on author_skills (updated_at desc);

create table if not exists user_circles (
  user_id     text primary key,
  author_ids  text[] not null,
  persona     jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists opted_out_authors (
  author_id   text primary key,
  author_name text not null,
  created_at  timestamptz not null default now()
);

-- 浏览器插件上传的"自己的"原始答案。仅当 uploader_id == session.user_id 时由 /api/upload-answers 写入。
alter table author_skills add column if not exists source text default 'search';

create table if not exists user_uploaded_answers (
  uploader_id   text        not null,
  answer_id     text        not null,
  title         text,
  content       text        not null,
  excerpt       text,
  voteup_count  integer     default 0,
  url           text,
  kind          text        default 'answer',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (uploader_id, answer_id)
);

create index if not exists idx_uploaded_uploader on user_uploaded_answers (uploader_id);
create index if not exists idx_uploaded_voteup on user_uploaded_answers (uploader_id, voteup_count desc);

-- ============================================================
-- Part 1: Self-distillation management
-- ============================================================

-- Stores the result of a user's self-distillation (their AI persona)
create table if not exists user_distillation_results (
  user_id           text primary key,
  user_name         text,
  user_avatar       text,
  skill_markdown    text,
  skill_desc        text,
  rating            text,    -- '夯' / '人上人' / 'NPC' / '拉完了'
  rating_score      integer  default 0,
  answer_count      integer  default 0,
  distill_count     integer  default 0,
  last_distilled_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Tracks daily distillation usage (max 2 per user per day)
create table if not exists daily_distillation_log (
  id         uuid default gen_random_uuid() primary key,
  user_id    text not null,
  date_key   text not null,  -- 'YYYY-MM-DD'
  created_at timestamptz not null default now()
);
create index if not exists idx_daily_distill_user on daily_distillation_log (user_id, date_key);

-- ============================================================
-- Part 2: Arena (竞技场) mode
-- ============================================================

create table if not exists arena_topics (
  id                uuid    default gen_random_uuid() primary key,
  category          text    not null,   -- '人文' | '科技' | '教育' | '数码' | '生物科学'
  title             text    not null,
  affirmative_view  text    not null,
  negative_view     text    not null,
  week_key          text    not null,   -- 'YYYY-Www'
  status            text    not null default 'open',  -- 'open' | 'debating' | 'completed'
  debate_transcript jsonb,
  winner            text,               -- 'affirmative' | 'negative' | 'tie'
  ai_judgement      text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_arena_week on arena_topics (week_key);

create table if not exists arena_participants (
  id            uuid default gen_random_uuid() primary key,
  topic_id      uuid not null references arena_topics(id) on delete cascade,
  user_id       text not null,
  user_name     text not null,
  user_avatar   text,
  side          text not null,      -- 'affirmative' | 'negative'
  debater_pos   integer not null,   -- 1 | 2 | 3
  created_at    timestamptz not null default now(),
  unique (topic_id, user_id),
  unique (topic_id, side, debater_pos)
);
create index if not exists idx_arena_part_topic on arena_participants (topic_id);

-- Weekly points leaderboard
create table if not exists user_scores (
  user_id     text not null,
  user_name   text not null,
  user_avatar text,
  week_key    text not null,
  score       integer not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, week_key)
);
create index if not exists idx_scores_week on user_scores (week_key, score desc);

-- ============================================================
-- Part 3: Academic Bar (学术酒吧) mode
-- ============================================================

create table if not exists bar_topics (
  id         uuid default gen_random_uuid() primary key,
  topic      text not null,
  date_key   text not null unique,  -- 'YYYY-MM-DD'
  status     text not null default 'upcoming',  -- 'upcoming' | 'open' | 'active' | 'completed'
  ai_summary text,
  created_at timestamptz not null default now()
);
create index if not exists idx_bar_date on bar_topics (date_key);

create table if not exists bar_sessions (
  id            uuid default gen_random_uuid() primary key,
  topic_id      uuid not null references bar_topics(id) on delete cascade,
  user_id       text not null,
  user_name     text not null,
  user_avatar   text,
  table_num     integer not null,  -- 1-5
  seat_num      integer not null,  -- 1-6
  speech        text,
  generated_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (topic_id, user_id),
  unique (topic_id, table_num, seat_num)
);
create index if not exists idx_bar_sessions_topic on bar_sessions (topic_id);

-- Helper function to increment arena score (upsert + increment)
create or replace function increment_score(p_user_id text, p_week_key text)
returns void language plpgsql as $$
begin
  insert into user_scores (user_id, user_name, user_avatar, week_key, score, updated_at)
  values (p_user_id, '', null, p_week_key, 1, now())
  on conflict (user_id, week_key)
  do update set score = user_scores.score + 1, updated_at = now();
end;
$$;
