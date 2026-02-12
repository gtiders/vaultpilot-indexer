# Vault Writing Navigator - Skill 规范（中文）

## 用途

Vault Writing Navigator 指导协作者如何将新文章组织到 Obsidian 仓库中，通过分析 `content_index.jsonl` 和 `tags_index.json` 文件提供建议：
- **文件夹位置**：保存新笔记的位置
- **标签选择**：应用哪些标签
- **交叉引用**：链接到哪些现有笔记
- **理由说明**：为什么这些建议合理

## 核心原则

1. **仅建议**：Skill 不会自动修改仓库
2. **JSONL 优先**：所有决策基于索引文件，而非完整仓库扫描
3. **上下文感知**：使用摘要、标签和链接找到相关连接
4. **一致性**：遵循仓库中已建立的模式
5. **标签去重**：参考 `tags_index.json` 避免创建同义标签

## 输入协议

### 必需参数

```typescript
interface SkillInput {
  /** content_index.jsonl 文件路径 */
  jsonl_path: string;

  /** tags_index.json 文件路径 */
  tags_json_path: string;

  /** 文章元数据 */
  article: {
    title: string;
    content: string;
    proposed_tags?: string[];
  };

  /** 用户意图/约束 */
  intent?: {
    topic_area?: string;
    related_to?: string[];
    avoid_folders?: string[];
  };
}
```

### 示例输入

```json
{
  "jsonl_path": "/path/to/content_index.jsonl",
  "tags_json_path": "/path/to/tags_index.json",
  "article": {
    "title": "Kubernetes Service Mesh 对比",
    "content": "本文对比 Istio、Linkerd 和 Consul Connect...",
    "proposed_tags": ["kubernetes", "microservices"]
  },
  "intent": {
    "topic_area": "infrastructure",
    "avoid_folders": ["archive", "drafts"]
  }
}
```

## 输出协议

### 响应格式

```typescript
interface SkillOutput {
  /** 建议的文件夹路径（相对于仓库根目录） */
  folder: string;

  /** 推荐的标签 */
  tags: string[];

  /** 建议引用的现有笔记 */
  references: Reference[];

  /** 建议的解释 */
  rationale: string;
}

interface Reference {
  /** 笔记 ID/路径 */
  note_id: string;
  /** 为什么这个笔记相关 */
  reason: string;
  /** 建议的链接文本 */
  link_text?: string;
}
```

### 示例输出

```json
{
  "folder": "infrastructure/kubernetes",
  "tags": ["kubernetes", "service-mesh", "microservices", "infrastructure"],
  "references": [
    {
      "note_id": "infrastructure/kubernetes-overview.md",
      "reason": "父主题 - 为 Kubernetes 架构提供上下文",
      "link_text": "Kubernetes 架构概览"
    },
    {
      "note_id": "architecture/microservices-patterns.md",
      "reason": "分布式系统的相关模式",
      "link_text": "微服务模式"
    }
  ],
  "rationale": "本文基于现有类似内容属于 Kubernetes 基础设施部分。它扩展了'kubernetes-overview'中涵盖的主题，并与微服务架构模式相关。标签与现有笔记保持一致。"
}
```

## 行为规则

### 必须做

- ✅ 始终提供 folder、tags、references 和 rationale
- ✅ 使用 JSONL 分析中的现有模式
- ✅ 建议共享标签或语义相似的引用
- ✅ 尊重意图约束（avoid_folders、topic_area）
- ✅ 保持摘要在 200 字符以内
- ✅ **关键**：参考 `tags_index.json` 避免创建同义标签
  - 如果建议标签是 "js" 但 "javascript" 已存在 → 使用 "javascript"
  - 如果建议标签是 "k8s" 但 "kubernetes" 已存在 → 使用 "kubernetes"
  - 如果建议标签是 "ai" 但 "artificial-intelligence" 已存在 → 使用 "artificial-intelligence"
  - 当两者都存在时，优先使用完整词而非缩写
  - 当两者都存在时，优先使用单数而非复数（例如，"note" 优于 "notes"）

### 禁止做

- ❌ 不要建议自动文件移动或修改
- ❌ 不要建议破坏性操作（删除、覆盖）
- ❌ 不要忽略用户意图约束
- ❌ 不要虚构 JSONL 中不存在的引用
- ❌ 不要在输出中包含文件写入命令

## 决策过程

1. **解析 JSONL**：加载并索引所有记录
2. **解析 Tags JSON**：加载现有标签列表用于去重
3. **提取关键词**：从文章标题和内容中提取
4. **查找匹配**：找到具有相似标签、标题或摘要的笔记
5. **评分候选**：按标签重叠、文件夹邻近度、语义相似度评分
6. **推荐**：评分最高的文件夹、相关标签、最佳引用
7. **解释**：为什么这些选择在仓库上下文中有意义

## 标签去重指南

在推荐标签之前，检查 `tags_index.json`：

| 用户建议 | 如果存在 | 使用 |
|---------|---------|------|
| js | javascript | javascript |
| k8s | kubernetes | kubernetes |
| ai | artificial-intelligence | artificial-intelligence |
| ml | machine-learning | machine-learning |
| db | database | database |
| api | api-gateway, rest-api | 根据上下文选择 |
| dev | development, developer | 根据上下文选择 |
| ops | operations, devops | 根据上下文选择 |

### 去重规则

1. **缩写 vs 完整词**：优先使用完整词
2. **单数 vs 复数**：优先使用单数
3. **美式 vs 英式拼写**：使用仓库中已有的形式
4. **连字符 vs 下划线**：遵循现有约定

## 错误处理

如果 JSONL 文件缺失或格式错误：
- 返回错误："索引文件未找到。请运行插件生成 content_index.jsonl"

如果 Tags JSON 文件缺失：
- 继续处理，但不进行标签去重
- 在 rationale 中注明："注意：未找到 tags_index.json，标签去重未应用"

## 相关文件

- `SKILL.md` - 英文版本
- `prompt-template.md` - Prompt 模板
- `examples.md` - 使用示例
