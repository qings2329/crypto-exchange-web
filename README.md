# crypto-exchange-web

加密货币交易所交易终端的前端项目，提供现货、合约、期权、OTC、杠杆、理财、风控、通知等模块的统一 Web 操作界面。

基于 **React 18 + TypeScript + Vite** 构建。

## 技术栈

- 框架：React 18
- 语言：TypeScript（strict 模式）
- 构建工具：Vite 5
- 路由：基于 URL hash 的轻量路由（`#/trade`、`#/wallet` …）
- 状态：React Context（鉴权 `AuthProvider`）
- 通信：`fetch` 封装的 API 客户端 + 原生 WebSocket（行情推送）

## 目录结构

```
src/
├── main.tsx              # 入口，挂载 <App/>
├── App.tsx              # AuthProvider + 基于 hash 的路由
├── api/client.ts        # API 客户端、Token 管理、WebSocket 助手、类型定义
├── lib/auth.tsx         # 鉴权 Context（登录/登出/路由守卫）
├── components/          # NavBar / Header / Ticker / OrderBook / OrderForm 等复用组件
├── pages/               # 各业务页面（Trade / Wallet / Futures / Options / Otc / Margin / Wealth / Risk / Notifications / Login / Register）
└── styles.css           # 全局样式
```

## 页面一览

| 路由          | 模块   | 说明                         |
| ------------- | ------ | ---------------------------- |
| `#/login`     | 登录   | 手机号/邮箱 + 密码登录       |
| `#/register`  | 注册   | 注册并发送验证码             |
| `#/trade`     | 现货   | 行情条 + 订单簿（WS）+ 下单  |
| `#/wallet`    | 钱包   | 资产与流水                   |
| `#/futures`   | 合约   | 持仓 / 资金费 / 指数 / 钱包  |
| `#/options`   | 期权   | 合约与持仓                   |
| `#/otc`       | OTC    | 广告 / 订单 / 交易对手       |
| `#/margin`    | 杠杆   | 杠杆账户 / 强平价           |
| `#/wealth`    | 理财   | 产品与持仓                   |
| `#/risk`      | 风控   | 规则 / 黑名单 / 事件         |
| `#/notifications` | 通知 | 后台通知列表                 |

受保护页面在无 `cx_access_token` 时会自动跳转登录页。

## 开发与构建

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 类型检查 + 生产构建，产物在 dist/
npm run build

# 本地预览构建产物
npm run preview
```

## 后端对接（Vite 代理）

开发服务器通过 Vite 代理将 `/api` 转发到后端网关 `http://localhost:8080`，
REST 与 WebSocket（行情推送）共用该代理（`vite.config.ts` 中 `ws: true` 支持协议升级），
因此前端统一使用相对路径调用，无需处理跨域。

- 后端基地址：`http://localhost:8080`
- API 前缀：`/api/v1/...`
- WebSocket：`/api/v1/spot/ws`、`/api/v1/market/ws`

后端未启动时，开发页面可正常渲染，但数据接口会报错。

## API 客户端说明

`src/api/client.ts` 封装了统一请求逻辑：

- **Token 管理**：`access_token` / `refresh_token` / `user_id` 存于 `localStorage`，由 `tokenStore` 统一管理。
- **自动刷新**：请求返回 `401` 时，自动用 `refresh_token` 换取新 `access_token` 并重试一次；刷新失败则清除登录态。
- **响应解包**：统一解包 `{ code, message, data }` 结构，直接返回 `data`。
- **WebSocket 助手**：`connectSpotWS`（深度 + 成交推送）、`connectMarketWS`（Ticker 快照），均返回取消订阅函数。

## 环境变量

当前通过 Vite 代理硬编码指向 `localhost:8080`，如要对接其他后端地址，修改 `vite.config.ts` 中的 `server.proxy.target` 即可。如需运行时配置，可补充 `.env` 并配合 `import.meta.env`（已在 `.gitignore` 中忽略）。

## 部署

本项目是纯静态 SPA，构建产物为 `dist/` 目录，可托管到任意静态服务器（Nginx、CDN、对象存储等）。

### 1. 构建

```bash
npm install
npm run build      # 产物输出到 dist/
```

### 2. 静态托管（以 Nginx 为例）

