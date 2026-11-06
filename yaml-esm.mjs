// `yaml` ships CommonJS for Node, and Vite's SSR module runner evaluates it as
// ESM on Windows ("require is not defined"). Load the CJS build through
// createRequire and re-export the public API as real ESM bindings.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const YAML = require('yaml');

export const parse = YAML.parse;
export const parseDocument = YAML.parseDocument;
export const parseAllDocuments = YAML.parseAllDocuments;
export const stringify = YAML.stringify;
export const visit = YAML.visit;
export const visitAsync = YAML.visitAsync;
export const Document = YAML.Document;
export const YAMLError = YAML.YAMLError;
export const YAMLParseError = YAML.YAMLParseError;
export const YAMLWarning = YAML.YAMLWarning;
export const isMap = YAML.isMap;
export const isSeq = YAML.isSeq;
export const isNode = YAML.isNode;
export const isPair = YAML.isPair;
export const isScalar = YAML.isScalar;
export const isAlias = YAML.isAlias;
export const isCollection = YAML.isCollection;
export const isDocument = YAML.isDocument;

export default YAML;
