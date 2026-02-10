# VaultPilot Indexer

[English](README.md) | 中文

VaultPilot Indexer 是一个 Obsidian 插件，用于增量构建 JSONL 索引，并为写作协作场景生成 AI 摘要。

## 这个项目解决什么问题

它让写作助手不再每次全量扫描仓库，而是先读取紧凑索引，再按需打开相关笔记。

## 功能

- 基于文件 create/modify/rename/delete 事件的增量索引
- JSONL 索引输出 + 状态文件（重试队列、哈希缓存）
- OpenAI-compatible 摘要生成
- 从 `/v1/models` 自动发现模型，并支持手动模型兜底
- 文件夹/文件模式/tag 排除规则
- 构建进度状态显示 + 可选通知
- 配套 skill 规范（目录/标签/引用建议）

## 项目与 skill 命名

- 项目名：**VaultPilot Indexer**
- 协作 skill 名：**Vault Writing Navigator**

## 输出文件位置

- 索引文件：`.obsidian/plugins/obsidian-jsonl-index-plugin/content_index.jsonl`
- 状态文件：`.obsidian/plugins/obsidian-jsonl-index-plugin/index_state.json`

## 快速开始

1. 安装依赖：

```bash
npm install
```

2. 构建发布包：

```bash
npm run build
```

3. 构建输出目录：

```text
dist/obsidian-jsonl-index-plugin/
```

4. 将整个 `obsidian-jsonl-index-plugin` 文件夹复制到：

```text
.obsidian/plugins/
```

5. 在 Obsidian 社区插件中启用。

6. 打开插件设置并配置：
- API Base URL
- API Token
- 模型选择（刷新模型目录或手动覆盖）
- 排除规则

## 开发命令

- `npm run build`
- `npm run typecheck`
- `npm test`

## 文档

- `docs/architecture.md`
- `docs/skill.md`
- `skill/SKILL_SPEC.md`

## 许可证

MIT，详见 `LICENSE`。
