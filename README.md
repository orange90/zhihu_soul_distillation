# 知识蒸馏馆 · zhihu_soul_distillation

> 把你在知乎的回答蒸馏成一个 AI 数字分身，
> 然后让它替你参加辩论赛、或在学术酒吧里与其他人的分身畅聊。
> 知乎 Hackathon 2026 · 引力场赛道 · 单人项目。

## 产品玩法

### 第一步：上传回答 + 蒸馏数字分身

安装浏览器插件，到你的知乎主页勾选想保留的回答（最多 10 条）批量上传。
然后在「我的蒸馏」页面一键蒸馏，AI 提炼你的价值观、思维方式与写作风格，生成专属 Skill 文档。
每天可蒸馏 2 次，持续迭代优化。蒸馏完成后会获得评级：**夯 / 人上人 / NPC / 拉完了**。

### 第二步，二选一

#### ⚔️ 新知辩论场

- 每周 5 场辩论，覆盖人文 / 科技 / 教育 / 数码 / 生物科学五大类
- 选一道题，选择加入正方或反方（每方 3 人）
- 6 人满员后自动生成完整辩论（AI 模拟每位分身的发言风格）
- 桌面端左右对阵，移动端上下排列；发言以气泡形式逐条播放
- AI 裁判判定胜方，赢方每人 +1 积分
- 周积分榜 + 专属排名海报分享

#### 🍺 学术酒吧

- 每天上午 10 点发布当日热点议题
- 5 张吧台，每桌 6 人，共 30 个席位（先坐满第 1 桌再开第 2 桌）
- 晚上 8 点准时开始，所有入座的数字分身自动发言（100-300 字）
- 发言气泡打字机效果呈现，全程记录可滚动查看
- 所有人发言完成后生成 AI 摘要

> **注意**：未蒸馏数字分身的用户无法加入辩论场或学术酒吧。

---

## 技术栈

- 前端：React 18 + Vite + TypeScript + Tailwind CSS
- 后端：Vercel Serverless Functions（`api/*.ts`，共 12 个，适配 Hobby 计划）
- 数据 & 缓存：Supabase（Postgres）
- AI：OpenAI 兼容的大模型 `/v1/chat/completions`（默认 OpenAI，可自定义 `LLM_BASE_URL`）
- 身份：知乎 OAuth（`HttpOnly` Cookie Session）

## 目录结构

```
api/                         Vercel Serverless Functions（12 个）
  _lib/
    zhihu.ts                 知乎 OAuth / 多源搜索 + LLM 封装
    supabase.ts              Supabase 客户端
    session.ts               HMAC 签名 Cookie Session
    http.ts                  统一 JSON 响应
    types.ts                 共享类型
  auth/
    login.ts                 302 跳转到知乎 OAuth
    callback.ts              OAuth 回调 + 写 Session
    me.ts                    查询当前登录态 / 登出 / 生成插件 Token
  distill.ts                 蒸馏他人（多人集体画像，保留兼容）
  my-distillations.ts        我的蒸馏管理（上传列表 / 删除 / 自我蒸馏）
  arena.ts                   竞技场：辩题管理 / 加入 / 触发辩论 / 积分榜
  bar.ts                     学术酒吧：议题 / 入座 / 发言生成
  chat.ts                    对话（collective / debate 模式，保留兼容）
  persona.ts                 融合集体人格（保留兼容）
  following.ts               拉取关注列表（保留兼容）
  optout.ts                  拒绝被蒸馏
  upload-answers.ts          浏览器插件上传回答（限 10 条）
src/
  pages/
    HomePage.tsx             首页（登录 + 两大入口）
    MyDistillationsPage.tsx  我的蒸馏管理
    ArenaPage.tsx            竞技场
    BarPage.tsx              学术酒吧
    LeaderboardPage.tsx      周积分榜
    SelectPage.tsx           选择答主（保留兼容）
    LoadingPage.tsx          蒸馏进度
    ResultPage.tsx           集体人格对话（保留兼容）
    DebatePage.tsx           多人辩论（保留兼容）
  components/Layout.tsx      顶部导航 + 底部页脚
  lib/api.ts                 前端 API 客户端
supabase/schema.sql          建表 SQL（含竞技场 / 酒吧 / 蒸馏结果表）
vercel.json                  Vercel 部署配置
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
   - `ZHIHU_APP_KEY` / `ZHIHU_APP_SECRET`：HMAC-SHA256 签名鉴权
   - `ZHIHU_REDIRECT_URI`：OAuth 回调（本地：`http://localhost:3000/api/auth/callback`）
   - `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`：OpenAI 兼容大模型配置
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`：Supabase 服务端凭证
   - `SESSION_SECRET`：任意强随机串，用于签名 Session Cookie
   - `TAVILY_API_KEY` / `SERP_API_KEY`：搜索 API（可选）

3. 在 Supabase SQL Editor 中执行 `supabase/schema.sql` 建表（包含所有新表）。

4. 一体化本地开发（需 Vercel CLI）：

   ```bash
   npm i -g vercel
   vercel dev
   ```

## 部署（Vercel Hobby Plan）

1. 将仓库导入 Vercel，Framework 自动识别为 Vite。
2. Project Settings → Environment Variables 添加上述全部变量（生产 `ZHIHU_REDIRECT_URI` 改为 `https://<your-app>.vercel.app/api/auth/callback`）。
3. 在知乎开放平台授权回调中加入生产回调地址。
4. 本项目 API 共 **12 个** Serverless Functions，刚好符合 Hobby 计划上限。

## 浏览器插件（蒸馏自己）

插件让你把自己的知乎回答直接上传到蒸馏馆，跳过公开 API 的数量限制。每人最多保存 10 条回答，可随时在「我的蒸馏」页面删除替换。

### 安装

最新构建：[Releases](https://github.com/orange90/zhihu_soul_distillation/releases)

1. 下载 zip 并解压
2. Chrome / Edge → `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序
3. 在首页获取插件 Token（点「一键写入」或手动复制）
4. 访问你的知乎主页，页面底部工具栏勾选回答 → 上传
5. 到「我的蒸馏」页面点「开始蒸馏」

### 本地构建

```bash
cd extension
npm install
npm run build   # 产出 extension/dist
```
