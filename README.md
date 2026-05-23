# 知识蒸馏馆 · zhihu_soul_distillation

> 把你在知乎关注的那些人，蒸馏成一个可以对话的集体智慧体——
> 也可以让他们就同一个话题互相辩论，自动呈现共识与分歧。
> 知乎 Hackathon 2026 · 引力场赛道 · 单人项目。

## 技术栈

- 前端：React 18 + Vite + TypeScript + Tailwind CSS（知乎蓝风格）
- 后端：Vercel Serverless Functions（`api/*.ts`）
- 数据 & 缓存：Supabase（Postgres）
- AI：OpenAI 兼容的大模型 `/v1/chat/completions`（默认 OpenAI，可自定义 `LLM_BASE_URL`）
- 身份：知乎 OAuth（`HttpOnly` Cookie Session）

## 目录结构

```
api/                         Vercel Serverless Functions
  _lib/
    zhihu.ts                 知乎 OAuth / 多源搜索（Dev API + OpenAPI + Tavily + v4 充实）+ LLM 封装
    supabase.ts              Supabase 客户端 + 30 天 TTL
    session.ts               HMAC 签名 Cookie Session
    http.ts                  统一 JSON 响应
    types.ts                 共享类型
  auth/login.ts              302 跳转到知乎 OAuth
  auth/callback.ts           OAuth 回调 + 写 Session
  auth/me.ts                 查询当前登录态
  auth/logout.ts             清除 Session
  following.ts               拉取关注列表
  distill.ts                 逐个提炼答主 skills（带 Supabase 跨用户缓存）
  persona.ts                 加权融合生成集体人格
  chat.ts                    两种模式合一：mode='collective' 集体人格回答 / mode='debate' 多答主辩论
src/
  pages/                     HomePage / SelectPage / LoadingPage / ResultPage / DebatePage
  components/Layout.tsx      顶部导航 + 底部页脚
  lib/api.ts                 前端 API 客户端
  lib/storage.ts             localStorage 轻量缓存
supabase/schema.sql          建表 SQL
vercel.json                  Vercel 部署配置
.env.example                 环境变量样例
```

## 本地开发

1. 安装依赖

   ```bash
   npm install
   ```

2. 复制 `.env.example` 为 `.env.local` 并填入密钥：

   ```bash
   cp .env.example .env.local
   ```

   关键变量：
   - `ZHIHU_APP_ID` / `ZHIHU_OAUTH_APP_KEY`：知乎开放平台 OAuth 凭证
   - `ZHIHU_APP_KEY` / `ZHIHU_APP_SECRET`：HMAC-SHA256 签名鉴权（旧 HMAC 接入）
   - `ZHIHU_REDIRECT_URI`：OAuth 回调（本地：`http://localhost:3000/api/auth/callback`）
   - `TAVILY_API_KEY`：Tavily 搜索 API（可选，提升答主回答发现率）
   - `SERP_API_KEY`：SerpAPI 搜索（可选，Tavily 的备选方案）
   - `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`：OpenAI 兼容大模型配置
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`：Supabase 服务端凭证
   - `SESSION_SECRET`：任意强随机串，用于签名 Session Cookie

3. 在 Supabase SQL Editor 中执行 `supabase/schema.sql` 建表。

4. 一体化本地开发（需 Vercel CLI）：

   ```bash
   npm i -g vercel
   vercel dev
   ```

   或仅跑前端：

   ```bash
   npm run dev
   ```

## 部署（Vercel）

1. 将仓库导入 Vercel，Framework 会自动识别为 Vite。
2. Project Settings → Environment Variables 添加 `.env.example` 中的全部变量（生产环境的 `ZHIHU_REDIRECT_URI` 需改为 `https://<your-app>.vercel.app/api/auth/callback`）。
3. 在知乎开放平台对应应用的 **授权回调** 中，加入上面的生产回调地址。

## 核心数据流

```
用户 OAuth 登录
   ↓
/api/following 拉关注列表 → /select 勾选最多 5 人
   ↓
/api/distill：对每位答主
   - 查 author_skills 是否命中（TTL 30 天）
   - 未命中 → 多源搜索（知乎 API + OpenAPI + Tavily/SerpAPI）top 25
     → 去重 + 作者名边界匹配过滤 → 知乎 v4 API 内容充实
     → 取 top 8 → 通用 LLM 提炼 JSON → upsert
   ↓
/api/persona：加权融合 5 人 skills → 生成集体人格 → upsert user_circles
   ↓
前端渲染人格卡片 + 对话框
   ↓
/api/chat：注入集体人格 System Prompt → 通用 LLM 返回带引用回复
```

## 跨用户 skills 共享缓存

`author_skills` 以 `author_id` 为主键，所有用户共享。热门答主在被第一位用户蒸馏后，后续其他用户的同名选择可直接命中缓存，显著降低搜索 / AI 配额消耗。


