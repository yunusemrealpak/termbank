import chalk from 'chalk';

export class Spinner {
  private readonly frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private interval: ReturnType<typeof setInterval> | null = null;
  private frameIdx = 0;
  private readonly message: string;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
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

  stop(finalMessage?: string): void {
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
