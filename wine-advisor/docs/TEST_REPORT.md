# 受控 AI 选酒辅助系统 — V1 测试报告

| 项目 | 值 |
|---|---|
| **项目名称** | Wine Advisor（受控 AI 选酒辅助系统） |
| **测试日期** | 2026-02-09 |
| **测试框架** | Vitest 4.0.18 |
| **运行环境** | Node.js, Windows 10, Mock LLM 模式 |
| **测试执行时间** | 1.16s（transform 630ms, setup 0ms, import 929ms, tests 87ms） |
| **测试文件** | 4 个 |
| **测试用例** | 91 个 |
| **通过** | 91 |
| **失败** | 0 |
| **跳过** | 0 |
| **通过率** | **100%** |

---

## 一、测试架构总览

```
tests/
├── policy.test.ts    # M2 规则引擎单元测试         (30 tests)
├── guard.test.ts     # Output Guard 单元测试        (26 tests)
├── products.test.ts  # 产品匹配引擎单元测试         (24 tests)
└── pipeline.test.ts  # Pipeline 端到端集成测试       (11 tests)
```

**被测模块对应源码：**

| 被测模块 | 源文件 | 职责 |
|---|---|---|
| M2 规则引擎 | `src/lib/policy.ts` | 纯确定性状态裁决，不依赖 LLM |
| Output Guard | `src/lib/guard.ts` | LLM 输出的最终安全闸门 |
| 产品匹配 | `src/data/products.ts` | 多维度评分 + 过滤 + Top-K 推荐 |
| Pipeline | `src/lib/pipeline.ts` | M1→M2→匹配→生成→Guard 全链路 |
| 类型定义 | `src/lib/types.ts` | CanonicalParse, StateDecision, GuardResult 等 |

---

## 二、需求追溯矩阵

每个测试用例与 SPEC/CHANGELOG 中的需求条目对应关系：

