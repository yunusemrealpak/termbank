import { spawn } from 'child_process';
import { buildVaultContextBlock } from './vault.service.js';
export function buildSystemPrompt(config, vaultContext) {
    const vaultBlock = config.vaultContext.enabled
        ? buildVaultContextBlock(vaultContext)
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
export async function queryClaudeCLIForUpdate(termName, existingContent, config, vaultContext) {
    const vaultBlock = config.vaultContext.enabled
        ? buildVaultContextBlock(vaultContext)
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
    const fullPrompt = `<system-instructions>
${systemPrompt}
</system-instructions>

Aşağıdaki mevcut terim açıklamasını zenginleştir ve güncelle:

${existingContent}`;
    const args = ['--print', '--max-turns', String(config.maxTurns), '--output-format', 'text'];
    const stdout = await spawnClaude(config.claudePath, args, fullPrompt, config.timeout);
    return parseClaudeResponse(stdout);
}
export async function queryClaudeCLI(term, config, vaultContext) {
    const systemPrompt = buildSystemPrompt(config, vaultContext);
    // Combine system instructions and user query into a single stdin prompt.
    // This avoids Windows shell argument length limits that corrupt long --system-prompt values.
    const fullPrompt = `<system-instructions>
${systemPrompt}
</system-instructions>

"${term}" terimini açıkla.`;
    const args = [
        '--print',
        '--max-turns', String(config.maxTurns),
        '--output-format', 'text',
    ];
    const stdout = await spawnClaude(config.claudePath, args, fullPrompt, config.timeout);
    return parseClaudeResponse(stdout);
}
function spawnClaude(command, args, input, timeout) {
    return new Promise((resolve, reject) => {
        // Remove CLAUDECODE env var to allow spawning from within Claude Code sessions
        const env = { ...process.env };
        delete env.CLAUDECODE;
        const proc = spawn(command, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env,
            // shell: true needed on Windows for .cmd resolution
            ...(process.platform === 'win32' ? { shell: true } : {}),
        });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            proc.kill();
            reject(new Error(`Claude CLI zaman aşımına uğradı (${timeout / 1000}s)`));
        }, timeout);
        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });
        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) {
                const out = stdout.trim();
                if (out.includes('Reached max turns')) {
                    reject(new Error(`Claude max turn sınırına ulaştı. Sınırı artırmak için:\n  termbank config set maxTurns 5`));
                }
                else {
                    resolve(out);
                }
            }
            else {
                reject(new Error(`Claude CLI hata kodu ${code} ile sonlandı.\n${stderr || 'Detay yok. claude komutunun PATH\'te olduğundan emin olun.'}`));
            }
        });
        proc.on('error', (err) => {
            clearTimeout(timer);
            if (err.code === 'ENOENT') {
                reject(new Error(`"${command}" komutu bulunamadı. Claude CLI'ın kurulu olduğundan emin olun:\nnpm install -g @anthropic-ai/claude-code`));
            }
            else {
                reject(err);
            }
        });
        proc.stdin.write(input);
        proc.stdin.end();
    });
}
function extractJSON(text) {
    // Try markdown code fences first
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch)
        return fenceMatch[1].trim();
    // Try raw JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch)
        return jsonMatch[0];
    return text.trim();
}
function parseClaudeResponse(raw) {
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
    }
    catch (err) {
        if (err instanceof SyntaxError) {
            throw new Error(`Claude yanıtı geçerli JSON değil. Ham yanıt:\n${raw.slice(0, 500)}`);
        }
        throw err;
    }
}
//# sourceMappingURL=claude.service.js.map