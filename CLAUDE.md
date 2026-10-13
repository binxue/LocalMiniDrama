# LocalMiniDrama · Claude Code 开发入口

> 2026-10-13 接管决定：Codex 恢复主开发负责人，Claude Code 停止开发。
> 当前唯一任务、授权预算、真实 Runtime 结果与下一步见
> [A 镜静态制作当前状态](docs/localminidrama-static-production-status.md)。下文保留历史上下文，不代表当前验收结论。

**项目定位：** AI 智能短剧导演与制作系统

**当前版本：** v1.2.8

---

## 快速开始

### 工程位置

```
本地工程: H:\localminidrama-clean
GitHub: https://github.com/binxue/LocalMiniDrama
开发分支: codex/localminidrama-provider-stabilization
```

### 服务地址

- 后端：http://127.0.0.1:5679
- 前端：http://127.0.0.1:3013

### 启动服务

```bash
# 后端
cd H:/localminidrama-clean/backend-node
npm start

# 前端
cd H:/localminidrama-clean/frontweb
npm run dev
```

---

## 开发约束

### 代码原则

1. **复用优先** - 已有能力直接用，不重新开发
2. **影视驱动** - 所有改动解决真实制作问题
3. **保护数据** - 不删除数据库、不覆盖媒体、不破坏已批准方案
4. **自主开发** - 自写、自测、自审、自改

### Git 工作流

```bash
# 日常提交
git add <files>
git commit -m "type: description"
git push origin codex/localminidrama-provider-stabilization

# 提交类型
feat: 新功能
fix: 修复
chore: 维护
docs: 文档
test: 测试
```

### 禁止操作

- ❌ 删除或重建生产数据库
- ❌ 覆盖媒体资源 (backend-node/data/storage/)
- ❌ 修改已批准的剧本和分镜方案
- ❌ 重试未知状态的收费任务
- ❌ 强制推送主分支
- ❌ 输出密钥或敏感请求

---

## 当前制作任务

**作品：** 《路没了》EP01 v3

**制作目标：** 完成已批准 A/B 镜头的专业图片、视频生成和连续性验收

**业务数据：**
- drama_id: 2
- episode_id: 2
- A 镜 storyboard_id: 3 (s01_01A)
- B 镜 storyboard_id: 4 (s01_01B)

**批准方案：** `H:\localminidrama-research\general-film-team\shot1-ab-preproduction.json`  
**方案 SHA-256：** `7155cf62c528833f32fe0d3832027aacae6a86066bfddd7304d9c4a80bcc34a6`

**图片模型：** doubao-seedream-5-0-pro-260628  
**规格：** 1440×2560, 9:16

**当前状态：**
- 工程状态: READY_FOR_PAID_GENERATION
- 影视状态: AWAITING_A_FIRST_FRAME

---

## 关键文件位置

```
# 数据库
backend-node/data/drama_generator.db

# 媒体存储
backend-node/data/storage/projects/

# A 镜参考图
backend-node/data/storage/projects/0002_20261012_《路没了》EP01_v3/images/
  - ig_a6aeb0cd.jpg (场景)
  - ig_3185629c.jpg (手机)
  - ig_7a1a4aa4.jpg (茶杯)

# 配置
backend-node/configs/config.yaml

# 核心服务
backend-node/src/services/
  - aiClient.js (AI 调用)
  - imageClient.js (图片生成)
  - imageService.js (图片管理)
  - videoClient.js (视频生成)
  - videoService.js (视频管理)

# 测试
backend-node/test/
```

---

## 已知问题

1. 历史任务 23、24 未成功交付图片，禁止自动重试
2. Node 版本：系统 v24.15.0，项目需要 v22.23.3 (ABI 127)
3. runtime-node/ 只包含 node_modules，不含可执行文件

---

## 开发文档

- [产品目标](docs/product-goals.md)
- [开发状态](docs/development-status.md)
- [Provider 稳定化状态](docs/localminidrama-provider-stabilization-status.md)

---

## 验收标准

**验收节点 1：专业制作链路就绪**
- 可实际操作的 A/B 制作工作流
- Agent 到生成任务的可追踪证据
- 必要代码修复
- 测试结果
- GitHub 提交

**验收节点 2：A/B 镜头影视质量**
- 真实图片、视频
- 导演质量评价

**验收节点 3：完整场景制作**
- 可观看样片
- 镜头清单
- 质量报告
- 实际成本

---

**最后更新：** 2026-10-13  
**负责人：** Claude Code (Opus 5)
