import * as XLSX from 'xlsx';

const questions = [
  ['问题'],
  ['贵公司是否通过 ISO 27001 认证？'],
  ['数据中心位于哪个地区？'],
  ['是否支持数据本地化部署？'],
  ['系统可用性 SLA 是多少？'],
  ['是否提供 7x24 技术支持？']
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(questions);
XLSX.utils.book_append_sheet(wb, ws, '安全问卷');
XLSX.writeFile(wb, 'test-questionnaire.xlsx');

console.log('✅ 测试文件已生成: test-questionnaire.xlsx');
