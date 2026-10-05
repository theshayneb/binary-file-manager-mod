import type { UncoveredApp } from 'Uncover';
import { retry } from 'Util';
import { type MetaDataTarget, resolveWatchFolder } from 'WatchFolder';
import type BinaryFileManagerPlugin from 'main';
import {
	type App,
	moment,
	Notice,
	normalizePath,
	type Plugin,
	type TAbstractFile,
	TFile,
} from 'obsidian';

const TEMPLATER_PLUGIN_NAME = 'templater-obsidian';
const DEFAULT_TEMPLATE_CONTENT = `![[{{PATH}}]]
LINK: [[{{PATH}}]]
CREATED At: {{CDATE:YYYY-MM-DD}}
FILE TYPE: {{EXTENSION:UP}}
`;

const RETRY_NUMBER = 1000;
const TIMEOUT_MILLISECOND = 1000;

export class MetaDataGenerator {
	private app: App;
	private plugin: BinaryFileManagerPlugin;

	constructor(app: App, plugin: BinaryFileManagerPlugin) {
		this.app = app;
		this.plugin = plugin;
	}

	// Decides where (and with which template) the metadata note of a binary file goes,
	// or returns undefined if no enabled watch folder handles the file.
	resolveTarget(file: TFile): MetaDataTarget | undefined {
		return resolveWatchFolder(file, this.plugin.settings.watchFolders);
	}

	async shouldCreateMetaDataFile(file: TAbstractFile): Promise<boolean> {
		if (!(file instanceof TFile)) {
			return false;
		}

		if (this.resolveTarget(file) === undefined) {
			return false;
		}

		if (this.plugin.fileListAdapter.has(file.path)) {
			return false;
		}

		return true;
	}

	// Creates the metadata note and returns it with the watch folder settings used.
	async create(
		file: TFile
	): Promise<{ note: TFile; target: MetaDataTarget } | undefined> {
		const target = this.resolveTarget(file);
		if (!target) {
			return undefined;
		}
		await this.ensureFolder(target.outputFolder);
		const metaDataFilePath = this.uniquefyMetaDataFilePath(
			target.outputFolder,
			this.generateMetaDataFileName(file, target)
		);

		const note = await this.createMetaDataFile(metaDataFilePath, file, target);
		return { note, target };
	}

	private generateMetaDataFileName(
		file: TFile,
		target: MetaDataTarget
	): string {
		const metaDataFileName = `${this.plugin.formatter.format(
			target.filenameFormat,
			file.path,
			file.stat.ctime,
			target.extension
		)}.md`;
		return metaDataFileName;
	}

	private uniquefyMetaDataFilePath(
		folder: string,
		metaDataFileName: string
	): string {
		const metaDataFilePath = normalizePath(`${folder}/${metaDataFileName}`);
		if (this.app.vault.getAbstractFileByPath(metaDataFilePath)) {
			return normalizePath(
				`${folder}/CONFLICT-${moment().format(
					'YYYY-MM-DD-hh-mm-ss'
				)}-${metaDataFileName}`
			);
		} else {
			return metaDataFilePath;
		}
	}

	private async ensureFolder(folder: string): Promise<void> {
		const folderPath = normalizePath(folder);
		if (
			folderPath === '/' ||
			this.app.vault.getAbstractFileByPath(folderPath)
		) {
			return;
		}
		try {
			await this.app.vault.createFolder(folderPath);
		} catch (err) {
			// another metadata file may have created it in the meantime
			if (!this.app.vault.getAbstractFileByPath(folderPath)) {
				throw err;
			}
		}
	}

	private async createMetaDataFile(
		metaDataFilePath: string,
		binaryFile: TFile,
		target: MetaDataTarget
	): Promise<TFile> {
		const templateContent = await this.fetchTemplateContent(
			target.templatePath
		);
		const formattedContent = this.plugin.formatter.format(
			templateContent,
			binaryFile.path,
			binaryFile.stat.ctime,
			target.extension
		);

		// process by Templater
		const templaterPlugin = target.useTemplater
			? await this.getTemplaterPlugin()
			: undefined;
		if (!templaterPlugin) {
			return await this.app.vault.create(metaDataFilePath, formattedContent);
		}

		const targetFile = await this.app.vault.create(metaDataFilePath, '');
		try {
			// @ts-expect-error
			const content = await templaterPlugin.templater.parse_template(
				{ target_file: targetFile, run_mode: 4 },
				formattedContent
			);
			await this.app.vault.modify(targetFile, content);
		} catch (err) {
			new Notice(
				'ERROR in Binary File Manager Mod: failed to connect to Templater. Your Templater version may not be supported'
			);
			console.log(err);
		}
		return targetFile;
	}

	private async fetchTemplateContent(templatePath: string): Promise<string> {
		if (templatePath === '') {
			return DEFAULT_TEMPLATE_CONTENT;
		}

		// accept template paths written with or without ".md"
		const candidatePaths = [normalizePath(templatePath)];
		if (!templatePath.endsWith('.md')) {
			candidatePaths.push(normalizePath(`${templatePath}.md`));
		}
		const templateFile = await retry(
			() => {
				for (const path of candidatePaths) {
					const file = this.app.vault.getAbstractFileByPath(path);
					if (file instanceof TFile) {
						return file;
					}
				}
				return undefined;
			},
			TIMEOUT_MILLISECOND,
			RETRY_NUMBER
		);

		if (!templateFile) {
			const msg = `Template file ${templatePath} is invalid`;
			console.log(msg);
			new Notice(msg);
			return DEFAULT_TEMPLATE_CONTENT;
		}
		return await this.app.vault.read(templateFile);
	}

	private async getTemplaterPlugin(): Promise<Plugin | undefined> {
		const app = this.app as UncoveredApp;
		return await retry(
			() => {
				return app.plugins.plugins[TEMPLATER_PLUGIN_NAME];
			},
			TIMEOUT_MILLISECOND,
			RETRY_NUMBER
		);
	}

	findUnlinkedBinaries(): TFile[] {
		const unlinkedBinaries: TFile[] = [];
		const linkedPaths = new Set<string>();

		// collect all link destinations
		Object.values(this.app.metadataCache.resolvedLinks).forEach((links) => {
			Object.keys(links).forEach((dest) => {
				linkedPaths.add(dest);
			});
		});

		// collect only unlinked binaries
		this.app.vault.getFiles().forEach((file) => {
			const isUnlinkedBinary =
				!linkedPaths.has(file.path) && this.resolveTarget(file) !== undefined;
			if (isUnlinkedBinary) {
				unlinkedBinaries.push(file);
			}
		});

		return unlinkedBinaries;
	}
}