| 需求编号 | 需求描述 | 覆盖测试 | 状态 |
|---|---|---|---|
| REQ-SM-01 | 系统有 4 个状态: S_ANSWER, S_CLARIFY, S_RECOMMEND, S_REFUSE | policy.test.ts 全部 | PASS |
| REQ-SM-02 | 状态转换受约束: S_REFUSE→S_RECOMMEND 非法 | 状态转换验证 (6 tests) | PASS |
| REQ-SM-03 | 死锁检测: 连续 3 轮 S_CLARIFY 自动 S_REFUSE | 死锁检测 (3 tests) | PASS |
| REQ-M2-01 | out_of_scope 输入完全拒绝 | RULE_REFUSE_OUT_OF_SCOPE | PASS |
| REQ-M2-02 | 竞品比较(external_comparison)完全拒绝 | RULE_REFUSE_EXTERNAL_COMPARISON | PASS |
| REQ-M2-03 | 鼓励饮酒(encourage_drinking)完全拒绝 | RULE_REFUSE_ENCOURAGE_DRINKING | PASS |
| REQ-M2-04 | 未成年人(minor_related)完全拒绝 | RULE_REFUSE_MINOR_RELATED | PASS |
| REQ-M2-05 | 健康声称(health_claim)无合法意图时完全拒绝 | RULE_REFUSE_HEALTH_CLAIM (2 tests) | PASS |
| REQ-M2-06 | 拒绝优先级 > 一切（即使有合法 entity） | M2 优先级 (4 tests) | PASS |
| REQ-M2-07 | 缺少 ≥2 个关键 slot → S_CLARIFY | RULE_CLARIFY_MISSING_SLOTS | PASS |
| REQ-M2-08 | need_clarify=true → S_CLARIFY | RULE_CLARIFY_NEED_CLARIFY_FLAG | PASS |
| REQ-M2-09 | 高冲突(severity≥0.6) → S_CLARIFY | RULE_CLARIFY_HIGH_CONFLICT | PASS |
| REQ-M2-10 | 低冲突(severity<0.6) 不触发澄清 | 低冲突不触发澄清 | PASS |
| REQ-M2-11 | ask_info + 无风险 → S_ANSWER | RULE_ANSWER_ASK_INFO | PASS |
| REQ-M2-12 | ask_info + health_claim → S_REFUSE（拒绝优先） | ask_info + health_claim | PASS |
| REQ-M2-13 | 推荐意图 + 足够信息 → S_RECOMMEND | RULE_RECOMMEND_CLEAR_INTENT | PASS |
| REQ-OPT1-01 | health_claim + 推荐意图 + 有 entity → 部分拒绝 | OPT-1 部分拒绝 (2 tests) | PASS |
| REQ-OPT1-02 | minor_related/encourage_drinking 不可部分拒绝 | M2 优先级 (2 tests) | PASS |
| REQ-OPT1-03 | 部分拒绝含 refused_flags + forbidden_topics | OPT-1 字段验证 | PASS |
| REQ-GD-01 | Guard 检测鼓励饮酒语句(中英文) → BLOCK | Guard: 鼓励饮酒 (4 tests) | PASS |
| REQ-GD-02 | Guard 检测未成年人相关(中英文) → BLOCK | Guard: 未成年人 (3 tests) | PASS |
| REQ-GD-03 | Guard 检测健康硬声称(cure/prevent/防癌) → BLOCK | Guard: 健康声称硬规则 (3 tests) | PASS |
| REQ-GD-04 | Guard 状态感知: S_REFUSE+HEALTH 时检测软健康语言 | Guard: 健康软性语言 (5 tests) | PASS |
| REQ-GD-05 | Guard 状态感知: S_CLARIFY/S_REFUSE 时酒名泄露 → BLOCK | Guard: 酒名泄露 (5 tests) | PASS |
| REQ-GD-06 | Guard: 绝对化措辞仅 WARN 不 BLOCK | Guard: 绝对化措辞 (2 tests) | PASS |
| REQ-GD-07 | Guard BLOCK 时提供有引导性的 Fallback 文案 | Guard: Fallback 文案 (2 tests) | PASS |
| REQ-GD-08 | OPT-1 partial_refuse 下 Guard 健康检测生效 | OPT-1 Guard (2 tests) | PASS |
| REQ-PM-01 | 产品数据完整性: 必填字段、唯一 SKU/ID、颜色覆盖 | 产品数据完整性 (5 tests) | PASS |
| REQ-PM-02 | 评分算法: 颜色/品种/价格/多维度匹配影响得分 | 评分算法 (8 tests) | PASS |
| REQ-PM-03 | 过滤: 按颜色/价格/多条件/空条件/无匹配 | 过滤 (6 tests) | PASS |
| REQ-PM-04 | Top-K: 排序正确、阈值过滤(≥40)、空结果处理 | Top-K 推荐 (5 tests) | PASS |
| REQ-INT-01 | Pipeline 全链路 M1→M2→匹配→生成→Guard 不崩溃 | Pipeline 推荐流程 (3 tests) | PASS |
| REQ-INT-02 | Pipeline Debug 信息完整: canonical, state, guard | Pipeline Debug (2 tests) | PASS |
| REQ-INT-03 | Pipeline 边界输入: 超长/XSS/中文/emoji/单字 | Pipeline 边界 (5 tests) | PASS |

---

## 三、详细测试用例清单

### 3.1 M2 规则引擎 — `policy.test.ts` (30 tests)

#### 3.1.1 拒绝类规则 (9 tests)

