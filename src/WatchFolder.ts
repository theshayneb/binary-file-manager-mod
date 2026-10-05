import { matchExtension } from 'Extension';
import { normalizePath, type TFile } from 'obsidian';

export const DEFAULT_FILENAME_FORMAT = 'INFO_{{NAME}}_{{EXTENSION:UP}}';

export interface WatchFolder {
	// Disabled watch folders are skipped as if they did not exist.
	enabled: boolean;
	// Folder to watch for new binary files (subfolders included).
	inputFolder: string;
	// Extensions to watch in this folder. Empty means every file type except notes.
	extensions: string[];
	// Folder the metadata note is created in.
	outputFolder: string;
	// Name of the metadata note, without ".md" (see the format syntax in README.md).
	filenameFormat: string;
	// Template for the metadata note. Empty means the built-in template.
	templatePath: string;
	useTemplater: boolean;
	// Open the metadata note after auto detection creates it.
	openNote: boolean;
}

export interface MetaDataTarget {
	outputFolder: string;
	filenameFormat: string;
	templatePath: string;
	useTemplater: boolean;
	openNote: boolean;
	extension: string;
}

export function newWatchFolder(): WatchFolder {
	return {
		enabled: true,
		inputFolder: '',
		extensions: [],
		outputFolder: '',
		filenameFormat: DEFAULT_FILENAME_FORMAT,
		templatePath: '',
		useTemplater: false,
		openNote: false,
	};
}

// Fills in missing or invalid fields; `fallback` supplies values for fields that
// older versions only had as global settings.
export function sanitizeWatchFolder(
	raw: unknown,
	fallback: Pick<WatchFolder, 'filenameFormat' | 'useTemplater'>
): WatchFolder {
	const value = (raw ?? {}) as Partial<WatchFolder>;
	const str = (v: unknown, def: string) => (typeof v === 'string' ? v : def);
	const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
	return {
		enabled: bool(value.enabled, true),
		inputFolder: str(value.inputFolder, ''),
		extensions: Array.isArray(value.extensions)
			? value.extensions.filter((ext) => typeof ext === 'string')
			: [],
		outputFolder: str(value.outputFolder, ''),
		filenameFormat:
			str(value.filenameFormat, '').trim() || fallback.filenameFormat,
		templatePath: str(value.templatePath, ''),
		useTemplater: bool(value.useTemplater, fallback.useTemplater),
		openNote: bool(value.openNote, false),
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

function matchWatchedExtension(
	file: TFile,
	extensions: string[]
): string | undefined {
	if (extensions.length > 0) {
		return matchExtension(file.name, extensions);
	}
	// no extension list: every file except notes
	const extension = file.extension;
	return extension !== '' && extension.toLowerCase() !== 'md'
		? extension
		: undefined;
}

// Finds the watch folder that handles the given file. When watch folders overlap,
// the most specific (deepest) one whose extensions match wins.
export function resolveWatchFolder(
	file: TFile,
	watchFolders: WatchFolder[]
): MetaDataTarget | undefined {
	const candidates = watchFolders
		.filter(
			(watchFolder) =>
				watchFolder.enabled && watchFolder.inputFolder.trim() !== ''
		)
		.map((watchFolder) => ({
			watchFolder,
			folder: cleanFolder(watchFolder.inputFolder),
		}))
		.sort((a, b) => b.folder.length - a.folder.length);

	for (const { watchFolder, folder } of candidates) {
		if (!isInFolder(file.path, folder)) {
			continue;
		}
		const extension = matchWatchedExtension(file, watchFolder.extensions);
		if (extension === undefined) {
			continue;
		}
		return {
			outputFolder: watchFolder.outputFolder.trim() || '/',
			filenameFormat:
				watchFolder.filenameFormat.trim() || DEFAULT_FILENAME_FORMAT,
			templatePath: watchFolder.templatePath.trim(),
			useTemplater: watchFolder.useTemplater,
			openNote: watchFolder.openNote,
			extension,
		};
	}
	return undefined;
}
