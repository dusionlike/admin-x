# Admin X

Admin X 是一个基于 Vue 3、Vite+、Element Plus 和 NestJS 的全栈管理后台。项目以 Vite+ monorepo 组织前端、API 服务和共享代码，使用 Node.js 内置 SQLite 保存业务数据。

## 技术栈

- 前端：Vue 3 + Vue Router + Pinia + Element Plus
- 工具链：Vite+（Vite、Rolldown、Oxfmt、Oxlint、Vitest、Vite Task）
- 后端：NestJS + class-validator + JWT
- 共享：`packages/shared` 提供 API 响应、分页、用户、角色权限、审计和仪表盘等类型，以及分页和错误处理方法
- 数据：Node.js `node:sqlite` + SQLite 文件，用户、密码哈希、登录访问记录和活动日志都会持久化

界面借鉴了 `third_party/vue-vben-admin` 的工作台布局思路，包括深色侧栏、顶部工具栏、统计卡片和数据密度，但实现保持在本项目自己的 Vue + Element Plus 代码内。

当前后台还包含以下基础交互：

- 侧栏收起时先淡出文字，再完成菜单折叠，避免文字被宽度动画截断。
- 顶部通知图标只有存在未读通知时才显示红点，通知列表为空时不会显示红点。
- 顶部和登录页的主题按钮支持太阳/月亮过渡、点击位置圆形扩散切换，并通过 `localStorage` 保持选择。
- 用户菜单中的“个人资料”进入 `/profile`，资料页提供账号信息和安全设置入口。

## 目录结构

```text
apps/
├─ admin/             # Vue 管理后台，默认端口 5173
└─ api/               # NestJS API，默认端口 3000
packages/
└─ shared/            # 前后端共用类型、响应封装和分页方法
tools/
└─ deploy/             # TypeScript 部署包组装工具
third_party/
└─ vue-vben-admin/    # 只读参考项目
```

## 快速开始

环境要求：Node.js `>=22.18.0`，pnpm `11.20.0`。

```bash
vp install
vp run dev
```

`vp run dev` 会并行启动：

- 前端：<http://localhost:5173>
- API：<http://localhost:3000/api>

第一次打开登录页时，系统会检测 SQLite 是否为空，并引导你创建唯一的初始系统管理员账号。创建完成后账号信息会写入数据库，之后重启服务仍可使用该账号登录。项目不内置演示账号。

开发环境默认数据库路径为 `apps/api/data/admin-x.sqlite`，可通过 `DATABASE_PATH` 指定其他路径。密码只保存为 `scrypt` 哈希，不保存明文。

如果登录按钮提示请求失败，请确认前端和 API 都已启动，并检查浏览器访问的是 `http://localhost:5173`。开发环境下前端会把 `/api` 请求代理到 `http://localhost:3000`；如果设置了 `VITE_API_BASE_URL` 为空字符串，前端仍会回退到 `/api`。

## 一体化部署

执行下面的命令会生成一个类似 Nuxt `.output` 的前后端一体化部署包：

```bash
vp run build
```

产物位于 `.output/`：

```text
.output/
├─ package.json
├─ README.txt
└─ server/
   ├─ main.mjs       # 已内置 NestJS、Express、JWT 等服务端依赖
   └─ public/        # Vue 前端静态资源
```

将整个 `.output` 目录复制到服务器后，在该目录直接运行即可，无需再次安装项目依赖：

```bash
cp .env.example .env
# 编辑 .env 后再启动服务
node server/main.mjs
# 或
pnpm start
```

默认端口是 `3000`。服务启动时会自动读取运行目录下的 `.env` 文件，也会读取部署包中 `server` 目录旁的 `.env`；已有的系统环境变量优先于 `.env`。可参考根目录的 `.env.example` 配置 `PORT`、`JWT_SECRET`、独立的 `DATA_ENCRYPTION_KEY`、`FRONTEND_ORIGIN` 和 `DATABASE_PATH` 等变量。部署包默认把数据库写入 `.output/data/admin-x.sqlite`。浏览器访问同一个服务地址时，前端使用相对路径请求 `/api`，NestJS 会同时托管页面和 API；Vue Router 的页面刷新也会自动回退到 `index.html`。

