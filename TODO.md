# TODO

## 待优化功能

### Reranker 二次精排
- **目标**: 在向量检索后增加 reranker 模型做精准排序
- **方案**:
  - 先用 embedding 召回 topK (如 top 10)
  - 用 reranker 对召回结果重新打分排序
  - 取 top 3-5 喂给 LLM
- **推荐模型**: 阿里云 `qwen3-rerank` 或其他 cross-encoder 模型
- **优先级**: 中
- **预计改动**:
  - 修改检索逻辑：增加 rerank 步骤
  - 更新 API 调用：接入 reranker 接口
