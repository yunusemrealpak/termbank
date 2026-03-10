import { spawn } from 'child_process';
import path from 'path';
import { Config } from '../utils/config.js';
import { TermData, TermSummary } from '../utils/types.js';
import { buildVaultContextBlock, VaultContext } from './vault.service.js';
import { AttachedFile } from '../utils/file-args.js';
import { buildAttachmentContext } from './attachment.service.js';
import { NoteResponse } from '../templates/note.template.js';
import { VisualResponse } from '../templates/visual.template.js';

export function buildSystemPrompt(config: Config, vaultContext: TermSummary[]): string {
  const vaultBlock = config.vaultContext.enabled
    ? buildVaultContextBlock({ terms: vaultContext, notes: [], visuals: [] })
    : '';

  return `Sen bir terim uzmanısın. Terimler yazılım, bilim, felsefe, sanat veya herhangi bir alandan olabilir.
Verilen terimi aşağıdaki JSON formatında açıkla.
Dil: ${config.language}

JSON formatı:
{
  "term": "string",
  "turkishEquivalent": "string",
  "category": "kavram | pattern | anti-pattern | mimari | araç | metodoloji | teori | prensip",
  "tags": ["string"],
  "summary": "Tek cümlelik özet",
  "explanation": "2-3 paragraf detaylı açıklama",
  "examples": [{ "title": "string", "code": "string (opsiyonel)", "description": "string" }],
  "relatedTerms": ["string"],
  "commonMistakes": ["string"],
  "sources": ["string"]
}

Kurallar:
- tags alanına terimin ait olduğu alanı/domain'i de ekle (örn: "software", "psychology", "physics")
- relatedTerms: Eğer vault'ta mevcut terimler verilmişse, SADECE o listedeki terimleri kullan. Listede yoksa boş bırak.
- Sadece JSON döndür, başka bir şey yazma.${vaultBlock}`;
}

export async function queryClaudeCLI(
  term: string,
  config: Config,
  vaultContext: TermSummary[],
  attachments?: AttachedFile[],
): Promise<TermData> {
  const systemPrompt = buildSystemPrompt(config, vaultContext);

  let textBlocks = '';
  let fileFlags: string[] = [];

  if (attachments && attachments.length > 0) {
    const ctx = buildAttachmentContext(attachments);
    textBlocks = ctx.textBlocks;
    fileFlags = ctx.fileFlags;
  }

  const attachmentSection = textBlocks ? `\n\nEklenen dosyalar:\n${textBlocks}` : '';

  const fullPrompt = `<system-instructions>
${systemPrompt}
</system-instructions>${attachmentSection}

"${term}" terimini açıkla.`;

  const args = [
    '--print',
    '--max-turns', String(config.maxTurns),
    '--output-format', 'text',
    ...fileFlags,
  ];

  const stdout = await spawnClaude(config.claudePath, args, fullPrompt, config.timeout);
  return parseClaudeResponse(stdout);
}

export async function queryClaudeCLIForUpdate(
  termName: string,
  existingContent: string,
  config: Config,
  vaultContext: TermSummary[],
  attachments?: AttachedFile[],
): Promise<TermData> {
  const vaultBlock = config.vaultContext.enabled
    ? buildVaultContextBlock({ terms: vaultContext, notes: [], visuals: [] })
    : '';

  const systemPrompt = `Sen bir terim uzmanısın. Mevcut bir terim açıklamasını zenginleştirip güncelliyorsun.
Dil: ${config.language}

JSON formatı (aynen döndür):
{
  "term": "string",
  "turkishEquivalent": "string",
  "category": "kavram | pattern | anti-pattern | mimari | araç | metodoloji | teori | prensip",
  "tags": ["string"],
  "summary": "Tek cümlelik özet",
  "explanation": "2-3 paragraf detaylı açıklama",
  "examples": [{ "title": "string", "code": "string (opsiyonel)", "description": "string" }],
  "relatedTerms": ["string"],
  "commonMistakes": ["string"],
  "sources": ["string"]
}

Kurallar:
- "term" alanını değiştirme
- relatedTerms: Eğer vault'ta mevcut terimler verilmişse, SADECE o listedeki terimleri kullan.
- Mevcut içeriği daha kapsamlı ve doğru hale getir, ancak term adını koru.
- Sadece JSON döndür, başka bir şey yazma.${vaultBlock}`;

  let textBlocks = '';
  let fileFlags: string[] = [];

  if (attachments && attachments.length > 0) {
    const ctx = buildAttachmentContext(attachments);
    textBlocks = ctx.textBlocks;
    fileFlags = ctx.fileFlags;
  }

  const attachmentSection = textBlocks ? `\n\nEklenen dosyalar:\n${textBlocks}` : '';

  const fullPrompt = `<system-instructions>
${systemPrompt}
</system-instructions>${attachmentSection}

Aşağıdaki mevcut terim açıklamasını zenginleştir ve güncelle:

${existingContent}`;

  const args = [
    '--print',
    '--max-turns', String(config.maxTurns),
    '--output-format', 'text',
    ...fileFlags,
  ];
  const stdout = await spawnClaude(config.claudePath, args, fullPrompt, config.timeout);
  return parseClaudeResponse(stdout);
}

