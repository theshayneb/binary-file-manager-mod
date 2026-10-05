import type BinaryFileManagerPlugin from 'main';

export class FileExtensionManager {
	private plugin: BinaryFileManagerPlugin;
	private extensions: Set<string>;

	constructor(plugin: BinaryFileManagerPlugin) {
		this.plugin = plugin;
		this.extensions = new Set<string>(this.plugin.settings.extensions);
	}

	public getExtensionMatchedBest(filename: string): string | undefined {
		return matchExtension(filename, this.extensions);
	}

	public add(ext: string): void {
		this.extensions.add(ext);
	}

	public delete(ext: string): void {
		this.extensions.delete(ext);
	}

	public has(ext: string): boolean {
		return this.extensions.has(ext);
	}

	public verify(filepath: string): boolean {
		// i want to use return so avoid to use forEach
		for (const ext of this.extensions) {
			if (filepath.endsWith(`.${ext}`)) {
				return true;
			}
		}
		return false;
	}

	public toArray(): string[] {
		return Array.from(this.extensions);
	}
}

// Returns the longest extension of the file name found in `extensions`
// (compared case-insensitively), as written in the file name.
export function matchExtension(
	filename: string,
	extensions: Iterable<string>
): string | undefined {
	const lowerCaseExtensions = new Set<string>();
	for (const ext of extensions) {
		lowerCaseExtensions.add(ext.toLowerCase());
	}
	// investigate extensions from longer to shorter
	for (let id = 0; id < filename.length; id++) {
		if (filename[id] !== '.') {
			continue;
		}
		const ext = filename.slice(id + 1);
		if (ext === '') {
			return undefined;
		}
		if (lowerCaseExtensions.has(ext.toLowerCase())) {
			return ext;
		}
	}
	return undefined;
}
