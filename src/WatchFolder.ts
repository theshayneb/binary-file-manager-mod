import { matchExtension } from 'Extension';
import { normalizePath, type TFile } from 'obsidian';

export interface WatchFolder {
	// Folder to watch for new binary files (subfolders included).
	inputFolder: string;
	// Extensions to watch in this folder. Empty means "use the default extension list".
	extensions: string[];
	// Folder the metadata note is created in.
	outputFolder: string;
	// Template for the metadata note. Empty means "use the default template".
	templatePath: string;
}

export interface MetaDataTarget {
	outputFolder: string;
	templatePath: string;
	extension: string;
}

export function newWatchFolder(): WatchFolder {
	return {
		inputFolder: '',
		extensions: [],
		outputFolder: '',
		templatePath: '',
	};
}

export function sanitizeWatchFolder(raw: unknown): WatchFolder {
	const value = (raw ?? {}) as Partial<WatchFolder>;
	return {
		inputFolder: typeof value.inputFolder === 'string' ? value.inputFolder : '',
		extensions: Array.isArray(value.extensions)
			? value.extensions.filter((ext) => typeof ext === 'string')
			: [],
		outputFolder:
			typeof value.outputFolder === 'string' ? value.outputFolder : '',
		templatePath:
			typeof value.templatePath === 'string' ? value.templatePath : '',
	};
}

export function parseExtensions(input: string): string[] {
	const extensions = input
		.split(/[\s,]+/)
		.map((ext) => ext.trim().replace(/^\./, ''))
		.filter((ext) => ext !== '' && ext.toLowerCase() !== 'md');
	return Array.from(new Set(extensions));
}

// Returns the folder path without leading/trailing slashes; '' means the vault root.
function cleanFolder(folder: string): string {
	const normalized = normalizePath(folder.trim());
	return normalized === '/' ? '' : normalized.replace(/^\/+|\/+$/g, '');
}

function isInFolder(filePath: string, folder: string): boolean {
	return folder === '' || filePath.startsWith(`${folder}/`);
}

// Finds the watch folder that handles the given file. When watch folders overlap,
// the most specific (deepest) one whose extensions match wins.
export function resolveWatchFolder(
	file: TFile,
	watchFolders: WatchFolder[],
	defaultExtensions: string[]
): MetaDataTarget | undefined {
	const candidates = watchFolders
		.filter((watchFolder) => watchFolder.inputFolder.trim() !== '')
		.map((watchFolder) => ({
			watchFolder,
			folder: cleanFolder(watchFolder.inputFolder),
		}))
		.sort((a, b) => b.folder.length - a.folder.length);

	for (const { watchFolder, folder } of candidates) {
		if (!isInFolder(file.path, folder)) {
			continue;
		}
		const extensions =
			watchFolder.extensions.length > 0
				? watchFolder.extensions
				: defaultExtensions;
		const extension = matchExtension(file.name, extensions);
		if (extension === undefined) {
			continue;
		}
		return {
			outputFolder: watchFolder.outputFolder.trim() || '/',
			templatePath: watchFolder.templatePath.trim(),
			extension,
		};
	}
	return undefined;
}
