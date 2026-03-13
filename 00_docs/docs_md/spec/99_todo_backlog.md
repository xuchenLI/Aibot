# 99 TODO Backlog（统一待定项）

> 规则：所有“待定”必须有唯一 ID、影响范围、决策人、状态。

## 状态枚举

- `OPEN`：待决策
- `DECIDED`：已决策待落地
- `DONE`：已落地

## Fast Path Router 待定项（阶段 0）

| ID | 主题 | 说明 | 影响文件 | 状态 |
|---|---|---|---|---|
| TODO-FP-001 | greeting 文案 | 问候类标准回复中英文模板（统一标定） | `fastpath/dialog_qa_bank.yaml` | OPEN |
| TODO-FP-002 | 工具用途 Q&A | 工具用途类问答清单与模板（统一标定） | `fastpath/dialog_qa_bank.yaml` | OPEN |
| TODO-FP-003 | 基础知识 Q&A | 葡萄酒基础知识首批问答库（统一标定） | `fastpath/dialog_qa_bank.yaml` | OPEN |
| TODO-FP-004 | 酒名/SKU 匹配 | 匹配优先级、别名、模糊匹配阈值 | `fastpath/wine_lookup_rules.yaml` | OPEN |
| TODO-FP-005 | 酒款介绍模板 | 介绍字段与渲染优先级 | `fastpath/wine_profile_template.yaml` | OPEN |
| TODO-FP-006 | 视频平台选择 | YouTube（已选）/ B站 / 私有存储 | `04_fastpath_router.md` | DECIDED |
| TODO-FP-007 | 视频展示方式 | 外链 / 弹窗内嵌播放器（已选） | `04_fastpath_router.md` | DECIDED |
| TODO-FP-008 | 选择题题库 | 首屏问题 + 关联问题（预设计映射） | `04_fastpath_router.md` | DECIDED |
| TODO-FP-009 | 命中边界 | 何时强制回 FULLPATH（阶段 0 暂缓） | `04_fastpath_router.md` | OPEN |
| TODO-FP-010 | 关联问题自动识别 | 后续是否引入 LLM 判定关联问题（阶段 0 不做） | `04_fastpath_router.md` | OPEN |
| TODO-FP-011 | 对话语言策略 | 跟随用户语言回复（已选） | `04_fastpath_router.md` | DECIDED |

## 使用约定

- 每次需求落地前，先检查相关 TODO 是否 `OPEN`。
- 若某项仍 `OPEN`，实现前必须先确认决策。
- 决策后改为 `DECIDED`，代码与文档完成后改为 `DONE`。

