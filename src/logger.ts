import chalk from 'chalk';
import ora, { Ora } from 'ora';

export type LogLevel = 'quiet' | 'normal' | 'verbose';

class Logger {
  private level: LogLevel = 'normal';
  private spinner: Ora | null = null;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Log info message (normal and verbose)
   */
  info(message: string): void {
    if (this.level !== 'quiet') {
      console.log(chalk.blue('ℹ'), message);
    }
  }

  /**
   * Log success message (normal and verbose)
   */
  success(message: string): void {
    if (this.level !== 'quiet') {
      console.log(chalk.green('✓'), message);
    }
  }

  /**
   * Log warning message (normal and verbose)
   */
  warn(message: string): void {
    if (this.level !== 'quiet') {
      console.log(chalk.yellow('⚠'), message);
    }
  }

  /**
   * Log error message (always shown)
   */
  error(message: string): void {
    console.error(chalk.red('✗'), message);
  }

  /**
   * Log verbose message (only in verbose mode)
   */
  verbose(message: string): void {
    if (this.level === 'verbose') {
      console.log(chalk.gray('→'), message);
    }
  }

  /**
   * Log plain message without formatting
   */
  log(message: string): void {
    if (this.level !== 'quiet') {
      console.log(message);
    }
  }

  /**
   * Start a spinner with message
   */
  startSpinner(message: string): void {
    if (this.level !== 'quiet') {
      this.spinner = ora(message).start();
    }
  }

  /**
   * Update spinner text
   */
  updateSpinner(message: string): void {
    if (this.spinner) {
      this.spinner.text = message;
    }
  }

  /**
   * Stop spinner with success
   */
  succeedSpinner(message?: string): void {
    if (this.spinner) {
      this.spinner.succeed(message);
      this.spinner = null;
    }
  }

  /**
   * Stop spinner with failure
   */
  failSpinner(message?: string): void {
    if (this.spinner) {
      this.spinner.fail(message);
      this.spinner = null;
    }
  }

  /**
   * Stop spinner with warning
   */
  warnSpinner(message?: string): void {
    if (this.spinner) {
      this.spinner.warn(message);
      this.spinner = null;
    }
  }

  /**
   * Stop spinner with info
   */
  infoSpinner(message?: string): void {
    if (this.spinner) {
      this.spinner.info(message);
      this.spinner = null;
    }
  }

  /**
   * Format bytes to human-readable size
   */
  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /**
   * Format a table row with colors
   */
  formatOperation(method: string, path: string, summary?: string): string {
    const methodColors: Record<string, any> = {
      GET: chalk.green,
      POST: chalk.blue,
      PUT: chalk.yellow,
      PATCH: chalk.yellow,
      DELETE: chalk.red,
    };

    const colorFn = methodColors[method.toUpperCase()] || chalk.white;
    const methodPadded = colorFn(method.toUpperCase().padEnd(7));
    const pathPadded = chalk.cyan(path.padEnd(45));
    const summaryText = summary ? chalk.gray(summary) : '';

    return `${methodPadded} ${pathPadded} ${summaryText}`;
  }

  /**
   * Print a separator line
   */
  separator(char: string = '=', length: number = 80): void {
    if (this.level !== 'quiet') {
      console.log(chalk.gray(char.repeat(length)));
    }
  }

  /**
   * Print a header
   */
  header(text: string): void {
    if (this.level !== 'quiet') {
      this.separator();
      console.log(chalk.bold(text));
      this.separator();
    }
  }
}

// Export singleton instance
export const logger = new Logger();
