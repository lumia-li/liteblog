# auth-service —— 独立邮箱认证服务

部署在你自己服务器上的 Node.js 认证服务，为博客提供「邮箱注册 / 验证码邮件 / 密码登录 / 账户管理」能力。博客（Vercel）通过服务端代理接口 + API Key 调用本服务，用户数据存放在本服务的 MySQL 中。

## 架构

```
浏览器 → 博客 Astro API（Vercel，服务端代理）
             │  HTTPS + x-api-key
             ▼
       auth-service（本服务，你的服务器）
             ├─ MySQL：users / email_verifications / login_attempts
             └─ SMTP：发送验证码 + 设密码链接邮件
```

## 注册 / 登录流程

1. 用户点击导航「注册账号」→ 网页中央弹出悬浮弹窗
2. 输入邮箱 → 点击「发送验证码」→ 服务生成 6 位验证码 + 一次性 token，邮件同时携带：
   - 验证码（可在弹窗内输入）
   - `https://站点/auth/set-password?token=xxx` 链接（可直接点击）
3. 点击邮件链接 → 博客 `/auth/set-password` 落地页 → 设置密码 → 注册完成
4. 验证码路径：弹窗输入验证码 → 校验通过同样跳转设密码页
5. 设密码成功 → 回到首页并自动打开登录弹窗 → 邮箱+密码登录（签发 `airliny_session` Cookie，与 OAuth 会话完全同构）
6. 登录后进入 `/profile` 账户设置：改用户名 / 换绑邮箱（新邮箱需验证码）/ 改密码

## 服务端部署步骤

```bash
# 1. 环境：Node.js >= 20、MySQL >= 8
node -v && mysql --version

# 2. 建库建表
mysql -u root -p < sql/schema.sql

# 3. 创建数据库账号（建议最小权限）
mysql -u root -p -e "CREATE USER 'auth'@'localhost' IDENTIFIED BY '强密码';
GRANT SELECT,INSERT,UPDATE,DELETE ON auth.* TO 'auth'@'localhost';"

# 4. 安装依赖并配置
pnpm install
cp .env.example .env
vi .env   # 填写 DB_* / SMTP_* / AUTH_SERVICE_API_KEY

# 5. 生成 API Key（复制到 .env，同时配置到 Vercel）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 6. 用 pm2 守护运行
pnpm add -g pm2
pm2 start "pnpm start" --name auth-service
pm2 save && pm2 startup
```

### Nginx 反代（示例：auth.liyueovo.top）

```nginx
server {
    listen 443 ssl http2;
    server_name auth.liyueovo.top;
    # ssl_certificate / ssl_certificate_key 由 certbot 生成

    location / {
        proxy_pass http://127.0.0.1:4100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
# 证书（Let's Encrypt）
sudo certbot --nginx -d auth.liyueovo.top
```

## 博客侧配置（Vercel 环境变量）

| 变量 | 值 |
|---|---|
| `AUTH_SERVICE_URL` | `https://auth.liyueovo.top`（与 Nginx 域名一致） |
| `AUTH_SERVICE_API_KEY` | 与服务端 `.env` 中完全一致 |

## SMTP 说明

以 QQ 邮箱为例：设置 → 账号 → 开启 SMTP 服务 → 生成「授权码」填入 `SMTP_PASS`（不是登录密码）。
企业邮箱同理，`SMTP_HOST`/`SMTP_PORT` 按服务商文档填写（465 端口 `SMTP_SECURE=true`）。

## 接口一览（均要求 `x-api-key` 头）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/email/send-code` | 发送验证码邮件 `{ email, purpose: register\|change-email, userId? }` |
| POST | `/email/verify-code` | 校验验证码 → 返回一次性 token `{ email, code, purpose }` |
| GET  | `/email/check-token?token=` | 落地页校验 token |
| POST | `/email/set-password` | 凭 token 设密码（注册建号 / 换绑邮箱）`{ token, password, username? }` |
| POST | `/email/login` | 邮箱密码登录 `{ email, password }` → `{ user }` |
| PATCH | `/account/username` | 改用户名 `{ userId, username }` |
| POST | `/account/email/verify` | 凭验证码换绑邮箱 `{ userId, newEmail, code }` |
| POST | `/account/password` | 改密码 `{ userId, currentPassword, newPassword }` |
| GET  | `/account/me?userId=` | 读取邮箱账号信息 |
| GET  | `/health` | 健康检查（无需鉴权，含 MySQL 连通性） |

## 安全设计

- 密码：bcrypt（cost 12）哈希存储
- 验证码 / token：只存 SHA-256 哈希，明文仅存在于邮件中；15 分钟有效、单次消费（原子 `consumed=1`）
- 限流：同邮箱发码 60s 冷却；同 IP 发码 10 次/小时；登录同 IP 60 次/小时；密码连错 5 次锁定 15 分钟（MySQL 持久化）
- 服务间：`x-api-key` 常量时间比较
- 数据库全部使用预编译语句，防注入
