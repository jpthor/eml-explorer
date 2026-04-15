export type CanonicalConst = 'e' | 'pi' | 'i'
export type CanonicalFn = 'exp' | 'ln' | 'sqrt' | 'sin' | 'cos'
export type EmlLeafValue = '1' | 'x' | 'y'
export type Path = string

export type CanonicalExpr =
  | { kind: 'one' }
  | { kind: 'x' }
  | { kind: 'y' }
  | { kind: 'int'; value: number }
  | { kind: 'const'; value: CanonicalConst }
  | { kind: 'neg'; value: CanonicalExpr }
  | { kind: 'add'; left: CanonicalExpr; right: CanonicalExpr }
  | { kind: 'sub'; left: CanonicalExpr; right: CanonicalExpr }
  | { kind: 'mul'; left: CanonicalExpr; right: CanonicalExpr }
  | { kind: 'div'; left: CanonicalExpr; right: CanonicalExpr }
  | { kind: 'powInt'; base: CanonicalExpr; exponent: number }
  | { kind: 'fn'; name: CanonicalFn; arg: CanonicalExpr }

export type EmlExpr =
  | { kind: 'leaf'; value: EmlLeafValue }
  | { kind: 'eml'; left: EmlExpr; right: EmlExpr }

export type DraftNode =
  | { kind: 'hole' }
  | { kind: 'leaf'; value: EmlLeafValue }
  | { kind: 'eml'; left: DraftNode; right: DraftNode }

export interface EvalResult {
  kind: 'real' | 'complex' | 'error'
  value: unknown
  display: string
  message?: string
}

export interface RewriteRule {
  id: string
  label: string
  forward: (...operands: EmlExpr[]) => EmlExpr
  reverse: (expr: EmlExpr) => EmlExpr[] | null
}

export interface LowerTraceStep {
  label: string
  canonical: string
}

export interface RecognitionResult {
  canonical: CanonicalExpr | null
  ruleId: string | null
  label: string | null
}

export interface SubexpressionEntry {
  path: Path
  eml: EmlExpr
  canonical: CanonicalExpr | null
  label: string | null
}

export interface HistoryEntry {
  id: string
  createdAt: string
  source: 'import' | 'compose' | 'restore'
  eml: EmlExpr
  emlText: string
  canonicalText: string | null
}