## 常用命令

```bash
# 检查格式和 lint
vp check

# 运行各工作区的类型检查
vp run -r check

# 运行共享包和 API 测试
vp run -r test

# 按规划文档附录运行 18 项安全清单 E2E
vp run test:e2e

# 构建前后端一体化部署包
vp run build

# 单独构建各个工作区
vp run build:workspace
vp run -r build

# 一次执行检查、测试和构建
vp run ready
```

`vp <command>` 是 Vite+ 的内置命令；项目脚本使用 `vp run <script>`。例如根目录的 `dev` 脚本是并行运行两个应用，前端单独调试可使用 `vp -C apps/admin dev`，API 单独调试可使用 `vp -C apps/api dev`。`vp run build:workspace` 和 `vp run -r build` 用于开发阶段的独立工作区构建，交付服务器时使用 `vp run build` 生成 `.output`。

## API 概览

除初始化状态、初始化管理员和登录接口外，仪表盘和用户接口都要求 `Authorization: Bearer <token>`：

| 方法     | 路径                           | 用途                               |
| -------- | ------------------------------ | ---------------------------------- |
| `GET`    | `/api/auth/setup-status`       | 查询是否需要首次初始化             |
| `POST`   | `/api/auth/setup`              | 创建唯一的初始系统管理员并登录     |
| `POST`   | `/api/auth/login`              | 登录并获取 JWT                     |
| `GET`    | `/api/auth/me`                 | 获取当前用户                       |
| `POST`   | `/api/auth/logout`             | 撤销当前账号的服务端会话           |
| `POST`   | `/api/auth/reauth`             | 敏感操作前校验当前密码并换取短令牌 |
| `GET`    | `/api/auth/mfa/status`         | 查询 MFA 绑定状态                  |
| `POST`   | `/api/auth/mfa/setup`          | 生成 MFA 绑定密钥（需当前密码）    |
| `POST`   | `/api/auth/mfa/enable`         | 校验动态码并启用 MFA               |
| `POST`   | `/api/auth/mfa/disable`        | 二次验证后停用 MFA                 |
| `GET`    | `/api/dashboard/overview`      | 获取工作台统计                     |
| `GET`    | `/api/dashboard/analytics`     | 按角色权限获取分析数据             |
| `GET`    | `/api/users`                   | 分页搜索用户                       |
| `POST`   | `/api/users`                   | 创建用户                           |
| `PATCH`  | `/api/users/:id/status`        | 更新用户状态                       |
| `PATCH`  | `/api/users/:id/role`          | 由安全管理员分配用户角色           |
| `PATCH`  | `/api/users/:id/data-scope`    | 由安全管理员配置数据范围           |
| `DELETE` | `/api/users/:id`               | 删除用户                           |
| `GET`    | `/api/audit`                   | 由审计管理员只读查询审计记录       |
| `GET`    | `/api/audit/export`            | 由审计管理员导出审计记录           |
| `GET`    | `/api/security/policy`         | 读取安全策略                       |
| `PATCH`  | `/api/security/policy`         | 由安全管理员更新安全策略           |
| `GET`    | `/api/compliance/overview`     | 查看 18 项等保设计检查清单和证据   |
| `GET`    | `/api/compliance/backups`      | 查看本地/异地备份记录              |
| `POST`   | `/api/compliance/backups`      | 系统管理员生成加密备份             |
| `GET`    | `/api/health`                  | 健康探针（无需登录）               |
| `GET`    | `/api/ready`                   | 就绪探针（无需登录）               |
| `GET`    | `/api/users/me/privacy/export` | 导出当前账号个人数据               |
| `POST`   | `/api/users/me/privacy/erase`  | 注销当前账号并清除业务个人资料     |

## 角色与权限模型

### 设计依据

