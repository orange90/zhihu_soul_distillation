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
