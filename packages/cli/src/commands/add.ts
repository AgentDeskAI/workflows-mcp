import { existsSync, promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { getPresetContent, listAvailablePresets } from "@mcpn/core";
import { type CommandContext, defineCommand } from "citty";
import { colors } from "consola/utils";
import { downloadTemplate } from "giget";
import { basename, dirname, join, resolve } from "pathe";

import { logger } from "../utils/logger";
import { cwdArgs, logLevelArgs } from "./_shared";

export default defineCommand({
	meta: {
		name: "add",
		description:
			"Add a workflow preset: from built-in names or a giget source.",
	},
	args: {
		...cwdArgs,
		...logLevelArgs,
		force: {
			type: "boolean",
			description:
				"Override existing preset file or directory in .mcp-workflows",
		},
		source: {
			type: "positional",
			required: true,
			description:
				"Built-in preset name (e.g., coding) or a giget source string (e.g., github:user/repo/path)",
			valueHint: "preset-name|giget-source",
		},
	},
	async run(ctx: CommandContext) {
		const cwd = resolve(ctx.args.cwd);
		const sourceArg = ctx.args.source;
		const force = ctx.args.force;

		// --- 1. Check for .mcp-workflows directory ---
		const workflowsDir = join(cwd, ".mcp-workflows");
		if (!existsSync(workflowsDir)) {
			logger.error(
				`No MCPN folder or config found in ${cwd}! Please run ${colors.cyan(
					"npx mcpn@latest init",
				)} to get started.`,
			);
			process.exit(1);
		}

		// --- 2. Determine Source Type and Preset Name ---
		const isGigetSource = sourceArg.includes(":") || sourceArg.includes("/");
		let presetName: string;

		if (isGigetSource) {
			// Try to infer preset name from the last part of the source path before any #ref
			const pathPart = sourceArg.split("#")[0];
			presetName = pathPart ? basename(pathPart) : "";
		} else {
			presetName = sourceArg; // Simple name is the preset name

			// Check if the preset exists in built-in presets
			const availablePresets = listAvailablePresets();
			if (!availablePresets.includes(presetName)) {
				logger.error(
					`Built-in preset '${presetName}' not found. Available presets: ${availablePresets.join(", ")}`,
				);
				process.exit(1);
			}
		}

		if (!presetName) {
			logger.error(
				`Could not determine a valid preset name from the input: ${sourceArg}`,
			);
			process.exit(1);
		}

		// --- Branch Logic: Simple Name vs Giget Source ---
		if (isGigetSource) {
			// --- 3b. Handle Giget Source ---
			const gigetSource = sourceArg; // Use the full source arg provided
			const destDirPath = join(workflowsDir, presetName); // Destination is a directory
			let tempDir: string | undefined;

			try {
				logger.info(
					`Attempting to add preset '${presetName}' from giget source: ${gigetSource}`,
				);
				logger.debug(`Destination directory: ${destDirPath}`);

				// Check destination directory and handle --force for directory
				if (existsSync(destDirPath)) {
					if (force) {
						logger.warn(
							`Overwriting existing directory: ${destDirPath} due to --force flag.`,
						);
						await fsp.rm(destDirPath, { recursive: true, force: true });
					} else {
						logger.error(
							`Preset directory already exists: ${destDirPath}. Use --force to override.`,
						);
						process.exit(1);
					}
				}

				// Download using Giget to temp dir
				tempDir = await fsp.mkdtemp(join(tmpdir(), "mcpn-preset-"));
				logger.debug(`Downloading to temporary directory: ${tempDir}`);

				const template = await downloadTemplate(gigetSource, {
					dir: tempDir,
					force: true, // Allow overwriting temp dir content
				});

				logger.debug(`Downloaded preset content to: ${template.dir}`);

				// Copy from Temp Dir to Destination Dir
				logger.info(`Copying preset from ${template.dir} to ${destDirPath}`);
				await fsp.mkdir(dirname(destDirPath), { recursive: true }); // Ensure parent exists
				await fsp.cp(template.dir, destDirPath, { recursive: true });

				logger.success(
					`🪄 Added preset '${presetName}' from ${gigetSource} to ${colors.cyan(destDirPath)}`,
				);
			} catch (error: any) {
				logger.error(
					`Failed to add preset '${presetName}' from ${gigetSource}: ${error.message}`,
				);
				if (error.cause) {
					logger.error(`Cause: ${error.cause}`);
				}
				if (
					error.message?.includes("404") ||
					error.message?.toLowerCase().includes("failed to download")
				) {
					logger.error(`Attempted download source: ${gigetSource}`);
				}
				if (process.env.DEBUG) {
					console.error(error);
				}
				process.exit(1);
			} finally {
				// Cleanup Temp Directory
				if (tempDir) {
					try {
						await fsp.rm(tempDir, { recursive: true, force: true });
						logger.debug(`Cleaned up temporary directory: ${tempDir}`);
					} catch (cleanupError: any) {
						logger.warn(
							`Failed to clean up temporary directory ${tempDir}: ${cleanupError.message}`,
						);
					}
				}
			}
		} else {
			// --- 3a. Handle Simple Name (Built-in Preset) ---
			const destFilePath = join(workflowsDir, `${presetName}.yaml`);

			try {
				logger.info(`Attempting to add built-in preset '${presetName}'`);
				logger.debug(`Destination: ${destFilePath}`);

				// Check destination and handle --force for file
				if (existsSync(destFilePath)) {
					if (force) {
						logger.warn(
							`Overwriting existing file: ${destFilePath} due to --force flag.`,
						);
						await fsp.rm(destFilePath, { force: true }); // Remove existing file
					} else {
						logger.error(
							`Preset file already exists: ${destFilePath}. Use --force to override.`,
						);
						process.exit(1);
					}
				}

				// Get the preset content from core using the new function
				const content = getPresetContent(presetName);

				// Write to destination
				await fsp.writeFile(destFilePath, content);

				logger.success(
					`🪄 Added built-in preset '${presetName}' to ${colors.cyan(destFilePath)}`,
				);
			} catch (error: any) {
				logger.error(
					`Failed to add built-in preset '${presetName}': ${error.message}`,
				);
				if (process.env.DEBUG) {
					console.error(error);
				}
				process.exit(1);
			}
		}
	},
});