| # | 用例名 | 输入构造 | 期望输出 | 实际输出 | 耗时 | 结果 |
|---|---|---|---|---|---|---|
| 1 | RULE_REFUSE_OUT_OF_SCOPE | `intent: "out_of_scope"` | `state: S_REFUSE`, reasons 含 `RULE_REFUSE_OUT_OF_SCOPE` | state=S_REFUSE, reasons=["RULE_REFUSE_OUT_OF_SCOPE"] | 2ms | PASS |
| 2 | RULE_REFUSE_EXTERNAL_COMPARISON | `risk_flags: [{flag:"external_comparison", source_text:"Yellow Tail"}]` | `state: S_REFUSE`, reasons 含 `RULE_REFUSE_EXTERNAL_COMPARISON` | state=S_REFUSE, reasons 匹配 | 0ms | PASS |
| 3 | RULE_REFUSE_ENCOURAGE_DRINKING | `risk_flags: [{flag:"encourage_drinking", source_text:"多喝点"}]` | `state: S_REFUSE`, reasons 含 `RULE_REFUSE_ENCOURAGE_DRINKING` | state=S_REFUSE, reasons 匹配 | 0ms | PASS |
| 4 | RULE_REFUSE_MINOR_RELATED | `risk_flags: [{flag:"minor_related", source_text:"给孩子"}]` | `state: S_REFUSE`, reasons 含 `RULE_REFUSE_MINOR_RELATED` | state=S_REFUSE, reasons 匹配 | 0ms | PASS |
| 5 | RULE_REFUSE_HEALTH_CLAIM (无推荐意图) | `intent:"ask_info", risk_flags:[{flag:"health_claim"}]` | `state: S_REFUSE`, reasons 含 `RULE_REFUSE_HEALTH_CLAIM` | state=S_REFUSE, reasons 匹配 | 1ms | PASS |
| 6 | RULE_REFUSE_HEALTH_CLAIM (推荐+无entity) | `intent:"recommend_wine", entities:{}, risk_flags:[{flag:"health_claim"}]` | `state: S_REFUSE` | state=S_REFUSE | 0ms | PASS |
| 7 | RULE_REFUSE_CLARIFY_DEADLOCK (3轮) | `need_clarify:true`, history=`[S_CLARIFY×3]` | `state: S_REFUSE`, reasons 含 `RULE_REFUSE_CLARIFY_DEADLOCK` | state=S_REFUSE, reasons 匹配 | 0ms | PASS |
| 8 | 不触发死锁 (2轮) | `need_clarify:true`, history=`[S_CLARIFY×2]` | `state ≠ S_REFUSE` | state=S_CLARIFY | 1ms | PASS |
| 9 | 不触发死锁 (穿插) | `need_clarify:true`, history=`[S_CLARIFY,S_ANSWER,S_CLARIFY]` | reasons 不含 `RULE_REFUSE_CLARIFY_DEADLOCK` | 不含 | 0ms | PASS |

#### 3.1.2 优先级测试 (4 tests)

| # | 用例名 | 输入构造 | 期望输出 | 实际输出 | 耗时 | 结果 |
|---|---|---|---|---|---|---|
| 10 | out_of_scope + 有 entity → 拒绝优先 | `intent:"out_of_scope", entities:{color:"red"}` | `state: S_REFUSE` | S_REFUSE | 0ms | PASS |
| 11 | external_comparison + 推荐意图 → 拒绝优先 | `intent:"recommend_wine", risk_flags:[external_comparison]` | `state: S_REFUSE` | S_REFUSE | 0ms | PASS |
| 12 | minor_related 不可部分拒绝 | `intent:"recommend_wine", entities:{color,occasion}, risk_flags:[minor_related]` | `state: S_REFUSE, partial_refuse: undefined` | S_REFUSE, undefined | 0ms | PASS |
| 13 | encourage_drinking 不可部分拒绝 | `intent:"recommend_wine", entities:{color}, risk_flags:[encourage_drinking]` | `state: S_REFUSE, partial_refuse: undefined` | S_REFUSE, undefined | 0ms | PASS |

#### 3.1.3 OPT-1 部分拒绝 (2 tests)

| # | 用例名 | 输入构造 | 期望输出 | 实际输出 | 耗时 | 结果 |
|---|---|---|---|---|---|---|
| 14 | health_claim + 有 entity → 部分拒绝 | `intent:"recommend_wine", entities:{occasion:"gift"}, risk_flags:[{flag:"health_claim",source_text:"对健康好的"}]` | `state:S_RECOMMEND, partial_refuse.refused_flags[0].flag="health_claim", forbidden_topics 含 "health benefits..."` | 全部匹配 | 1ms | PASS |
| 15 | external_comparison 不走部分拒绝 | `intent:"recommend_wine", entities:{color}, risk_flags:[external_comparison]` | `state: S_REFUSE`（优先级 1050 > 950） | S_REFUSE | 0ms | PASS |

#### 3.1.4 澄清类规则 (4 tests)

| # | 用例名 | 输入构造 | 期望输出 | 实际输出 | 耗时 | 结果 |
|---|---|---|---|---|---|---|
| 16 | MISSING_SLOTS ≥ 2 | `missing_slots:["color","body"]` | `state:S_CLARIFY, required_slots_missing=["color","body"]` | 匹配 | 0ms | PASS |
| 17 | need_clarify=true | `need_clarify:true, missing_slots:["color"]` | `state:S_CLARIFY` | S_CLARIFY | 0ms | PASS |
| 18 | 高冲突(severity 0.7) | `conflicts:[{severity:0.7}]` | `state:S_CLARIFY, conflict_summary 含描述` | 匹配 | 0ms | PASS |
| 19 | 低冲突(severity 0.3)不触发 | `conflicts:[{severity:0.3}]` | `state ≠ S_CLARIFY` | S_RECOMMEND | 0ms | PASS |

