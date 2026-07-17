# OAuth2 登录系统接入交接文档

## 一、背景与目标

本项目（li-liteblog）是一个基于 **Astro + Svelte** 的博客系统，部署在 Vercel 上。

用户希望接入 [Airliny 统一认证中心](https://account.airliny.com) 的 OAuth 2.0 Authorization Code 登录流程，实现：

1. 全站用户登录（不仅限于编辑器后台）。
2. 登录后右上角显示用户名/头像，点击可进入 `/profile` 个人资料页。
3. 任何人只要通过 Airliny 授权即可登录。
4. 不引入数据库，用户信息和会话通过加密 Cookie 保存在浏览器端。
5. 与现有编辑器口令系统（`DEV_EDITOR_CODE`）完全独立，互不影响。

## 二、Airliny OAuth 文档要点

文档位于：`C:\Users\liyueovo\Desktop\OAuth2接入文档.md`

核心流程：

1. 在 Airliny 后台创建 OAuth 应用，获取 `Client ID`（API Key）和 `Client Secret`（API Secret）。
2. 设置回调地址（Redirect URI）。
3. 用户点击登录 → 跳转到 `https://account.airliny.com/oauth/authorize`。
4. 用户授权后 → 跳回回调地址，URL 中带有 `code` 和 `state`。
5. 服务端用 `code` + `Client Secret` 换取 `access_token`。
6. 用 `access_token` 调用 `/oauth/userinfo` 获取用户信息。
7. 在本站创建会话，完成登录。

关键安全要求：

- `Client Secret` 和 `access_token` 绝对不可以暴露给前端。
- 每次授权必须生成随机 `state`，回调时严格校验，防止 CSRF。
- 回调地址必须与 Airliny 后台配置完全一致。
- 授权码有效期 60 秒且只能用一次。

## 三、本次实现内容

### 3.1 新增/修改的文件

| 文件 | 说明 |
| --- | --- |
| `.env.example` | 增加 OAuth 相关环境变量占位符 |
| `src/utils/auth-server.ts` | 服务端认证工具：OAuth 配置读取、Cookie 加解密、state/session 管理、token 交换、用户信息获取 |
| `src/pages/api/auth/login.ts` | 生成 state，重定向到 Airliny 授权页 |
| `src/pages/api/auth/callback.ts` | 接收回调，校验 state，换 token，获取用户，写入 session |
| `src/pages/api/auth/logout.ts` | 清除 session Cookie，跳回首页 |
| `src/pages/api/auth/me.ts` | 返回当前登录用户信息 |
| `src/components/auth/UserMenu.svelte` | 右上角用户菜单/登录按钮组件 |
| `src/components/home/HeroHub.astro` | 在首页右上角控制胶囊中插入用户菜单 |
| `src/pages/profile.astro` | `/profile` 个人资料页，登录后可见用户信息 |

### 3.2 会话实现方式

- 不使用数据库。
- 登录成功后，将 `{ user, accessToken, expiresAt }` 用 HMAC-SHA256 签名后写入名为 `airliny_session` 的 **HttpOnly、Secure、SameSite=Lax** Cookie。
- Cookie 有效期 7 天。
- 每次页面请求时，服务端通过 `readSession()` 读取并验证签名，过期自动失效。
- `state` 同样通过签名 Cookie 保存，有效期 5 分钟，仅用于 `/api/auth/callback`。

### 3.3 用户界面

- 未登录：右上角显示「登录」按钮，点击跳 `/api/auth/login`。
- 已登录：右上角显示用户头像 + 名字，下拉菜单包含「个人资料」和「退出登录」。
- `/profile` 页：展示头像、显示名、用户名、邮箱、角色、退出登录按钮；未登录时提示登录。
- 用户菜单会在 swup 页面切换后自动刷新登录状态。

## 四、环境变量配置

需要在 `.env` 文件（或 Vercel 环境变量）中配置：

```ini
# Airliny OAuth 2.0 登录配置
OAUTH_CLIENT_ID=你的_API_Key
OAUTH_CLIENT_SECRET=你的_API_Secret
OAUTH_CALLBACK=https://li.liyueovo.top/api/auth/callback
OAUTH_BASE=https://account.airliny.com

# 用于加密登录会话 Cookie，请设置一个随机长字符串（建议 32 位以上）
SESSION_SECRET=随机长字符串
```

> 注意：`Client ID` 和 `Client Secret` 只应保存在环境变量中，**不要提交到 Git**。

## 五、Airliny 后台配置

在 Airliny 创建 OAuth 应用时，回调地址（Redirect URI）必须填：

```
https://li.liyueovo.top/api/auth/callback
```

本地开发测试时，由于 Airliny 通常只接受 HTTPS 地址，建议直接部署到线上测试，或使用 ngrok 等工具将本地端口映射为 HTTPS。

## 六、登录流程

1. 用户点击右上角「登录」。
2. 浏览器请求 `/api/auth/login`。
3. 服务端生成随机 `state`，写入 Cookie，然后 302 重定向到：
   ```
   https://account.airliny.com/oauth/authorize?client_id=...&redirect_uri=...&state=...&scope=verify
   ```
4. 用户在 Airliny 完成授权或拒绝。
5. Airliny 302 跳回 `https://li.liyueovo.top/api/auth/callback?code=...&state=...`。
6. `/api/auth/callback` 校验 `state`，用 `code` 换 `access_token`。
7. 用 `access_token` 调用 `/oauth/userinfo` 获取用户信息。
8. 写入 session Cookie，重定向到 `/profile`。

## 七、安全说明

- `OAUTH_CLIENT_SECRET` 只在服务端 `src/utils/auth-server.ts` 的 `exchangeCodeForToken` 中使用，不会传给前端。
- `access_token` 只保存在服务端可读的 HttpOnly Cookie 中。
- `state` 每次随机生成，回调时与服务端 Cookie 中的值做 constant-time 比较。
- 会话 Cookie 用 HMAC-SHA256 签名，防止篡改。
- 登出时立即清除 session Cookie。

## 八、已知问题

运行 `astro check` 时，存在一个**原有**的类型错误，与本次 OAuth 改动无关：

```
src/pages/rss.xml.ts:13:3 - error TS2322: Type 'URL | undefined' is not assignable to type 'string | URL'.
```

本次新增的 OAuth 文件没有类型错误。

## 九、后续可扩展方向

- 将登录用户身份与评论系统（Twikoo）结合，显示已登录用户名/头像。
- 根据 `user.role === "admin"` 控制某些页面或按钮的显示。
- 支持 refresh_token（Airliny 后续版本提供）。
- 将用户数据持久化到数据库，实现收藏、点赞等互动功能。

## 十、交接清单

- [ ] `.env` 文件中已填入真实的 `OAUTH_CLIENT_ID`、`OAUTH_CLIENT_SECRET`、`SESSION_SECRET`。
- [ ] Airliny 后台已配置回调地址 `https://li.liyueovo.top/api/auth/callback`。
- [ ] 已部署并测试登录、查看 `/profile`、退出登录全流程。
- [ ] 已确认 `Client Secret` 没有泄露到代码仓库中。
