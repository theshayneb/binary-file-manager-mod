import type BinaryFileManagerPlugin from 'main';
import { type App, normalizePath } from 'obsidian';

// Before 0.6.0 the list was a plain text file of paths, without times or notes.
const LEGACY_STORAGE_FILE_NAME = '.binary-file-manager_binary-file-list.txt';
const STORAGE_FILE_NAME = 'processed-files.json';

interface ProcessedFile {
	// When the note was created (milliseconds); 0 if unknown (from the old list).
	createdAt: number;
	// Path of the note created for the file, if known.
	notePath?: string;
}

// Remembers the files that already have a note, so they are not processed twice.
export class FileListAdapter {
	private app: App;
	private plugin: BinaryFileManagerPlugin;
	private processedFiles = new Map<string, ProcessedFile>();
	// Last time the plugin was known to be running (milliseconds), so files added
	// while Obsidian was closed can be picked up on the next start.
	lastActive: number | undefined;

	constructor(app: App, plugin: BinaryFileManagerPlugin) {
		this.app = app;
		this.plugin = plugin;
		this.app.workspace.onLayoutReady(async () => {
			await this.deleteNonExistingFiles();
		});
	}

	async load(): Promise<FileListAdapter> {
		const adapter = this.app.vault.adapter;
		const storagePath = this.storageFilePath(STORAGE_FILE_NAME);
		this.processedFiles = new Map();

		if (await adapter.exists(storagePath)) {
			try {
				const data = JSON.parse(await adapter.read(storagePath)) ?? {};
				// 0.6.0 stored only the file map; later versions wrap it with lastActive
				const isWrapped = typeof data.files === 'object' && data.files !== null;
				const files = isWrapped ? data.files : data;
				if (isWrapped && typeof data.lastActive === 'number') {
					this.lastActive = data.lastActive;
				}
				for (const [path, value] of Object.entries(files)) {
					const entry = value as Partial<ProcessedFile>;
					this.processedFiles.set(path, {
						createdAt:
							typeof entry.createdAt === 'number' ? entry.createdAt : 0,
						...(typeof entry.notePath === 'string'
							? { notePath: entry.notePath }
							: {}),
					});
				}
			} catch (err) {
				console.log('File-to-Note Creator: could not read the file list', err);
			}
			return this;
		}

		const legacyPath = this.storageFilePath(LEGACY_STORAGE_FILE_NAME);
		if (await adapter.exists(legacyPath)) {
			const paths = (await adapter.read(legacyPath))
				.split(/\r?\n/)
				.filter((path) => path.trim() !== '');
			for (const path of paths) {
				this.processedFiles.set(path, { createdAt: 0 });
			}
			await this.save();
			await adapter.remove(legacyPath);
		}
		return this;
	}

	async save() {
		await this.app.vault.adapter.write(
			this.storageFilePath(STORAGE_FILE_NAME),
			JSON.stringify(
				{
					lastActive: this.lastActive,
					files: Object.fromEntries(this.processedFiles),
				},
				null,
				'\t'
			)
		);
	}

	add(filepath: string, notePath?: string): void {
		this.processedFiles.set(filepath, {
			createdAt: Date.now(),
			...(notePath !== undefined ? { notePath } : {}),
		});
	}

	delete(filepath: string): void {
		this.processedFiles.delete(filepath);
	}

	has(filepath: string): boolean {
		return this.processedFiles.has(filepath);
	}

	// Called for any deleted file. Forgets it if it is a remembered file, or the
	// file whose note it is (so deleting a note lets its file be processed again).
	// Returns true if anything was forgotten.
	handleDelete(path: string): boolean {
		let changed = this.processedFiles.delete(path);
		for (const [filePath, entry] of this.processedFiles) {
			if (entry.notePath === path) {
				this.processedFiles.delete(filePath);
				changed = true;
			}
		}
		return changed;
	}

	// Keeps paths up to date when a remembered file or one of the notes moves.
	// Returns true if anything changed.
	handleRename(oldPath: string, newPath: string): boolean {
		let changed = false;
		const entry = this.processedFiles.get(oldPath);
		if (entry) {
			this.processedFiles.delete(oldPath);
			this.processedFiles.set(newPath, entry);
			changed = true;
		}
		for (const value of this.processedFiles.values()) {
			if (value.notePath === oldPath) {
				value.notePath = newPath;
				changed = true;
			}
		}
		return changed;
	}

	// Forgets files whose note was created at or after `since` (milliseconds; 0 means
	// any time), optionally only those matching `filter`. Returns how many were forgotten.
	forgetSince(since: number, filter?: (path: string) => boolean): number {
		let count = 0;
		for (const [path, entry] of this.processedFiles) {
			if (entry.createdAt >= since && (!filter || filter(path))) {
				this.processedFiles.delete(path);
				count++;
			}
		}
		return count;
	}

	// Stored in this plugin's own folder, so it is never shared with the original plugin.
	private storageFilePath(fileName: string): string {
		const pluginDir =
			this.plugin.manifest.dir ??
			`${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`;
		return normalizePath(`${pluginDir}/${fileName}`);
	}

	private async deleteNonExistingFiles() {
		let changed = false;
		for (const path of Array.from(this.processedFiles.keys())) {
			if (!this.app.vault.getAbstractFileByPath(path)) {
				this.processedFiles.delete(path);
				changed = true;
			}
		}
		if (changed) {
			await this.save();
		}
	}
}