#### 3.1.5 信息+推荐类规则 (4 tests)

| # | 用例名 | 输入构造 | 期望输出 | 实际输出 | 耗时 | 结果 |
|---|---|---|---|---|---|---|
| 20 | ask_info + 无风险 → S_ANSWER | `intent:"ask_info"` | `state:S_ANSWER` | S_ANSWER | 0ms | PASS |
| 21 | ask_info + health_claim → S_REFUSE | `intent:"ask_info", risk_flags:[health_claim]` | `state:S_REFUSE` | S_REFUSE | 0ms | PASS |
| 22 | 推荐 + 足够信息 → S_RECOMMEND | `entities:{color,body}, missing_slots:["occasion"]` | `state:S_RECOMMEND` | S_RECOMMEND | 0ms | PASS |
| 23 | 推荐 + 缺太多 → S_CLARIFY | `missing_slots:["color","body","occasion"]` | `state:S_CLARIFY` | S_CLARIFY | 0ms | PASS |

#### 3.1.6 Fallback (1 test)

| # | 用例名 | 输入构造 | 期望输出 | 实际输出 | 耗时 | 结果 |
|---|---|---|---|---|---|---|
| 24 | 不崩溃 + 有返回 | 边缘 parse | `state/reasons 均 defined` | 均 defined | 0ms | PASS |

#### 3.1.7 状态转换验证 (6 tests)

| # | 用例名 | From → To | 期望 | 实际 | 耗时 | 结果 |
|---|---|---|---|---|---|---|
| 25 | null → 任意 | null → S_RECOMMEND/S_CLARIFY/S_ANSWER/S_REFUSE | 全部 true | true | 0ms | PASS |
| 26 | S_REFUSE → S_RECOMMEND | S_REFUSE → S_RECOMMEND | **false**（非法） | false | 0ms | PASS |
| 27 | S_REFUSE → S_CLARIFY | S_REFUSE → S_CLARIFY | true（合法） | true | 0ms | PASS |
| 28 | S_CLARIFY → S_RECOMMEND | S_CLARIFY → S_RECOMMEND | true | true | 0ms | PASS |
| 29 | S_RECOMMEND → S_ANSWER | S_RECOMMEND → S_ANSWER | true | true | 0ms | PASS |
| 30 | S_ANSWER → S_REFUSE | S_ANSWER → S_REFUSE | true | true | 0ms | PASS |

---

### 3.2 Output Guard — `guard.test.ts` (26 tests)

#### 3.2.1 鼓励饮酒检测 (4 tests)

| # | 用例名 | LLM 输出文本 | 当前状态 | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|---|
| 1 | 'drink more' | "You should drink more wine!" | S_RECOMMEND | BLOCK + `ENCOURAGE_DRINKING_DETECTED` | BLOCK + 匹配 | PASS |
| 2 | '多喝' | "建议你多喝几杯" | S_RECOMMEND | BLOCK | BLOCK | PASS |
| 3 | 'have another glass' | "Why not have another glass?" | S_RECOMMEND | BLOCK | BLOCK | PASS |
| 4 | 正常推荐不触发 | "This wine pairs beautifully with grilled steak." | S_RECOMMEND | ALLOW | ALLOW | PASS |

#### 3.2.2 未成年人检测 (3 tests)

| # | 用例名 | LLM 输出文本 | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|
| 5 | 'for kids' | "Here's a great wine for kids" | BLOCK + `MINOR_RELATED_CONTENT` | BLOCK + 匹配 | PASS |
| 6 | '给孩子喝' | "这款酒适合给小孩喝" | BLOCK | BLOCK | PASS |
| 7 | 'family dinner' 不触发 | "Perfect for a family dinner gathering" | ALLOW | ALLOW | PASS |

#### 3.2.3 健康声称硬规则 (3 tests)

