import { FileListAdapter } from 'FileList';
import { Formatter } from 'Formatter';
import { MetaDataGenerator } from 'Generator';
import { BinaryFileManagerSettingTab } from 'Setting';
import {
	DEFAULT_FILENAME_FORMAT,
	sanitizeWatchFolder,
	type WatchFolder,
} from 'WatchFolder';
import { Notice, Plugin, type TAbstractFile, type TFile } from 'obsidian';

export interface BinaryFileManagerSettings {
	watchFolders: WatchFolder[];
}

export default class BinaryFileManagerPlugin extends Plugin {
	override settings!: BinaryFileManagerSettings;
	formatter!: Formatter;
	metaDataGenerator!: MetaDataGenerator;
	fileListAdapter!: FileListAdapter;

	override async onload() {
		await this.loadSettings();

		this.formatter = new Formatter(this.app, this);
		this.fileListAdapter = await new FileListAdapter(this.app, this).load();
		this.metaDataGenerator = new MetaDataGenerator(this.app, this);

		// Registered once the layout is ready: before that, Obsidian fires 'create'
		// for every existing file while it loads the vault.
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(
				this.app.vault.on('create', async (file: TAbstractFile) => {
					if (!(await this.metaDataGenerator.shouldCreateMetaDataFile(file))) {
						return;
					}

					const created = await this.metaDataGenerator.create(file as TFile);
					if (!created) {
						return;
					}
					new Notice(`Metadata file of ${file.name} is created.`);
					this.fileListAdapter.add(file.path);
					await this.fileListAdapter.save();
					// only here, not in the commands, which may create many notes at once
					if (created.target.openNote) {
						await this.app.workspace.getLeaf('tab').openFile(created.note);
					}
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
		const data = (await this.loadData()) ?? {};
		// 0.4.x kept the file name format and the Templater switch as global settings;
		// they now belong to each watch folder. Other global settings are dropped.
		const fallback = {
			filenameFormat:
				typeof data.filenameFormat === 'string' && data.filenameFormat.trim()
					? data.filenameFormat
					: DEFAULT_FILENAME_FORMAT,
			useTemplater: data.useTemplater === true,
		};
		const watchFolders: unknown[] = Array.isArray(data.watchFolders)
			? data.watchFolders
			: [];
		this.settings = {
			watchFolders: watchFolders.map((raw) =>
				sanitizeWatchFolder(raw, fallback)
			),
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
