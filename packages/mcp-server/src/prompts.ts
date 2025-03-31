import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { DevToolsConfig, PromptConfig } from "./config.js";
import {
  formatToolsList,
  appendFormattedTools,
  processTemplate,
} from "./utils.js";

// In ES modules, __dirname is not available directly
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Directory where preset YAML files are stored
const PRESETS_DIR = path.join(__dirname, "presets");

/**
 * Applies configuration to a default prompt
 *
 * @param {string} defaultPrompt - The base prompt text to modify
 * @param {PromptConfig} [config] - Optional configuration to apply to the prompt
 * @param {Record<string, any>} [params] - Optional parameters for template processing
 * @returns {string} The final prompt with configuration applied
 */
const applyConfig = (
  defaultPrompt: string,
  config?: PromptConfig,
  params?: Record<string, any>
): string => {
  if (!config) {
    // If no config, just process the default prompt with parameters
    return params
      ? processTemplate(defaultPrompt, params).result
      : defaultPrompt;
  }

  // Use prompt if provided, otherwise use default
  let finalPrompt = config.prompt || defaultPrompt;

  // Append context if provided
  if (config.context) {
    finalPrompt += `\n\n${config.context}`;
  }

  // Add tools section if tools are provided using utility functions
  if (config.tools) {
    const toolsList = formatToolsList(config.tools);
    finalPrompt = appendFormattedTools(finalPrompt, toolsList, config.toolMode);
  }

  // Process any template parameters in the final prompt
  return params ? processTemplate(finalPrompt, params).result : finalPrompt;
};

/**
 * Discovers and loads all YAML configuration files in the presets directory
 *
 * @returns {Record<string, any>} An object mapping preset names to their configuration objects
 * @throws Will log an error if there are issues reading the directory or parsing YAML files
 */
function discoverPresetConfigs(): { [key: string]: any } {
  const presetConfigs: { [key: string]: any } = {};

  try {
    // Get all YAML files in the presets directory
    const presetFiles = fs
      .readdirSync(PRESETS_DIR)
      .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"));

    // Load each preset file
    for (const presetFile of presetFiles) {
      const presetPath = path.join(PRESETS_DIR, presetFile);
      const presetName = path.basename(presetFile, path.extname(presetFile));

      try {
        const content = fs.readFileSync(presetPath, "utf-8");
        const presetConfig = yaml.load(content) as DevToolsConfig;

        // Store the configuration with the preset file name as the key
        presetConfigs[presetName] = presetConfig;
      } catch (error) {
        console.error(`Error loading preset file ${presetFile}:`, error);
      }
    }
  } catch (error) {
    console.error("Error discovering preset configurations:", error);
  }

  return presetConfigs;
}

/**
 * Creates a prompt generation function for a specific mode and preset
 *
 * @param {string} modeName - The name of the mode to create a prompt function for
 * @param {string} presetName - The name of the preset configuration to use
 * @param {Record<string, any>} presetConfigs - Object containing all loaded preset configurations
 * @returns {(config?: DevToolsConfig, params?: Record<string, any>) => string} A function that generates a prompt based on the mode, preset, and parameters
 */
function createPromptFunction(
  modeName: string,
  presetName: string,
  presetConfigs: { [key: string]: any }
): (config?: DevToolsConfig, params?: Record<string, any>) => string {
  return (config?: DevToolsConfig, params?: Record<string, any>) => {
    try {
      const presetConfig = presetConfigs[presetName];

      if (presetConfig && presetConfig[modeName]?.prompt) {
        return applyConfig(
          presetConfig[modeName].prompt,
          config?.[modeName],
          params
        );
      }
    } catch (error) {
      console.error(
        `Error generating prompt for ${modeName} from ${presetName}:`,
        error
      );
    }

    // Fallback if preset prompt not found
    const defaultPrompt = `# ${modeName
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) =>
        l.toUpperCase()
      )}\n\nNo default prompt found for this tool.`;

    // Still process parameters even in fallback mode
    return params
      ? processTemplate(defaultPrompt, params).result
      : defaultPrompt;
  };
}

// Discover all preset configurations
const presetConfigs = discoverPresetConfigs();

// Object to store prompt functions for all modes
const promptFunctions: Record<
  string,
  (config?: DevToolsConfig, params?: Record<string, any>) => string
> = {};

/**
 * Initializes prompt functions by processing all discovered preset configurations
 * @returns Record of prompt functions indexed by mode name
 */
function initializePromptFunctions(): Record<
  string,
  (config?: DevToolsConfig, params?: Record<string, any>) => string
> {
  // Process each preset file
  Object.entries(presetConfigs).forEach(([presetName, presetConfig]) => {
    // Process each mode in the preset
    Object.keys(presetConfig).forEach((modeName) => {
      // Register the prompt function for this mode
      promptFunctions[modeName] = createPromptFunction(
        modeName,
        presetName,
        presetConfigs
      );
    });
  });

  return promptFunctions;
}

// Initialize prompt functions on module load
initializePromptFunctions();

export { promptFunctions, initializePromptFunctions };