| # | 用例名 | LLM 输出文本 | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|
| 8 | 'cure cancer' | "Wine can cure cancer" | BLOCK + `HEALTH_CLAIM_DETECTED` | BLOCK + 匹配 | PASS |
| 9 | '防癌' | "红酒防癌效果好" | BLOCK | BLOCK | PASS |
| 10 | 'prevent heart disease' | "This wine prevents heart disease" | BLOCK | BLOCK | PASS |

#### 3.2.4 健康软性语言（状态感知） (5 tests)

| # | 用例名 | 状态上下文 | LLM 输出 | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|---|
| 11 | S_REFUSE + HEALTH → 'healthy' | `S_REFUSE, reasons:[HEALTH_CLAIM]` | "Here's a healthy wine option" | BLOCK + `HEALTH_TOPIC_IN_REFUSE_STATE` | BLOCK + 匹配 | PASS |
| 12 | S_REFUSE + HEALTH → '养生' | `S_REFUSE, reasons:[HEALTH_CLAIM]` | "这款养生酒很受欢迎" | BLOCK | BLOCK | PASS |
| 13 | S_RECOMMEND 正常 → 'healthy' 不触发 | `S_RECOMMEND` (无 partial_refuse) | "healthy acidity balance" | ALLOW | ALLOW | PASS |
| 14 | OPT-1: partial_refuse → 'healthy' | `S_RECOMMEND + partial_refuse(health_claim)` | "Here's a healthy wine option" | BLOCK + `HEALTH_TOPIC_IN_PARTIAL_REFUSE` | BLOCK + 匹配 | PASS |
| 15 | OPT-1: partial_refuse → 正常推荐 | `S_RECOMMEND + partial_refuse(health_claim)` | 纯酒推荐文本（无健康词） | ALLOW | ALLOW | PASS |

#### 3.2.5 酒名泄露（状态感知） (5 tests)

| # | 用例名 | 状态 | LLM 输出 | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|---|
| 16 | S_RECOMMEND 允许酒名 | S_RECOMMEND | "Estate Reserve Cabernet Sauvignon (WR-001)" | ALLOW | ALLOW | PASS |
| 17 | S_ANSWER 允许酒名 | S_ANSWER | "Our Highland Pinot Noir is a great example" | ALLOW | ALLOW | PASS |
| 18 | S_CLARIFY 不允许酒名 | S_CLARIFY | "How about the Estate Reserve Cabernet Sauvignon?" | BLOCK + `WINE_NAME_IN_FORBIDDEN_STATE` | BLOCK + 匹配 | PASS |
| 19 | S_REFUSE 不允许酒名 | S_REFUSE | "Try our Lakeside Merlot instead" | BLOCK | BLOCK | PASS |
| 20 | S_CLARIFY 不允许 SKU | S_CLARIFY | "You might like WR-001" | BLOCK | BLOCK | PASS |

#### 3.2.6 绝对化措辞 (2 tests)

| # | 用例名 | LLM 输出 | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|
| 21 | 'guaranteed satisfaction' | "This wine comes with guaranteed satisfaction!" | ALLOW + WARN(`SUPERLATIVE_DETECTED`) | ALLOW + WARN | PASS |
| 22 | '保证满意' | "这款酒保证你满意" | ALLOW + WARN | ALLOW + WARN | PASS |

#### 3.2.7 正常通过 (2 tests)

| # | 用例名 | LLM 输出 | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|
| 23 | 纯净英文推荐 | 完整推荐含 SKU+价格+描述 (161 chars) | ALLOW, violations=[], reason_codes=[] | 全匹配 | PASS |
| 24 | 纯净中文推荐 | 完整中文推荐含 SKU+价格 | ALLOW, reason_codes=[] | 全匹配 | PASS |

#### 3.2.8 Fallback 文案 (2 tests)

| # | 用例名 | 触发场景 | 期望 Fallback 行为 | 实际 | 结果 |
|---|---|---|---|---|---|
| 25 | BLOCK 时有引导文案 | 鼓励饮酒 → BLOCK | `final_text.length > 10`, 含 "catalog/目录/help/帮" | 匹配 | PASS |
| 26 | OPT-1 partial BLOCK 引导继续 | partial_refuse + 健康词 → BLOCK | fallback 含 "preference/偏好/occasion/场合/找到" | 匹配 | PASS |

---

### 3.3 产品匹配引擎 — `products.test.ts` (24 tests)

