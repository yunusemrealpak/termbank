import { cosmiconfig } from 'cosmiconfig';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Config, DEFAULT_CONFIG } from '../utils/config.js';

const explorer = cosmiconfig('termbank', {
  searchPlaces: [
    '.termbank.json',
    '.termbankrc',
    '.termbankrc.json',
    'package.json',
  ],
});

function getConfigPath(): string {
  return path.join(os.homedir(), '.termbank.json');
}

export function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

export async function loadConfig(): Promise<Config> {
  // 1. Try cosmiconfig (searches from CWD upward)
  try {
    const result = await explorer.search();
    if (result && result.config) {
      return { ...DEFAULT_CONFIG, ...result.config };
    }
  } catch {
    // Config not found via cosmiconfig
  }

  // 2. Fallback: check home directory config
  try {
    const content = await fs.readFile(getConfigPath(), 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
  } catch {
    // No config found anywhere
  }

  return { ...DEFAULT_CONFIG };
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  const configPath = getConfigPath();
  let config: Record<string, unknown> = {};

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    // File doesn't exist yet
  }

  const parsed = parseValue(value);
  const processedValue = key === 'vault'
    ? path.resolve(expandHome(String(parsed)))
    : parsed;

  setNestedValue(config, key, processedValue);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
}

export async function getConfigValue(key: string): Promise<unknown> {
  const config = await loadConfig();
  return getNestedValue(config as unknown as Record<string, unknown>, key);
}

function setNestedValue(obj: Record<string, unknown>, key: string, value: unknown): void {
  const keys = key.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current) || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]] as Record<string, unknown>;
  }

  current[keys[keys.length - 1]] = value;
}

function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  const keys = key.split('.');
  let current: unknown = obj;

  for (const k of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[k];
  }

  return current;
}

function parseValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return num;
  return value;
}
