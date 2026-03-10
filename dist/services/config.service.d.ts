import { Config } from '../utils/config.js';
export declare function expandHome(filepath: string): string;
export declare function loadConfig(): Promise<Config>;
export declare function setConfigValue(key: string, value: string): Promise<void>;
export declare function getConfigValue(key: string): Promise<unknown>;
