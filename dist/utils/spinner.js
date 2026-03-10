import chalk from 'chalk';
export class Spinner {
    frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    interval = null;
    frameIdx = 0;
    message;
    constructor(message) {
        this.message = message;
    }
    start() {
        if (!process.stdout.isTTY) {
            process.stdout.write(`${this.message}...\n`);
            return;
        }
        process.stdout.write(`${this.frames[0]} ${this.message}`);
        this.interval = setInterval(() => {
            this.frameIdx = (this.frameIdx + 1) % this.frames.length;
            process.stdout.write(`\r${chalk.cyan(this.frames[this.frameIdx])} ${this.message}`);
        }, 80);
    }
    stop(finalMessage) {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        if (process.stdout.isTTY) {
            process.stdout.write('\r\x1b[K');
        }
        if (finalMessage) {
            process.stdout.write(`${finalMessage}\n`);
        }
    }
}
//# sourceMappingURL=spinner.js.map