export async function queryClaudeCLIForNote(
  title: string,
  vaultContext: string,
  config: Config,
  attachments?: AttachedFile[],
): Promise<NoteResponse> {
  let textBlocks = '';
  let fileFlags: string[] = [];

  if (attachments && attachments.length > 0) {
    const ctx = buildAttachmentContext(attachments);
    textBlocks = ctx.textBlocks;
    fileFlags = ctx.fileFlags;
  }

  const attachmentSection = textBlocks ? `\n\nEklenen dosyalar:\n${textBlocks}` : '';

  const systemPrompt = `Sen bir teknik not asistanısın. Verilen başlık ve ek dosyalar hakkında yapılandırılmış bir geliştirici notu oluştur.
Dil: ${config.language}

JSON formatı:
{
  "title": "string",
  "summary": "Tek cümlelik özet",
  "tags": ["string"],
  "content": "Detaylı içerik (markdown formatında, kod blokları dahil)",
  "keyPoints": ["string"],
  "relatedTerms": ["string"]
}

Kurallar:
- Türkçe içerik üret
- relatedTerms: Eğer vault'ta mevcut içerikler verilmişse, SADECE o listedeki slug'ları kullan. Listede yoksa boş bırak.
- content alanı markdown formatında olabilir (başlık, liste, kod bloğu vb.)
- Sadece JSON döndür, başka bir şey yazma.${vaultContext}`;

  const fullPrompt = `<system-instructions>
${systemPrompt}
</system-instructions>${attachmentSection}

"${title}" başlıklı geliştirici notu oluştur.`;

  const args = [
    '--print',
    '--max-turns', String(config.maxTurns),
    '--output-format', 'text',
    ...fileFlags,
  ];

  const stdout = await spawnClaude(config.claudePath, args, fullPrompt, config.timeout);
  return parseNoteResponse(stdout);
}

export async function queryClaudeCLIForVisual(
  title: string,
  vaultContext: string,
  config: Config,
  attachments: AttachedFile[],
): Promise<VisualResponse> {
  const ctx = buildAttachmentContext(attachments);
  const fileFlags = ctx.fileFlags;

  const systemPrompt = `Sen bir görsel analiz asistanısın. Verilen görseli analiz edip yapılandırılmış bir companion doküman oluştur.
Dil: ${config.language}

JSON formatı:
{
  "title": "string",
  "summary": "Tek cümlelik özet",
  "tags": ["string"],
  "analysis": "Görselin detaylı analizi (markdown formatında)",
  "detectedConcepts": ["string"],
  "relatedTerms": ["string"]
}

Kurallar:
- Türkçe içerik üret
- relatedTerms: Eğer vault'ta mevcut içerikler verilmişse, SADECE o listedeki slug'ları kullan. Listede yoksa boş bırak.
- detectedConcepts: Görselde tespit edilen yazılım/teknik kavramlar
- Sadece JSON döndür, başka bir şey yazma.${vaultContext}`;

  const fullPrompt = `<system-instructions>
${systemPrompt}
</system-instructions>

"${title}" başlıklı görsel için analiz yap ve companion doküman oluştur.`;

  const args = [
    '--print',
    '--max-turns', String(config.maxTurns),
    '--output-format', 'text',
    ...fileFlags,
  ];

  const stdout = await spawnClaude(config.claudePath, args, fullPrompt, config.timeout);
  return parseVisualResponse(stdout);
}

