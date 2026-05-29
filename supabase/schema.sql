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
