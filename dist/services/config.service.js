import { cosmiconfig } from 'cosmiconfig';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { DEFAULT_CONFIG } from '../utils/config.js';
const explorer = cosmiconfig('termbank', {
    searchPlaces: [
        '.termbank.json',
        '.termbankrc',
        '.termbankrc.json',
        'package.json',
    ],
});
function getConfigPath() {
    return path.join(os.homedir(), '.termbank.json');
}
export function expandHome(filepath) {
    if (filepath.startsWith('~/') || filepath === '~') {
        return path.join(os.homedir(), filepath.slice(1));
    }
    return filepath;
}
export async function loadConfig() {
    // 1. Try cosmiconfig (searches from CWD upward)
    try {
        const result = await explorer.search();
        if (result && result.config) {
            return { ...DEFAULT_CONFIG, ...result.config };
        }
    }
    catch {
        // Config not found via cosmiconfig
    }
    // 2. Fallback: check home directory config
    try {
        const content = await fs.readFile(getConfigPath(), 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
    }
    catch {
        // No config found anywhere
    }
    return { ...DEFAULT_CONFIG };
}
export async function setConfigValue(key, value) {
    const configPath = getConfigPath();
    let config = {};
    try {
        const content = await fs.readFile(configPath, 'utf-8');
        config = JSON.parse(content);
    }
    catch {
        // File doesn't exist yet
    }
    const parsed = parseValue(value);
    const processedValue = key === 'vault'
        ? path.resolve(expandHome(String(parsed)))
        : parsed;
    setNestedValue(config, key, processedValue);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
}
export async function getConfigValue(key) {
    const config = await loadConfig();
    return getNestedValue(config, key);
}
function setNestedValue(obj, key, value) {
    const keys = key.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current) || typeof current[keys[i]] !== 'object') {
            current[keys[i]] = {};
        }
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
}
function getNestedValue(obj, key) {
    const keys = key.split('.');
    let current = obj;
    for (const k of keys) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return undefined;
        }
        current = current[k];
    }
    return current;
}
function parseValue(value) {
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    const num = Number(value);
    if (!isNaN(num) && value.trim() !== '')
        return num;
    return value;
}
//# sourceMappingURL=config.service.js.map