export interface OutputGuardrailResult {
  blocked: boolean;
  reason?: string;
}

interface OutputPattern {
  label: string;
  regex: RegExp;
}

const OUTPUT_GUARDRAIL_PATTERNS: OutputPattern[] = [
  {
    label: 'code_block_markdown',
    regex: /```[\s\S]*?```/m,
  },
  {
    label: 'function_declaration',
    regex: /(^|\n)\s*(export\s+)?(async\s+)?function\s+[a-zA-Z_$][\w$]*\s*\(/m,
  },
  {
    label: 'class_declaration',
    regex: /(^|\n)\s*(export\s+)?class\s+[a-zA-Z_$][\w$]*/m,
  },
  {
    label: 'import_statement',
    regex: /(^|\n)\s*import\s+[^\n]+\s+from\s+['"][^'"]+['"]/m,
  },
  {
    label: 'const_assignment_code_style',
    regex: /(^|\n)\s*(const|let|var)\s+[a-zA-Z_$][\w$]*\s*=\s*.+;/m,
  },
  {
    label: 'npm_or_python_command',
    regex: /(^|\n)\s*(npm\s+install|yarn\s+add|pnpm\s+add|python\s+[\w./-]+|node\s+[\w./-]+)/im,
  },
];

export function evaluateOutputGuardrail(text: string): OutputGuardrailResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { blocked: false };
  }

  for (const pattern of OUTPUT_GUARDRAIL_PATTERNS) {
    if (pattern.regex.test(trimmed)) {
      return {
        blocked: true,
        reason: pattern.label,
      };
    }
  }

  return { blocked: false };
}