#### 3.3.1 数据完整性 (5 tests)

| # | 用例名 | 断言 | 结果 |
|---|---|---|---|
| 1 | 有 8 款示例酒 | `WINE_PRODUCTS.length === 8` | PASS |
| 2 | 每款酒必填字段存在 | id, name, sku, color∈{red,white,rose,sparkling}, price>0, body, acid, sweetness | PASS |
| 3 | SKU 唯一 | `Set(skus).size === skus.length` | PASS |
| 4 | ID 唯一 | `Set(ids).size === ids.length` | PASS |
| 5 | 覆盖 4 种颜色 | red, white, rose, sparkling 均存在 | PASS |

#### 3.3.2 评分算法 `scoreProduct` (8 tests)

| # | 用例名 | 输入 | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|
| 6 | 颜色匹配加分 | WR-001(red) + `{color:"red"}` vs `{color:"white"}` | 匹配 > 不匹配 | 70 > 30 | PASS |
| 7 | 颜色不匹配扣分 | WR-001 + `{color:"white"}` vs `{}` | 不匹配 < 无条件 | 30 < 50 | PASS |
| 8 | 多维度匹配高分 | WR-001 + `{color,tannin,body,food}` | ≥ 80 | 90 | PASS |
| 9 | 完全不匹配低分 | WR-001 + 全反向 entities | < 30 | 10 | PASS |
| 10 | 价格在范围加分 | WR-002($26.99) + range[20,30] vs range[40,60] | 范围内 > 范围外 | 60 > 40 | PASS |
| 11 | 空 entities 基础分 | 任意酒 + `{}` | = 50 | 50 | PASS |
| 12 | 品种匹配加分 | Pinot Noir + `{grape:"Pinot Noir"}` vs `{grape:"Cabernet"}` | 匹配 > 不匹配 | 65 > 45 | PASS |
| 13 | 得分范围 0-100 | 8 款酒 × 极端匹配/不匹配 | 全部 ∈ [0, 100] | 全部符合 | PASS |

#### 3.3.3 过滤 `filterProducts` (6 tests)

| # | 用例名 | 输入 | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|
| 14 | 按颜色: red | `{color:"red"}` | 全部 color=red, count>0 | 3 款红酒 | PASS |
| 15 | 按颜色: sparkling | `{color:"sparkling"}` | 1 款, sku=WS-001 | 匹配 | PASS |
| 16 | 多条件: red + full body | `{color:"red", body:"full"}` | 全部满足两个条件 | 匹配 | PASS |
| 17 | 价格: max=25 | `{price_max:25}` | 全部 price≤25 | 匹配 | PASS |
| 18 | 空过滤 | `{}` | 返回全部 8 款 | 8 | PASS |
| 19 | 无匹配 | `{color:"red", sweetness:"sweet"}` | 空数组 | [] | PASS |

#### 3.3.4 Top-K 推荐 `getTopRecommendations` (5 tests)

| # | 用例名 | 输入 | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|
| 20 | red+steak → Cabernet 第一 | `{color:"red",food:"steak"}, K=3` | 降序排列, [0].grape 含 "Cabernet" | Cabernet Sauvignon 第一, 降序 | PASS |
| 21 | white+light → 白酒第一 | `{color:"white",body:"light"}, K=3` | [0].color="white" | white | PASS |
| 22 | 低于 40 分被过滤 | `{color:"red"}, K=10` | 全部 _score ≥ 40 | 全部 ≥ 40 | PASS |
| 23 | 空 entities → 基础分 | `{}, K=3` | 3 款, 全部 _score=50 | 匹配 | PASS |
| 24 | 极端不匹配 | `{color:"sparkling",tannin:"strong",body:"full"}` | 可能为空或全部 ≥ 40 | 全部 ≥ 40 | PASS |

---

### 3.4 Pipeline 端到端集成 — `pipeline.test.ts` (11 tests)

> **注意**: 使用 Mock LLM 模式 (`OPENAI_API_KEY="mock"`)，M1 返回固定的 `{intent:"recommend_wine", entities:{}, risk_flags:[]}`, LLM 生成使用 Mock 回复。测试目标是验证全链路不崩溃、数据结构完整、Guard 正确执行。

#### 3.4.1 推荐流程 (3 tests)