由于使用 **hash 路由**（`#/trade` 等），URL 路径不会变化，所有请求都由服务器返回同一个 `index.html`，**无需配置 history fallback / 路由重写**。

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/dist;
    index index.html;

    # 静态资源
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 将 /api 反向代理到后端网关（REST 与 WebSocket 同前缀）
    location /api {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;       # 支持 WebSocket 升级
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

> 关键点：生产环境**不会**经过 Vite 代理，因此需要由 Nginx（或你使用的网关）自行把 `/api` 反向代理到后端 `:8080`，否则所有接口与行情 WS 都会 404。WebSocket 的 `Upgrade`/`Connection` 头必须正确透传。

### 3. 其他托管方式

- **`npm run preview`**：直接用 Vite 预览构建产物（仍走 `vite.config.ts` 代理）。
- **对象存储 / CDN**：上传 `dist/` 全部内容，并配置默认文档为 `index.html`；`/api` 需由独立网关或边缘函数转发到后端。

## 故障排查

| 现象 | 可能原因 | 排查 / 解决 |
| ---- | -------- | ----------- |
| 页面能打开，但所有数据为空 / 接口报错 | 后端网关未启动或地址不对 | 确认后端在 `:8080` 监听；开发环境检查 `vite.config.ts` 的 `proxy.target`，生产环境检查反向代理配置 |
| 接口返回 404（`/api/...`） | 生产环境未配置反向代理 | 在 Nginx（或网关）中增加 `location /api { proxy_pass ... }`，不要依赖 Vite 代理 |
| WebSocket 连不上 / 行情不刷新 | `Upgrade` 头未透传，或后端 WS 地址错误 | 检查反向代理是否透传 `Upgrade`/`Connection`；确认 `wss://` 在 HTTPS 下可用 |
| 一直跳回登录页 / 登录后立即失效 | `access_token` 过期且刷新失败 | 清除 `localStorage` 中的 `cx_access_token` 等键重新登录；确认后端 `/api/v1/user/refresh` 正常 |
| 反复 401 刷新循环 | `refresh_token` 失效或被多处并发刷新 | 客户端已用单例 `refreshing` 防止并发；如无效应清除登录态重新登录 |
| 跨域（CORS）报错 | 前端直连后端而非经代理/反代 | 开发用 Vite 代理、生产用反向代理，统一走相对路径 `/api`，避免直连 `http://localhost:8080` |
| `npm run build` 失败 | TypeScript 严格模式报错 | 查看 `tsc -b` 输出，按报错逐条修复类型问题（开启了 `noUnusedLocals`/`noUnusedParameters` 等） |
| 开发服务器启动在别的端口 / 端口被占 | 默认 `5173` 已被占用 | Vite 会自动顺延到 `5174`…；或显式指定 `--port`/`--host` |
| 改动不生效 | 浏览器缓存了旧 `dist` | 构建后强刷浏览器（禁用缓存）或重新部署静态资源 |

> 调试技巧：浏览器打开 DevTools → Network，筛选 `/api` 请求，查看状态码与响应体 `{ code, message, data }`，可快速定位是前端调用问题还是后端返回问题。

## 性能优化

### 现有做法（代码中已实现）

- **实时优先于轮询**：行情（`Ticker`/`OrderBook`）优先走 WebSocket 推送，仅在 WS 未连接或静默时回退 2s 一次的 REST 轮询，避免高频轮询打满请求。
- **卸载守卫**：所有数据组件用 `let alive = true` + `useEffect` 清理函数，组件卸载后不再 `setState`，避免内存泄漏与“卸载后更新”告警。
- **WebSocket 资源回收**：`connectSpotWS` / `connectMarketWS` 返回 `() => ws.close()`，在依赖变化或卸载时正确关闭连接，防止连接泄漏。
- **订单簿 DOM 收敛**：`OrderBook` 用 `slice(0, 10)` 只渲染买卖盘前 10 档，控制渲染节点数，避免深度数据撑大 DOM。

### 可进一步优化的方向

| 方向 | 建议 |
| ---- | ---- |
| 高频推送节流 | WS 行情可能每秒多次，可在 `onmessage` 内用 `requestAnimationFrame` 或时间戳节流（如 ≥100ms）合并 `setState`，减少渲染次数（`Ticker`/`OrderBook` 当前每次推送都 setState） |
| 行级复用 | 对订单簿/列表行使用 `React.memo`，配合稳定 `key`，避免整块重渲染 |
| 大数据虚拟化 | 若订单簿深档、持仓/通知列表变长，引入虚拟列表（如 `react-window`）按需渲染可视区 |
| 路由级代码分割 | 当前所有页面经 `import` 打包进同一 bundle；可用 `React.lazy` + `Suspense` 按路由分包，首屏只加载现货页 |
| 构建体积分析 | 接入 `rollup-plugin-visualizer` 生成产物体积报告，定位大依赖 |
| 静态资源缓存 | 生产环境为 `dist/` 中的带 hash 文件名开启长效 `Cache-Control: immutable`，`index.html` 用 `no-cache` |
| 压缩 | Nginx 开启 `gzip`/`brotli`，对 JS/CSS 文本资源显著降体积 |
| 接口并发控制 | REST 兜底轮询可与 WS 状态联动：WS 在线时暂停轮询（现有实现两者并存，可在 `live` 为 true 时 `clearInterval` 进一步省流量） |

## 监控

### 前端错误监控

- API 客户端对失败统一抛出 `ApiError`（携带 `code` / `status` / `message`，见 `src/api/client.ts`）。建议在此处或 `ApiTable` 的 `catch` 中集中上报，避免散落 `try/catch` 吞掉错误。
- 接入全局捕获兜底未知错误：

  ```ts
  window.addEventListener("error", (e) => report(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => report(e.reason));
  ```

- 推荐接入 Sentry / 自建上报 SDK，按 `release`（构建版本）聚合，便于区分线上问题。

### 性能与体验指标

- 接入 `web-vitals` 采集 **LCP / CLS / INP(FID)**，监控首屏与交互体验。
- 用 `performance.timing` / `PerformanceObserver` 记录各页面 `api.get` 耗时，建立接口 P95 基线。
- 行情健康度：组件已用 `live` 标记区分「实时推送 / 轮询」（见 `Ticker`/`OrderBook` 的 `dot`/`ob-foot`）。可在 `live` 由 `true→false` 时上报一次「WS 掉线」，量化推送稳定性。

### 构建与发布监控

- CI 中 `npm run build` 已包含 `tsc -b` 类型检查，类型错误即阻断发布。
- 配合体积分析插件设置 **bundle 体积预算**，超阈值时告警，防止依赖无意识膨胀。
- 上传 **source map** 到监控平台（注意生产 `.map` 不要公开托管，避免源码泄露），以便错误栈还原到源码。

### 后端查询接口约定（待后端实现）

前端的 `src/api/client.ts` 已定义 `api.monitorSummary()` / `api.monitorEvents()`，
监控看板页会调用以下两个接口拉取**服务端聚合**数据（未实现时看板回退为「会话本地」视图）。
请在网关 / 监控服务中实现：

**`GET /api/v1/monitor/summary`** — 聚合统计

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "errors": 12,
    "apiErrors": 34,
    "wsDrops": 5,
    "vitals": { "LCP": 1820.5, "CLS": 0.02, "INP": 120.0, "FCP": 980.1, "TTFB": 80.3 },
    "total": 51,
    "range": "24h"
  }
}
```

**`GET /api/v1/monitor/events?limit=50`** — 事件明细（按时间倒序）

```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "ts": 1723814400000,
      "type": "api_error",
      "name": null,
      "message": "请求失败",
      "code": 50001,
      "status": 500,
      "value": null,
      "meta": { "uid": "123" }
    },
    {
      "ts": 1723814300000,
      "type": "ws_drop",
      "name": "BTC_USDT",
      "message": null,
      "code": null,
      "status": null,
      "value": null
    }
  ]
}
```

> 说明：`type` 取值为 `error` / `api_error` / `vital` / `ws_drop` / `custom`；
> `vital` 类事件用 `value` 表示数值（毫秒或 CLS 无量纲），其余用 `status`/`code`。
> 响应沿用项目统一的 `{ code, message, data }` 包裹（前端 `request()` 会自动解包 `data`）。
> 上报侧对应 `initMonitor` 的 `endpoint`（默认 `POST /api/v1/monitor/report`），后端需同时提供写入与查询两端。
> 可运行的骨架示例见 `server/`：
> - `monitor-server.mjs`（零依赖 Node 内置 http 版，`node monitor-server.mjs` 直接运行）
> - `monitor-express.mjs`（Express 版，路由更易扩展中间件；`cd server && npm install && npm run start:express`）
> - 两者共用 `monitor-store.mjs` 的内存存储与聚合逻辑，生产请替换为 DB/消息队列。
> - Express 版内置 `X-Api-Key` 鉴权中间件：设置环境变量 `MONITOR_API_KEY` 后，所有 `/api/v1/monitor/*` 请求须带请求头 `X-Api-Key: <key>`（未设置该变量时关闭校验，仅演示用）。调用示例：
>   ```bash
>   curl -H 'X-Api-Key: secret123' http://localhost:8080/api/v1/monitor/summary
>   ```
>
> 监控骨架的测试（`server/monitor-auth.test.mjs` 单元测试 + `server/monitor-auth.integration.test.mjs` 集成测试 + `server/monitor-e2e.mjs` 端到端脚本）已从根项目接入，
> 零额外依赖（仅 Express 版需 `npm install`）。在仓库根目录运行：
> ```bash
> npm test            # 自动安装 server 依赖，依次执行 单元 → 集成 → 端到端 全部测试
> npm run test:server # 仅单元 + 集成
> npm run test:e2e    # 仅端到端
> ```
> 测试覆盖：鉴权纯函数、Express 中间件、真实启动 http / express 服务进程后的完整鉴权流程（无 key / 错误 key → 401，正确 key → 200，上报与聚合联动），以及端到端模拟前端上报报文并校验响应结构对齐前端类型。
