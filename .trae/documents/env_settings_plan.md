# 环境变量（Settings）改造计划

## 0. 背景：`https://www.zhihu.com/ring/moltbook/api/community/quickstart` 解读

- **知乎 Ring**：知乎面向开发者的应用开放平台（控制台 / 文档站）。
- **moltbook**：Ring 下的一个社区（知乎直答 / OpenAPI 的开发者文档社区）。
- **/api/community/quickstart**：该社区的「API 快速开始」文档（需登录知乎账号才能查看完整内容）。
- 文档的核心产出物是：
  1. 在控制台创建应用，获得 `Client ID / Client Secret`；
  2. 配置 OAuth 回调地址 `Redirect URI`；
  3. 申请直答 Agent Token（或 OpenAPI Token）；
  4. OAuth `authorize / token` 端点、`/openapi/user/me`、`/openapi/user/following`、`v1/chat/completions` 的 Base URL 与鉴权方式。
- 这些凭据正好是 `api/_lib/zhihu.ts` 里全部 `process.env.*` 的来源。

## 1. 代码研究结论

当前代码中实际用到的环境变量（按文件归类）：

- `api/_lib/zhihu.ts`
  - `ZHIHU_OAUTH_BASE_URL`（默认 `https://www.zhihu.com`）
  - `ZHIHU_OPENAPI_BASE_URL`（默认 `https://api.zhihu.com`）
  - `ZHIHU_AGENT_BASE_URL`（默认 `https://api.zhihu.com`）
  - `ZHIHU_CLIENT_ID`
  - `ZHIHU_CLIENT_SECRET`
  - `ZHIHU_REDIRECT_URI`
  - `ZHIHU_AGENT_TOKEN`
- `api/_lib/session.ts`
  - `SESSION_SECRET`（回退到 `SUPABASE_SERVICE_ROLE_KEY`，最后回退到 `dev-only-secret-change-me`）
  - `VERCEL_ENV`（Vercel 注入，无需在 .env 里写）
- `api/_lib/supabase.ts`（推测）
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- 前端（Vite 读取 `VITE_*`）
  - `VITE_APP_NAME`

## 2. 当前 `.env.example` 的问题清单

| # | 问题 | 位置 | 处理方式 |
|---|---|---|---|
| ① | 真实 `ZHIHU_CLIENT_SECRET` 被写入 example | L3 | 必须改为占位符 `<your-zhihu-client-secret>` |
| ② | 真实 `SUPABASE_URL` 被写入 example | L12 | 改为占位符 `https://<project>.supabase.co` |
| ③ | 真实 `SUPABASE_SERVICE_ROLE_KEY`（JWT）被写入 example | L13 | 改为占位符，同时**建议在 Supabase 控制台轮换该 service role key** |
| ④ | `ZHIHU_CLIENT_ID=huangzhe` 可疑，不像真实 client id | L2 | 改为占位符 `<your-zhihu-client-id>`，并提示从 Ring 控制台获取 |
| ⑤ | 缺少 `ZHIHU_OAUTH_BASE_URL` | — | 补齐（默认 `https://www.zhihu.com`） |
| ⑥ | 缺少 `SESSION_SECRET` | — | 新增，并附生成命令注释 |
| ⑦ | 等号后多余空格 | L2/L3/L7/L12/L13 | 统一为 `KEY=value` 无多余空格 |
| ⑧ | `ZHIHU_REDIRECT_URI` 仅本地 | L4 | 增加生产环境示例注释（Vercel 域名） |
| ⑨ | 文件末尾缺换行 | L17 | 保证以 `\n` 结尾 |
| ⑩ | 分区注释可更清晰 | 全文 | 按「知乎 OAuth / 知乎直答 / Supabase / 会话 / 前端」重排分节，每节加英文字段说明 |

## 3. 待修改文件

- `.env.example`（唯一修改目标，**仅替换为占位符**，不动业务代码）
- `.gitignore`（核查确认 `.env` 已被忽略；如已忽略则**不动**）

> 不改动 `api/_lib/zhihu.ts` / `api/_lib/session.ts` 等业务代码。本次只动"Settings"。

## 4. 修改步骤（仅在用户批准后执行）

1. **备份确认**：确认 `.gitignore` 已忽略 `.env*`（除 `.env.example`），若未忽略则追加规则。
2. **重写 `.env.example`**，结构如下（占位符示例）：
   ```dotenv
   # ===== 知乎 OAuth（Ring 控制台申请）=====
   ZHIHU_CLIENT_ID=<your-zhihu-client-id>
   ZHIHU_CLIENT_SECRET=<your-zhihu-client-secret>
   # 本地开发
   ZHIHU_REDIRECT_URI=http://localhost:3000/api/auth/callback
   # 生产环境示例：https://<your-domain>/api/auth/callback
   ZHIHU_OAUTH_BASE_URL=https://www.zhihu.com

   # ===== 知乎直答 Agent / OpenAPI =====
   ZHIHU_AGENT_TOKEN=<your-zhihu-agent-token>
   ZHIHU_AGENT_BASE_URL=https://api.zhihu.com
   ZHIHU_OPENAPI_BASE_URL=https://api.zhihu.com

   # ===== Supabase =====
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>

   # ===== 会话签名 =====
   # 生成：node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   SESSION_SECRET=<random-32-bytes-base64url>

   # ===== 前端可读（Vite）=====
   VITE_APP_NAME=知识蒸馏馆
   ```
3. **核查 `.gitignore`**：确保至少包含
   ```gitignore
   .env
   .env.local
   .env.*.local
   ```
   且**不忽略** `.env.example`。

## 5. 用户需要在本地/Vercel 做的事（计划外提示）

- 因为真实 secret 曾经出现在 `.env.example` 并可能已被提交，**强烈建议**：
  1. 在知乎 Ring 控制台**重置 Client Secret**；
  2. 在 Supabase 控制台**轮换 service_role key**；
  3. 通过 `git log -p .env.example` 检查是否曾被 push 到远端，若已 push 需要重置历史或视为已泄露处理。
- 本地拷贝 `.env.example` 为 `.env` 并填入真实值；在 Vercel 项目 Settings → Environment Variables 里**一一配置**同名变量（生产环境的 `ZHIHU_REDIRECT_URI` 需改成线上域名并在 Ring 控制台同步登记）。

## 6. 依赖 / 风险

- **无代码依赖变化**，不影响构建与运行。
- 风险点：若本地已有 `.env` 缺少 `SESSION_SECRET`，`session.ts` 会回退到 `SUPABASE_SERVICE_ROLE_KEY`，改造后**仍然兼容**；但建议正式环境显式设置 `SESSION_SECRET`。
- 风险点：修改 `.env.example` 不会改动 `.env`，已部署服务不受影响。

## 7. 验收标准

- `.env.example` 内不再出现任何形如 `eyJ...` 的 JWT、明显的 secret、真实 Supabase 项目地址。
- 所有 `api/_lib/*.ts` 引用到的环境变量在 `.env.example` 中均有占位条目。
- `KEY=value` 全部规范化，文件以换行结尾。
