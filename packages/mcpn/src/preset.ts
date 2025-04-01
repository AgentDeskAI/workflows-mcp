import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { DevToolsConfig } from "./config";
import { mergeConfigs } from "./config";

// In ES modules, __dirname is not available directly
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Loads preset configuration from a YAML file
 *
 * @param {string} filePath - Path to the preset YAML file
 * @returns {DevToolsConfig} The loaded configuration or empty object on error
 */
export function loadPresetConfig(filePath: string): DevToolsConfig {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const config = yaml.load(content) as DevToolsConfig;

    if (typeof config !== "object") {
      console.error(
        `Preset config in ${filePath} must be an object, returning empty config`
      );
      return {};
    }

    return config;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Error loading preset config from ${filePath}: ${errorMessage}`
    );
    return {};
  }
}

/**
 * Lists all available preset names by scanning the presets directory
 *
 * @returns {string[]} Array of available preset names (without file extensions)
 */
export function listAvailablePresets(): string[] {
  try {
    const presetsDir = path.join(__dirname, "presets");
    if (!fs.existsSync(presetsDir)) {
      console.error(`Presets directory not found at ${presetsDir}`);
      return [];
    }

    return fs
      .readdirSync(presetsDir)
      .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
      .map((file) => path.basename(file, path.extname(file)));
  } catch (error) {
    console.error("Error listing available presets:", error);
    return [];
  }
}

/**
 * Loads configuration from preset names
 *
 * @param {string[]} presets - Array of preset names to load
 * @returns {DevToolsConfig} The merged preset configuration
 */
export function loadPresetConfigs(presets: string[]): DevToolsConfig {
  const mergedConfig: DevToolsConfig = {};
  const availablePresets = listAvailablePresets();

  for (const preset of presets) {
    try {
      // If preset is empty, skip
      if (!preset) {
        console.error("Empty preset name provided, skipping");
        continue;
      }

      // Check if preset exists
      if (!availablePresets.includes(preset)) {
        console.error(`Preset "${preset}" not found, skipping`);
        continue;
      }

      // Load preset from the internal presets directory
      const presetPath = path.join(__dirname, "presets", `${preset}.yaml`);
      const presetConfig = loadPresetConfig(presetPath);
      mergeConfigs(mergedConfig, presetConfig);
    } catch (error) {
      console.error(`Error loading preset "${preset}": ${error}`);
    }
  }

  return mergedConfig;
}
