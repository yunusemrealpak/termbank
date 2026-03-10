#!/usr/bin/env node
import { Command } from 'commander';
import { registerAddCommand } from './commands/add.js';
import { registerConfigCommand } from './commands/config.js';
import { registerSearchCommand } from './commands/search.js';
import { registerListCommand } from './commands/list.js';
import { registerRelateCommand } from './commands/relate.js';
import { registerUpdateCommand } from './commands/update.js';
import { registerConfidenceCommand } from './commands/confidence.js';
import { registerSyncCommand } from './commands/sync.js';
const program = new Command();
program
    .name('termbank')
    .description('Terminal-based term bank with Claude AI and Obsidian vault integration')
    .version('0.1.0');
registerAddCommand(program);
registerConfigCommand(program);
registerSearchCommand(program);
registerListCommand(program);
registerRelateCommand(program);
registerUpdateCommand(program);
registerConfidenceCommand(program);
registerSyncCommand(program);
program.parse();
//# sourceMappingURL=index.js.map