| # | 用例名 | 用户输入 | Pipeline 日志 | 期望 | 结果 |
|---|---|---|---|---|---|
| 1 | 清晰推荐意图 | "I want a full-bodied red wine for steak under $40" | M1→S_RECOMMEND→3 wines→Guard:ALLOW | reply 非空, state/intent/guard 均 defined | PASS |
| 2 | 空历史不崩溃 | "recommend a wine" + history=[] | M1→S_RECOMMEND→Guard:ALLOW | reply 非空 | PASS |
| 3 | 有历史不崩溃 | "how about something cheaper" + 2轮历史 + [S_CLARIFY] | M1→S_RECOMMEND→Guard:ALLOW | reply 非空 | PASS |

**Pipeline 链路日志示例（Test #1）:**
```
[Pipeline] Step 1: M1 parsing...
[Pipeline] M1 result: {"intent":"recommend_wine","entities":{},"risk_flags":[],"need_clarify":false,"missing_slots":[],"conflicts":[]}
[Pipeline] Step 2: M2 policy evaluation...
[Pipeline] M2 result: S_RECOMMEND reasons: ["RULE_RECOMMEND_CLEAR_INTENT"]
[Pipeline] Step 3: Product matching...
[Pipeline] Matched wines: 3
[Pipeline] Step 4: Controlled generation (state: S_RECOMMEND)
[Pipeline] Step 5: Output Guard...
[Pipeline] Guard result: ALLOW (clean)
```

#### 3.4.2 Guard 拦截 (1 test)

| # | 用例名 | 输入 | 期望 | 结果 |
|---|---|---|---|---|
| 4 | Guard 结果总是存在 | "hello" | `_debug.guard_result` defined, decision defined, violations defined | PASS |

#### 3.4.3 Debug 信息完整性 (2 tests)

| # | 用例名 | 输入 | 验证字段 | 结果 |
|---|---|---|---|---|
| 5 | Debug 三大件 | "red wine for dinner" | `_debug.canonical.{intent,entities,risk_flags}`, `_debug.state_decision.{state,reasons}`, `_debug.guard_result.{decision}` 全部 defined | PASS |
| 6 | wines 字段可能有值 | "recommend me a wine" | S_RECOMMEND 时 wines[].sku 非空 | PASS |

#### 3.4.4 边界情况 (5 tests)

| # | 用例名 | 输入 | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|
| 7 | 超长输入 | "I want a wine " × 200 (2800 chars) | 不崩溃, reply 非空 | reply 有值 | PASS |
| 8 | XSS 攻击 | `<script>alert("xss")</script>` | 不崩溃, reply 非空 | reply 有值 | PASS |
| 9 | 纯中文 | "推荐一款红酒配牛排" | 不崩溃, reply 非空 | reply 有值 | PASS |
| 10 | emoji | "🍷 red wine please 🥩" | 不崩溃, reply 非空 | reply 有值 | PASS |
| 11 | 单字 | "hi" | 不崩溃, reply 非空 | reply 有值 | PASS |

---

## 四、规则优先级验证总结

系统规则按优先级从高到低排列，测试验证了竞争条件下高优先级总是胜出：

```
Priority 1100  RULE_REFUSE_OUT_OF_SCOPE          ✅ 验证: #1, #10
Priority 1050  RULE_REFUSE_EXTERNAL_COMPARISON    ✅ 验证: #2, #11, #15
Priority 1040  RULE_REFUSE_ENCOURAGE_DRINKING     ✅ 验证: #3, #13
Priority 1030  RULE_REFUSE_MINOR_RELATED          ✅ 验证: #4, #12
Priority 1020  RULE_REFUSE_HEALTH_CLAIM           ✅ 验证: #5, #6, #21
Priority 1010  RULE_REFUSE_CLARIFY_DEADLOCK       ✅ 验证: #7, #8, #9
Priority  950  RULE_PARTIAL_REFUSE_RECOMMEND      ✅ 验证: #14
Priority  500  RULE_CLARIFY_MISSING_SLOTS         ✅ 验证: #16, #23
Priority  490  RULE_CLARIFY_NEED_CLARIFY_FLAG     ✅ 验证: #17
Priority  480  RULE_CLARIFY_HIGH_CONFLICT         ✅ 验证: #18, #19
Priority  200  RULE_ANSWER_ASK_INFO               ✅ 验证: #20
Priority  100  RULE_RECOMMEND_CLEAR_INTENT        ✅ 验证: #22
```

