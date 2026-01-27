import * as fs from 'fs';
import * as path from 'path';
import { ReducerOptions } from './types';

export interface ConfigFile extends ReducerOptions {
  output?: string;
  includeExamples?: boolean;
}

const CONFIG_FILE_NAMES = ['.spec-shaver.json', '.spec-shaver.config.json'];

/**
 * Load configuration from file
 */
export function loadConfig(configPath?: string): ConfigFile | null {
  // If explicit path provided, try to load it
  if (configPath) {
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(content);
      } catch (error) {
        throw new Error(`Failed to parse config file: ${configPath}`);
      }
    }
    throw new Error(`Config file not found: ${configPath}`);
  }

  // Otherwise, search for config file in current directory
  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = path.join(process.cwd(), fileName);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
      } catch (error) {
        console.warn(`Warning: Failed to parse ${fileName}, ignoring...`);
      }
    }
  }

  return null;
}

/**
 * Merge CLI options with config file
 */
export function mergeConfig(
  cliOptions: Record<string, any>,
  config: ConfigFile | null
): Record<string, any> {
  if (!config) return cliOptions;

  // CLI options take precedence over config file
  return {
    ...config,
    ...cliOptions,
  };
}

/**
 * Create a default config file
 */
export function createDefaultConfig(outputPath: string = '.spec-shaver.json'): void {
  const defaultConfig: ConfigFile = {
    maxActions: 30,
    maxSizeBytes: 1024 * 1024,
    coreEntities: [
      'users',
      'accounts',
      'organizations',
      'projects',
      'items',
      'resources',
      'events',
      'messages',
      'files',
      'settings',
    ],
    includeExamples: false,
    maxDescriptionLength: 200,
    output: 'reduced_schema.json',
  };

  fs.writeFileSync(outputPath, JSON.stringify(defaultConfig, null, 2));
}