function resolveCommand(command: string): string {
  if (process.platform !== 'win32') return command;
  // On Windows, global npm installs create .cmd wrappers.
  // Appending .cmd avoids shell:true (which triggers DEP0190).
  if (path.isAbsolute(command) || command.endsWith('.cmd') || command.endsWith('.exe')) {
    return command;
  }
  return `${command}.cmd`;
}

function spawnClaude(
  command: string,
  args: string[],
  input: string,
  timeout: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Remove CLAUDECODE env var to allow spawning from within Claude Code sessions
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const proc = spawn(resolveCommand(command), args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Claude CLI zaman aşımına uğradı (${timeout / 1000}s)`));
    }, timeout);

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        const out = stdout.trim();
        if (out.includes('Reached max turns')) {
          reject(new Error(
            `Claude max turn sınırına ulaştı. Sınırı artırmak için:\n  termbank config set maxTurns 5`
          ));
        } else {
          resolve(out);
        }
      } else {
        reject(new Error(
          `Claude CLI hata kodu ${code} ile sonlandı.\n${stderr || 'Detay yok. claude komutunun PATH\'te olduğundan emin olun.'}`
        ));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error(
          `"${command}" komutu bulunamadı. Claude CLI'ın kurulu olduğundan emin olun:\nnpm install -g @anthropic-ai/claude-code`
        ));
      } else {
        reject(err);
      }
    });

    proc.stdin.write(input);
    proc.stdin.end();
  });
}

function extractJSON(text: string): string {
  // Try markdown code fences first
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Try raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  return text.trim();
}

function parseClaudeResponse(raw: string): TermData {
  const jsonStr = extractJSON(raw);

  try {
    const data = JSON.parse(jsonStr);

    if (!data.term || typeof data.term !== 'string') {
      throw new Error('JSON yanıtında "term" alanı eksik veya geçersiz');
    }

    return {
      term: data.term,
      turkishEquivalent: data.turkishEquivalent || '',
      category: data.category || 'kavram',
      tags: Array.isArray(data.tags) ? data.tags : [],
      summary: data.summary || '',
      explanation: data.explanation || '',
      examples: Array.isArray(data.examples) ? data.examples : [],
      relatedTerms: Array.isArray(data.relatedTerms) ? data.relatedTerms : [],
      commonMistakes: Array.isArray(data.commonMistakes) ? data.commonMistakes : [],
      sources: Array.isArray(data.sources) ? data.sources : [],
    };
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(
        `Claude yanıtı geçerli JSON değil. Ham yanıt:\n${raw.slice(0, 500)}`
      );
    }
    throw err;
  }
}

function parseNoteResponse(raw: string): NoteResponse {
  const jsonStr = extractJSON(raw);

  try {
    const data = JSON.parse(jsonStr);

    if (!data.title || typeof data.title !== 'string') {
      throw new Error('JSON yanıtında "title" alanı eksik veya geçersiz');
    }

    return {
      title: data.title,
      summary: data.summary || '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      content: data.content || '',
      keyPoints: Array.isArray(data.keyPoints) ? data.keyPoints : [],
      relatedTerms: Array.isArray(data.relatedTerms) ? data.relatedTerms : [],
    };
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(
        `Claude yanıtı geçerli JSON değil. Ham yanıt:\n${raw.slice(0, 500)}`
      );
    }
    throw err;
  }
}

function parseVisualResponse(raw: string): VisualResponse {
  const jsonStr = extractJSON(raw);

  try {
    const data = JSON.parse(jsonStr);

    if (!data.title || typeof data.title !== 'string') {
      throw new Error('JSON yanıtında "title" alanı eksik veya geçersiz');
    }

    return {
      title: data.title,
      summary: data.summary || '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      analysis: data.analysis || '',
      detectedConcepts: Array.isArray(data.detectedConcepts) ? data.detectedConcepts : [],
      relatedTerms: Array.isArray(data.relatedTerms) ? data.relatedTerms : [],
    };
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(
        `Claude yanıtı geçerli JSON değil. Ham yanıt:\n${raw.slice(0, 500)}`
      );
    }
    throw err;
  }
}
