import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPORT_TITLE = 'A股午评';
export const OUTPUT_NAMES = ['午盘全景与资金风格', '题材温度与涨跌停结构'];
export const REQUIRED_SOURCE_COVERAGE = ['financial_analysis', 'eastmoney', 'cls', 'stcn_databao'];
export const REQUIRED_INDICES = ['上证指数', '深证成指', '创业板指'];
export const REQUIRED_TEMPERATURE_FACTORS = new Map([
  ['指数强度', 18],
  ['市场广度', 16],
  ['量能变化', 12],
  ['资金风格', 14],
  ['涨停质量', 22],
  ['风险反馈控制', 18]
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MIDDAY_DATA_SCHEMA_PATH = path.resolve(__dirname, '../../references/midday-data.schema.json');

export function outputPngName(reportDate, pageNumber) {
  const title = OUTPUT_NAMES[pageNumber - 1];
  const page = String(pageNumber).padStart(2, '0');
  return `${reportDate}-${REPORT_TITLE}-${page}-${title}.png`;
}

export function reportHtmlName(reportDate) {
  return `${reportDate}-midday-report.html`;
}

export function viewpointName(reportDate) {
  return `${reportDate}-上午市场观点.txt`;
}

export function sourceNotesName(reportDate) {
  return `${reportDate}-数据来源与口径.md`;
}

export function middayDataName(reportDate) {
  return `${reportDate}-midday-data.json`;
}

export function wechatCommentaryText(data) {
  return String(data?.wechat_commentary_v1?.text ?? '').trim();
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function pctText(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  const n = Number(value);
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export function marketClass(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return 'neutral';
  return n > 0 ? 'bullish' : 'bearish';
}

export function flowClass(value) {
  const text = String(value ?? '');
  const n = Number(value);
  if (Number.isFinite(n) && n !== 0) return n > 0 ? 'bullish' : 'bearish';
  if (/^-|净流出|流出|下跌|缩量|风险|弱|退潮|分歧/.test(text)) return 'bearish';
  if (/^\+|净流入|流入|上涨|放量|强|确认|修复|扩散/.test(text)) return 'bullish';
  return 'neutral';
}

export async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pathText(parts) {
  if (!parts.length) return '$';
  return parts.reduce((result, part) => {
    if (typeof part === 'number') return `${result}[${part}]`;
    return result === '$' ? part : `${result}.${part}`;
  }, '$');
}

function matchesType(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return isPlainObject(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  return true;
}

function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolveSchemaRef(rootSchema, ref) {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported schema ref: ${ref}`);
  return ref.slice(2).split('/').reduce((cursor, rawPart) => {
    const part = rawPart.replaceAll('~1', '/').replaceAll('~0', '~');
    return cursor?.[part];
  }, rootSchema);
}

function validateSchemaNode(value, schema, rootSchema, parts, errors) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.$ref) {
    const resolved = resolveSchemaRef(rootSchema, schema.$ref);
    if (!resolved) {
      errors.push(`schema: unresolved ref ${schema.$ref} at ${pathText(parts)}`);
      return;
    }
    validateSchemaNode(value, resolved, rootSchema, parts, errors);
    return;
  }
  if (schema.const !== undefined && !sameJsonValue(value, schema.const)) {
    errors.push(`schema: ${pathText(parts)} must equal ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.some((item) => sameJsonValue(value, item))) {
    errors.push(`schema: ${pathText(parts)} must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`);
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, type))) {
      errors.push(`schema: ${pathText(parts)} must be ${types.join(' or ')}`);
      return;
    }
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`schema: ${pathText(parts)} length must be at least ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`schema: ${pathText(parts)} length must be at most ${schema.maxLength}`);
    }
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) {
      errors.push(`schema: ${pathText(parts)} must match ${schema.pattern}`);
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`schema: ${pathText(parts)} must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`schema: ${pathText(parts)} must be <= ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`schema: ${pathText(parts)} must contain at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`schema: ${pathText(parts)} must contain at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((item, index) => validateSchemaNode(item, schema.items, rootSchema, [...parts, index], errors));
  }
  if (isPlainObject(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`schema: ${pathText([...parts, key])} is required`);
    }
    const known = new Set(Object.keys(schema.properties ?? {}));
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) validateSchemaNode(value[key], childSchema, rootSchema, [...parts, key], errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!known.has(key)) errors.push(`schema: ${pathText([...parts, key])} is not allowed`);
      }
    } else if (isPlainObject(schema.additionalProperties)) {
      for (const key of Object.keys(value)) {
        if (!known.has(key)) validateSchemaNode(value[key], schema.additionalProperties, rootSchema, [...parts, key], errors);
      }
    }
  }
}

export async function validateMiddayDataAgainstSchema(data, schemaPath = MIDDAY_DATA_SCHEMA_PATH) {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const errors = [];
  validateSchemaNode(data, schema, schema, [], errors);
  return { errors, warnings: [] };
}

export function countVisibleChars(text) {
  return Array.from(String(text ?? '').replace(/\s/g, '')).length;
}

const DATE_LIKE_PATTERNS = [
  /\d{4}[-/.]\d{1,2}[-/.]\d{1,4}/g,
  /\d{4}\u5e74\d{1,2}\u6708\d{1,2}\u65e5?/g,
  /\b\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?\b/g,
  /\d{1,2}\u6708\d{1,2}\u65e5?/g
];
const TIME_LIKE_PATTERN = /\d{1,2}:\d{2}(?::\d{2})?/g;

export function countMarketNumericValues(text) {
  let sanitized = String(text ?? '');
  for (const pattern of DATE_LIKE_PATTERNS) sanitized = sanitized.replace(pattern, ' ');
  sanitized = sanitized.replace(TIME_LIKE_PATTERN, ' ');
  return sanitized.match(/\d+(?:\.\d+)?/g)?.length ?? 0;
}

function collectSourceKeys(value, pathParts = [], result = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSourceKeys(item, [...pathParts, index], result));
    return result;
  }
  if (!isPlainObject(value)) return result;
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...pathParts, key];
    if (key === 'source_key') {
      result.push({ path: pathText(childPath), value: child });
    } else if (key === 'source_keys' && Array.isArray(child)) {
      child.forEach((sourceKey, index) => result.push({ path: pathText([...childPath, index]), value: sourceKey }));
    } else {
      collectSourceKeys(child, childPath, result);
    }
  }
  return result;
}

export function validateMiddayData(data, options = {}) {
  const errors = [];
  const warnings = [];
  const allowIncomplete = Boolean(options.allowIncomplete);

  function has(fieldPath) {
    const parts = fieldPath.split('.');
    let cursor = data;
    for (const part of parts) {
      if (cursor && Object.prototype.hasOwnProperty.call(cursor, part)) cursor = cursor[part];
      else {
        errors.push(`missing required field: ${fieldPath}`);
        return undefined;
      }
    }
    return cursor;
  }

  if (data?.schema_version !== '1.0.0') errors.push(`schema_version must be 1.0.0, got ${data?.schema_version ?? 'missing'}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data?.report_date ?? '')) errors.push('report_date must match YYYY-MM-DD');
  if (!['暗金杂志封面风格', '浅色机构午报风格', '深色终端杂志风格'].includes(data?.theme)) {
    errors.push('theme must be one of the three approved midday themes');
  }
  if (Array.isArray(data?.market_view?.core_features) && data.market_view.core_features.length < 3) {
    errors.push('market_view.core_features must contain at least 3 items');
  }

  for (const fieldPath of [
    'data_quality',
    'market_view.headline',
    'market_view.thesis',
    'market_view.core_features',
    'turnover.amount_text',
    'turnover.source_key',
    'breadth.source_key',
    'capital_flow.style_label',
    'capital_flow.source_key',
    'limit_up.display口径',
    'limit_up.source_key',
    'themes.leading',
    'themes.lagging',
    'themes.concentrated_limit_up',
    'themes.source_key',
    'ladder.highest_board',
    'ladder.boards',
    'ladder.source_key',
    'midday_temperature_v1',
    'midday_interpretation',
    'afternoon_signals',
    'wechat_commentary_v1',
    'sources',
    'assumptions'
  ]) {
    has(fieldPath);
  }

  const quality = data?.data_quality;
  if (quality) {
    if (!['complete', 'review_needed', 'incomplete'].includes(quality.status)) errors.push('data_quality.status must be complete, review_needed, or incomplete');
    if (quality.status === 'incomplete' && !allowIncomplete) errors.push('data_quality.status is incomplete');
    if (!['high', 'medium', 'low'].includes(quality.confidence)) errors.push('data_quality.confidence must be high, medium, or low');
    const coverageNotes = [
      ...(quality.warnings ?? []),
      ...(quality.missing_fields ?? []),
      ...(quality.conflicts ?? []).map((conflict) => conflict.reason ?? '')
    ].join('\n');
    for (const key of REQUIRED_SOURCE_COVERAGE) {
      if (typeof quality.source_coverage?.[key] !== 'boolean') errors.push(`data_quality.source_coverage.${key} must be a boolean`);
      if (quality.source_coverage?.[key] === false) {
        if (quality.confidence === 'high') errors.push(`data_quality.confidence cannot be high when source_coverage.${key} is false`);
        if (quality.status === 'complete') errors.push(`data_quality.status cannot be complete when source_coverage.${key} is false`);
        if (!coverageNotes.includes(key)) errors.push(`data_quality.source_coverage.${key} is false but no warning, missing_field, or conflict reason mentions it`);
      }
    }
    for (const conflict of quality.conflicts ?? []) {
      if (!conflict.resolved) errors.push(`unresolved data conflict: ${conflict.field ?? 'unknown field'}`);
    }
  }

  const indexNames = new Set((data.indices ?? []).map((item) => item.name));
  for (const name of REQUIRED_INDICES) {
    if (!indexNames.has(name)) errors.push(`indices missing ${name}`);
  }
  if (!indexNames.has('北证50') && !indexNames.has('科创50')) {
    errors.push('indices must include 北证50 or 科创50 as the fourth index');
  }

  for (const [index, item] of (data.themes?.leading ?? []).entries()) {
    if (!Number.isInteger(item.limit_up_count) || item.limit_up_count < 0) {
      errors.push(`themes.leading[${index}].limit_up_count must be a non-negative integer`);
    }
  }

  const factors = data.midday_temperature_v1?.factors ?? [];
  const factorByName = new Map(factors.map((factor) => [factor.name, factor]));
  let scoreSum = 0;
  for (const [name, max] of REQUIRED_TEMPERATURE_FACTORS.entries()) {
    const factor = factorByName.get(name);
    if (!factor) {
      errors.push(`midday_temperature_v1.factors missing ${name}`);
      continue;
    }
    if (factor.max !== max) errors.push(`temperature factor ${name} max must be ${max}`);
    if (!Number.isInteger(factor.score) || factor.score < 0 || factor.score > max) {
      errors.push(`temperature factor ${name} score must be an integer from 0 to ${max}`);
    }
    if (!factor.reason) errors.push(`temperature factor ${name} reason is required`);
    scoreSum += Number(factor.score ?? 0);
  }
  if (factors.length !== REQUIRED_TEMPERATURE_FACTORS.size) {
    errors.push(`midday_temperature_v1.factors must contain exactly ${REQUIRED_TEMPERATURE_FACTORS.size} factors`);
  }
  if (data.midday_temperature_v1 && scoreSum !== data.midday_temperature_v1.score) {
    errors.push(`midday_temperature_v1.score ${data.midday_temperature_v1.score} does not equal factor sum ${scoreSum}`);
  }
  if (data.midday_temperature_v1 && !['high', 'medium', 'low'].includes(data.midday_temperature_v1.confidence)) {
    errors.push('midday_temperature_v1.confidence must be high, medium, or low');
  }

  for (const key of ['确认信号', '弱化信号', '风险信号']) {
    if (!Array.isArray(data.afternoon_signals?.[key]) || data.afternoon_signals[key].length === 0) {
      errors.push(`afternoon_signals.${key} must contain at least one item`);
    }
  }

  const interpretation = data.midday_interpretation;
  if (interpretation) {
    for (const field of ['state', 'core_judgment', 'narrative', 'afternoon_confirm', 'afternoon_weaken', 'afternoon_risk']) {
      if (!interpretation[field]) errors.push(`midday_interpretation.${field} is required`);
    }
    if (!Array.isArray(interpretation.source_keys) || interpretation.source_keys.length === 0) {
      errors.push('midday_interpretation.source_keys must contain at least one item');
    }
  }

  const commentary = data.wechat_commentary_v1;
  if (commentary) {
    for (const field of ['text', 'core_judgment', 'capital_logic', 'afternoon_validation', 'source_keys']) {
      if (!commentary[field]) errors.push(`wechat_commentary_v1.${field} is required`);
    }
    const text = wechatCommentaryText(data);
    const count = countVisibleChars(text);
    if (count > 300) errors.push(`wechat_commentary_v1.text length ${count} exceeds 300 visible characters`);
    if (count < 80) errors.push(`wechat_commentary_v1.text length ${count} is too short for a market viewpoint`);
    if (!/(不是|而是|本质|更像|说明|关键|核心|实质)/.test(text)) errors.push('wechat_commentary_v1.text must include an explicit market judgment');
    if (!/(午后|下午|若|如果|一旦|除非)/.test(text)) errors.push('wechat_commentary_v1.text must include an afternoon validation condition');
    const numericCount = countMarketNumericValues(text);
    if (numericCount > 3) errors.push('wechat_commentary_v1.text must contain at most 3 numeric values');
    if (!Array.isArray(commentary.source_keys) || commentary.source_keys.length === 0) errors.push('wechat_commentary_v1.source_keys must contain at least one item');
  }

  if (!data.sources?.financial_analysis) errors.push('sources.financial_analysis is required');
  if (Object.keys(data.sources ?? {}).length < 4) errors.push('sources must contain at least four source entries');
  const sourceKeys = new Set(Object.keys(data.sources ?? {}));
  for (const item of collectSourceKeys(data)) {
    if (typeof item.value !== 'string' || !sourceKeys.has(item.value)) errors.push(`${item.path} references missing sources.${item.value}`);
  }

  if ((quality?.warnings ?? []).length > 0) warnings.push(...quality.warnings.map((warning) => `data_quality warning: ${warning}`));
  return { errors, warnings };
}

export async function readPngDimensions(filePath) {
  const handle = await readFile(filePath);
  if (handle.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`${filePath} is not a PNG file`);
  return {
    width: handle.readUInt32BE(16),
    height: handle.readUInt32BE(20)
  };
}

export function printValidationResult(result) {
  for (const warning of result.warnings) console.warn(`WARN ${warning}`);
  for (const error of result.errors) console.error(`ERROR ${error}`);
}