模板参考现行 [GB/T 22239-2019《信息安全技术 网络安全等级保护基本要求》](https://std.samr.gov.cn/gb/search/gbDetailed?id=88F4E6DA63434198E05397BE0A0ADE2D) 的以下控制思路：

- 安全管理中心应区分系统管理、审计管理和安全管理，分别由系统管理员、审计管理员和安全管理员负责；相关操作需要身份鉴别并形成审计记录。
- 安全管理机构应明确系统管理员、审计管理员和安全管理员的岗位职责，并对关键活动建立授权和审批流程。
- 访问控制应遵循最小权限和职责制约原则，不能把所有管理权限集中到一个“超级管理员”账号。

具体条文可参阅[标准公开文本](https://gat.gxzf.gov.cn/xxgk_68662/fdzdgknr/xzgfxwj/P020221122621251697787.pdf)和[等级保护访问控制要求](https://gat.gxzf.gov.cn/ztzl/zfxxgkzl/gfxwj/t3779268.shtml)。

标准本身明确的是系统管理员、审计管理员和安全管理员等岗位，并没有规定“系统管理员只能创建管理员账号”或某个固定的初始化按钮流程。本模板在此基础上增加业务管理员作为业务系统的应用层角色。业务管理员不能替代安全管理员，也不能获得系统运行、角色授权或审计管理权限。账号只有一个角色，不支持多个管理员角色叠加到同一个账号。

| 角色          | 主要职责                         | 核心权限                         |
| ------------- | -------------------------------- | -------------------------------- |
| 系统管理员    | 用户生命周期、系统资源和运行保障 | 创建/停用/删除账号、系统运行维护 |
| 安全管理员    | 安全策略、授权审批和访问控制     | 分配角色、数据范围、安全策略     |
| 审计管理员    | 审计记录查询、分析和留痕检查     | 只读查看、导出审计记录           |
| 业务管理员    | 业务域配置和业务数据             | 业务模块增删改和报表             |
| 普通业务用户  | 日常业务操作                     | 授权范围内的业务操作             |
| 查询/只读用户 | 查询、统计、报表                 | 授权范围内只读                   |

### 权限矩阵

`✓` 表示允许，`—` 表示不允许。业务系统接入新的模块时，应继续按资源和操作拆分权限，不应直接复用系统管理员权限。

| 权限                    | 系统管理员 | 安全管理员 | 审计管理员 | 业务管理员 | 普通业务用户 | 查询/只读 |
| ----------------------- | ---------- | ---------- | ---------- | ---------- | ------------ | --------- |
| 查看用户和账号状态      | ✓          | ✓          | —          | —          | —            | —         |
| 创建普通/只读用户       | ✓          | —          | —          | —          | —            | —         |
| 启用、停用和删除用户    | ✓          | —          | —          | —          | —            | —         |
| 初始化首位安全管理员    | 仅一次     | —          | —          | —          | —            | —         |
| 分配用户角色和数据范围  | —          | ✓          | —          | —          | —            | —         |
| 配置安全策略和 MFA 策略 | —          | ✓          | —          | —          | —            | —         |
| 查询和导出审计记录      | —          | —          | ✓          | —          | —            | —         |
| 管理业务配置和业务数据  | —          | —          | —          | ✓          | —            | —         |
| 执行授权范围内业务操作  | —          | —          | —          | —          | ✓            | —         |
| 查询授权范围内业务数据  | —          | —          | —          | ✓          | ✓            | ✓         |
| 管理系统运行和基础资源  | ✓          | —          | —          | —          | —            | —         |

### 授权流程

1. 首次初始化创建一个系统管理员账号。
2. 在系统尚无有效安全管理员时，系统管理员可以在创建账号时一次性创建并启用首位安全管理员；该例外会写入审计记录。
3. 安全管理员生效后，系统管理员继续负责普通账号的创建、启停和删除，角色分配只接受安全管理员。
4. 安全管理员为用户分配安全管理员、审计管理员、业务管理员、普通用户或只读角色，并单独配置数据范围；系统管理员角色不通过安全管理员授予。
5. 用户、角色、数据范围、状态、密码、登录、MFA 和关键配置操作写入审计记录；审计管理员只能查询、导出和分析，不能通过后台删除记录。

### 已落地的安全控制

- 账号唯一：用户名和邮箱由 SQLite 唯一约束保证；不提供共享账号或默认密码，密码只保存为 scrypt 哈希。
- 服务端鉴权：菜单隐藏只是交互优化，所有 API 由 `AuthGuard` 和 `PermissionGuard` 再次校验角色权限。
- 数据权限：账号保存 `全部/本单位/本部门/本项目/指定/本人` 数据范围，业务模块应复用该范围过滤器。
- 登录安全：失败次数锁定、密码复杂度、密码有效期、来源 IP 限制、会话超时、并发会话上限和服务端会话撤销。
- 登录失败达到 5 次后默认锁定 30 分钟；空闲会话会按策略失效，系统管理员可在用户管理中执行带二次验证的解锁。
- 多因素认证：账号可绑定 TOTP MFA；MFA 密钥使用服务端密钥加密存储，管理员强制 MFA 策略启用前会检查所有有效管理员。
- 敏感操作复核：账号创建、启停、删除、角色/数据范围调整和安全策略变更默认要求当前密码二次验证，短令牌绑定会话版本并在 5 分钟后失效。
- 审计保护：审计记录包含账号、角色、时间、IP、请求号、结果、对象、前后值和完整性哈希；SQLite 触发器禁止更新/删除审计记录。
- 合规中心：对应规划文档附录的 18 项检查，提供 TLS/CSP、输入和上传防护、漏洞扫描证据、AES-256-GCM 本地/异地备份、健康就绪探针和个人信息权利闭环。
- 个人信息：初始化和新成员创建均可记录告知确认；资料页支持导出个人数据和注销账号，密码、MFA 密钥及备份均不以明文存储。

### 实现位置

- 角色和权限定义：`packages/shared/src/index.ts`
- API 权限守卫：`apps/api/src/auth/permission.guard.ts`
- 敏感操作守卫：`apps/api/src/auth/sensitive-action.guard.ts`
- 用户角色分配：`apps/api/src/users/users.controller.ts`
- 审计记录存储和旧数据库迁移：`apps/api/src/database/database.service.ts`
- 安全策略页面：`apps/admin/src/views/SecurityView.vue`
- 安全审计页面：`apps/admin/src/views/AuditView.vue`

这套代码提供的是后台应用层的 RBAC 基础，不能单独等同于“通过三级等保”。正式测评仍需结合部署环境落实多因素鉴别、传输与存储保护、日志留存与集中管控、备份恢复、制度和人员配备等要求。

合规中心的“已满足”状态只代表应用层有可验证实现和运行证据；生产环境仍应配置 `SECURE_TRANSPORT_REQUIRED=true`、独立的 `DATA_ENCRYPTION_KEY` 和 `BACKUP_ENCRYPTION_KEY`、异地 `BACKUP_REMOTE_PATH` 和 `HA_ENABLED=true`，并将漏洞扫描结果接入发布流水线。

前端开发服务器会将 `/api` 代理到 `http://localhost:3000`。一体化部署默认使用相对路径 `/api`，也可以在构建前通过 `VITE_API_BASE_URL` 指向独立 API 地址；服务端运行时通过 `PORT` 和 `FRONTEND_ORIGIN` 调整 NestJS 配置。

## 开发约定

- 跨前后端的 DTO、响应结构和纯函数放到 `packages/shared`，不要在共享包中引入浏览器或 NestJS 运行时依赖。
- 前端请求统一经过 `apps/admin/src/api/http.ts`，页面只调用领域 API 文件。
- API 的相对导入保留 `.js` 后缀，以兼容 NodeNext 类型检查和 ESM 构建。
- Nest 控制器、守卫和服务的构造函数依赖使用显式 `@Inject(...)`，兼容 Vite+ `tsx` 开发运行时。
- API 使用 Node.js 内置 `node:sqlite` 的 `DatabaseSync`，默认数据库文件在 `apps/api/data/admin-x.sqlite`；不要把用户数据改回内存数组或硬编码账号。
- 首次初始化只能通过 `/api/auth/setup` 创建一个系统管理员；首位安全管理员由系统管理员在无安全管理员时一次性创建并启用，后续成员先由系统管理员创建，再由安全管理员完成角色分配。
- `third_party/vue-vben-admin` 仅用于视觉和交互参考，不作为运行时依赖。
