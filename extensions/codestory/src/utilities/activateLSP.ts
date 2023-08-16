// We want to activate the LSPs of the language we are interested in before
// we start processing anything

import * as path from 'path';
import * as fs from 'fs';

import { ExtensionContext, extensions } from "vscode";
import logger from '../logger';


export const getExtensionsInDirectory = (directory: string): Set<string> => {
	const extensions = new Set<string>();

	function traverse(dir: string) {
		const files = fs.readdirSync(dir);

		for (const file of files) {
			const filePath = path.join(dir, file);
			const stat = fs.statSync(filePath);

			// If directory, recurse. If file, extract extension.
			if (stat.isDirectory()) {
				traverse(filePath);
			} else {
				const ext = path.extname(filePath);
				if (ext) {
					extensions.add(ext);
				}
			}
		}
	}

	traverse(directory);
	logger.info(`[extension_activate] Found extensions: ${Array.from(extensions).join(", ")}`);
	return extensions;
};


const isTypeScriptType = (fileExtension: string): boolean => {
	if (
		fileExtension === ".ts" ||
		fileExtension === ".tsx" ||
		fileExtension === ".js" ||
		fileExtension === ".jsx"
	) {
		return true;
	}
	return false;
};

const isPythonType = (fileExtension: string): boolean => {
	if (fileExtension === ".py") {
		return true;
	}
	return false;
};

const isGoType = (fileExtension: string): boolean => {
	if (fileExtension === ".go") {
		return true;
	}
	return false;
};

const isRustType = (fileExtension: string): boolean => {
	if (fileExtension === ".rs") {
		return true;
	}
	return false;
};

const activateTypeScriptExtensions = async () => {
	// Activate TypeScript LSP
	const alreadyActivatedExtensions: Set<string> = new Set<string>();
	extensions.all.forEach(async (extension) => {
		if (extension.isActive) {
			return;
		}
		if (alreadyActivatedExtensions.has(extension.id)) {
			return;
		}
		if (extension.id.includes("typescript") || extension.id.includes("javascript") || extension.id.includes("js") || extension.id.includes("ts")) {
			logger.info(`[extension_activate][ts] Activating ${extension.id}`);
			await extension.activate();
			alreadyActivatedExtensions.add(extension.id);
		}
	});
};


const activatePythonExtension = async () => {
	const alreadyActivatedExtensions: Set<string> = new Set<string>();
	extensions.all.forEach(async (extension) => {
		if (extension.isActive) {
			return;
		}
		if (alreadyActivatedExtensions.has(extension.id)) {
			return;
		}
		if (extension.id.includes("python") || extension.id.includes("py")) {
			logger.info(`[extension_activate][py] Activating ${extension.id}`);
			await extension.activate();
		}
	});
};


const activateGoExtension = async () => {
	const alreadyActivatedExtensions: Set<string> = new Set<string>();
	extensions.all.forEach(async (extension) => {
		if (extension.isActive) {
			return;
		}
		if (alreadyActivatedExtensions.has(extension.id)) {
			return;
		}
		if (extension.id.includes("go")) {
			logger.info(`[extension_activate][go] Activating ${extension.id}`);
			await extension.activate();
		}
	});
};


const activateRustExtension = async () => {
	const alreadyActivatedExtensions: Set<string> = new Set<string>();
	extensions.all.forEach(async (extension) => {
		if (extension.isActive) {
			return;
		}
		if (alreadyActivatedExtensions.has(extension.id)) {
			return;
		}
		if (extension.id.includes("rust")) {
			logger.info(`[extension_activate][rust] Activating ${extension.id}`);
			await extension.activate();
		}
	});
};

export const activateExtensions = async (context: ExtensionContext, languageTypes: Set<string>) => {
	// Check if any entry here is of typescript type
	languageTypes.forEach(async (fileExtension) => {
		if (isTypeScriptType(fileExtension)) {
			await activateTypeScriptExtensions();
		}
	});

	languageTypes.forEach(async (fileExtension) => {
		if (isPythonType(fileExtension)) {
			await activatePythonExtension();
		}
	});

	languageTypes.forEach(async (fileExtension) => {
		if (isGoType(fileExtension)) {
			await activateGoExtension();
		}
	});

	languageTypes.forEach(async (fileExtension) => {
		if (isRustType(fileExtension)) {
			await activateRustExtension();
		}
	});
};
