import { FileExtensionManager } from 'Extension';
import { FileListAdapter } from 'FileList';
import { Formatter } from 'Formatter';
import { MetaDataGenerator } from 'Generator';
import { BinaryFileManagerSettingTab } from 'Setting';
import { sanitizeWatchFolder, type WatchFolder } from 'WatchFolder';
import { Notice, Plugin, type TAbstractFile, type TFile } from 'obsidian';

export interface BinaryFileManagerSettings {
	autoDetection: boolean;
	extensions: string[];
	folder: string;
	filenameFormat: string;
	templatePath: string;
	useTemplater: boolean;
	watchFolders: WatchFolder[];
	// Also create metadata for binary files that no watch folder handles,
	// using `folder` and `templatePath` (the original plugin's behavior).
	handleFilesOutsideWatchFolders: boolean;
}

const DEFAULT_SETTINGS: BinaryFileManagerSettings = {
	autoDetection: false,
	extensions: [
		'png',
		'jpg',
		'jpeg',
		'gif',
		'bmp',
		'svg',
		'mp3',
		'webm',
		'wav',
		'm4a',
		'ogg',
		'3gp',
		'flac',
		'mp4',
		'webm',
		'ogv',
		'pdf',
	],
	folder: '/',
	filenameFormat: 'INFO_{{NAME}}_{{EXTENSION:UP}}',
	templatePath: '',
	useTemplater: false,
	watchFolders: [],
	handleFilesOutsideWatchFolders: false,
};

export default class BinaryFileManagerPlugin extends Plugin {
	override settings!: BinaryFileManagerSettings;
	formatter!: Formatter;
	metaDataGenerator!: MetaDataGenerator;
	fileExtensionManager!: FileExtensionManager;
	fileListAdapter!: FileListAdapter;

	override async onload() {
		await this.loadSettings();

		this.formatter = new Formatter(this.app, this);
		this.fileExtensionManager = new FileExtensionManager(this);
		this.fileListAdapter = await new FileListAdapter(this.app, this).load();
		this.metaDataGenerator = new MetaDataGenerator(this.app, this);

		// Registered once the layout is ready: before that, Obsidian fires 'create'
		// for every existing file while it loads the vault.
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(
				this.app.vault.on('create', async (file: TAbstractFile) => {
					if (!this.settings.autoDetection) {
						return;
					}
					if (!(await this.metaDataGenerator.shouldCreateMetaDataFile(file))) {
						return;
					}

					await this.metaDataGenerator.create(file as TFile);
					new Notice(`Metadata file of ${file.name} is created.`);
					this.fileListAdapter.add(file.path);
					await this.fileListAdapter.save();
				})
			);
		});

		this.registerEvent(
			this.app.vault.on('delete', async (file: TAbstractFile) => {
				if (!this.fileListAdapter.has(file.path)) {
					return;
				}
				this.fileListAdapter.delete(file.path);
				await this.fileListAdapter.save();
			})
		);

		// Commands
		this.addCommand({
			id: 'binary-file-manager-manual-detection',
			name: 'Create metadata for binary files',
			callback: async () => {
				const promises: Promise<void>[] = [];
				const allFiles = this.app.vault.getFiles();
				for (const file of allFiles) {
					if (!(await this.metaDataGenerator.shouldCreateMetaDataFile(file))) {
						continue;
					}

					promises.push(
						this.metaDataGenerator.create(file as TFile).then(() => {
							new Notice(`Metadata file of ${file.name} is created.`);
							this.fileListAdapter.add(file.path);
						})
					);
				}
				await Promise.all(promises);
				this.fileListAdapter.save();
			},
		});

		this.addCommand({
			id: 'binary-file-manager-detect-unlinked-binary-files',
			name: 'Create metadata for unlinked binary files',
			callback: async () => {
				const promises: Promise<void>[] = [];
				const unlinkedFiles = this.metaDataGenerator.findUnlinkedBinaries();
				unlinkedFiles.forEach((file) => {
					promises.push(
						this.metaDataGenerator.create(file as TFile).then(() => {
							new Notice(`Metadata file of ${file.name} is created.`);
							this.fileListAdapter.add(file.path);
						})
					);
				});
				await Promise.all(promises);
				this.fileListAdapter.save();
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new BinaryFileManagerSettingTab(this.app, this));
	}

	// onunload() {}

	async loadSettings() {
		// deep copy so that editing the settings never mutates DEFAULT_SETTINGS
		const defaults: BinaryFileManagerSettings = JSON.parse(
			JSON.stringify(DEFAULT_SETTINGS)
		);
		this.settings = Object.assign(defaults, await this.loadData());
		this.settings.watchFolders = Array.isArray(this.settings.watchFolders)
			? this.settings.watchFolders.map(sanitizeWatchFolder)
			: [];
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
