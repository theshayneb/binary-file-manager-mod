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
