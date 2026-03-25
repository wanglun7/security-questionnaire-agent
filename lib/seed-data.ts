// 云图科技（CloudMap Tech）- 企业协作 SaaS 平台
export const seedKnowledge = [
  {
    question: "是否支持 SSO 单点登录？",
    answer: "支持基于 SAML 2.0 和 OIDC 的单点登录，可与企业统一身份平台集成。具体配置方式请联系技术支持团队。",
    category: "security",
    documentSource: "产品安全白皮书 v3.2"
  },
  {
    question: "数据是否加密存储？",
    answer: "所有数据采用 AES-256 加密存储，密钥由 KMS 管理。传输过程使用 TLS 1.3。详细加密架构可提供技术文档。",
    category: "security",
    documentSource: "数据安全说明文档"
  },
  {
    question: "是否通过等保三级认证？",
    answer: "已通过等保三级测评，详细证书信息可在线下提供，需人工确认最新有效期。",
    category: "compliance",
    documentSource: "等保测评报告"
  },
  {
    question: "是否支持信创环境部署？",
    answer: "支持麒麟操作系统、达梦数据库等信创环境，已完成基础适配。具体兼容性清单请联系售前团队确认。",
    category: "compliance",
    documentSource: "信创适配说明"
  },
  {
    question: "数据备份策略是什么？",
    answer: "每日全量备份，每小时增量备份，备份数据保留 30 天。详细灾备方案可由运维团队提供。",
    category: "security",
    documentSource: "灾备方案文档"
  },
  {
    question: "是否支持多因素认证（MFA）？",
    answer: "支持短信验证码、TOTP 等多因素认证方式。硬件令牌支持需根据部署环境确认。",
    category: "identity",
    documentSource: "身份认证说明"
  },
  {
    question: "日志保留多久？",
    answer: "操作日志保留 180 天，审计日志保留 1 年，符合现行内部审计要求。",
    category: "security",
    documentSource: "日志管理规范"
  },
  {
    question: "是否有渗透测试报告？",
    answer: "定期委托第三方执行渗透测试，最近一期报告可由安全团队提供，具体结果需人工确认。",
    category: "security",
    documentSource: "安全测试记录"
  },
  {
    question: "数据存储在哪里？",
    answer: "数据存储在中国境内的自建 IDC 机房，符合数据本地化要求。",
    category: "compliance",
    documentSource: "数据中心说明"
  },
  {
    question: "是否支持 API 接口？",
    answer: "提供 RESTful API 和 Webhook，支持与第三方系统集成。详细 API 文档可在开发者中心获取。",
    category: "product",
    documentSource: "API 文档"
  },
];