---

## 五、Guard 多层检测覆盖总结

Guard 的 6 类检测规则，中英文双语覆盖：

| 检测类别 | 判定级别 | 英文验证 | 中文验证 | 状态感知 |
|---|---|---|---|---|
| 鼓励饮酒 | BLOCK | "drink more", "have another glass" | "多喝" | 任何状态 |
| 未成年人 | BLOCK | "for kids" | "给孩子喝" | 任何状态 |
| 健康硬声称 | BLOCK | "cure cancer", "prevent heart disease" | "防癌" | 任何状态 |
| 健康软语言 | BLOCK | "healthy option" | "养生" | 仅 S_REFUSE(HEALTH) 或 OPT-1 partial |
| 酒名泄露 | BLOCK | 酒名 + SKU | — | 仅 S_CLARIFY, S_REFUSE |
| 绝对化措辞 | WARN | "guaranteed satisfaction" | "保证满意" | 任何状态（仅警告） |

---

## 六、状态机转换矩阵

| From ╲ To | S_ANSWER | S_CLARIFY | S_RECOMMEND | S_REFUSE |
|---|---|---|---|---|
| **null (初始)** | ✅ 合法 | ✅ 合法 | ✅ 合法 | ✅ 合法 |
| **S_ANSWER** | ✅ 合法 | ✅ 合法 | ✅ 合法 | ✅ 合法 |
| **S_CLARIFY** | ✅ 合法 | ✅ 合法 | ✅ 合法 | ✅ 合法 |
| **S_RECOMMEND** | ✅ 合法 | ✅ 合法 | ✅ 合法 | ✅ 合法 |
| **S_REFUSE** | ❌ 非法 | ✅ 合法 | ❌ **非法** | ✅ 合法 |

**关键约束**: `S_REFUSE → S_RECOMMEND` 和 `S_REFUSE → S_ANSWER` 被阻止，防止用户通过对话绕过拒绝。

---

## 七、测试局限性与后续计划

### 当前局限

| 局限 | 原因 | 影响 | 后续方案 |
|---|---|---|---|
| M1 Parser 未独立测试 | 依赖真实 LLM 调用，Mock 模式返回固定值 | M1 Prompt 的解析准确率未验证 | 接入真实数据后补充 M1 回归测试集 |
| Pipeline 集成仅 Mock | LLM 返回固定回复 | 无法验证真实 LLM 生成质量 | Tuning 阶段用真实 API 跑验收用例 |
| 产品数据为示例 | 当前 8 款示例酒 | 替换真实 20 款后需重跑 | 数据导入后自动回归 |
| 前端未测试 | 仅后端逻辑测试 | UI 交互未覆盖 | 后续按需补充 E2E 测试 |
| 并发安全未测试 | 单线程 Mock | 多用户并发场景未验证 | 部署后压力测试 |

### 后续测试计划

1. **M1 回归测试集** — 用 30+ 真实用户输入验证 M1 解析准确率（Tuning Phase 2）
2. **真实 LLM 集成测试** — 用真实 OpenAI API 跑 10 个核心场景，验证端到端效果
3. **数据回归** — 替换真实产品后自动 `npm test`，确保匹配/过滤/TopK 不退化
4. **E2E 前端测试** — 按需补充 Playwright/Cypress 测试

---

## 八、结论

| 维度 | 评估 |
|---|---|
| **规则引擎 (M2)** | 12 条规则 + 死锁 + 优先级全覆盖，逻辑正确 |
| **输出安全 (Guard)** | 6 类检测 × 中英文 × 状态感知，拦截可靠 |
| **产品匹配** | 评分/过滤/TopK 算法正确，边界安全 |
| **全链路 Pipeline** | M1→M2→匹配→生成→Guard 无断链，Debug 信息完整 |
| **状态机** | 转换约束正确，死锁检测有效 |
| **鲁棒性** | 超长/XSS/中文/emoji/单字输入均不崩溃 |
| **总体判定** | **V1 后端逻辑验证通过，可进入真实数据接入阶段** |

---

*报告生成时间: 2026-02-09 15:06 EST*
*测试执行: `npx vitest run --reporter=verbose`*
*Git Commit: 27e8db6 (test: add comprehensive test suite)*
