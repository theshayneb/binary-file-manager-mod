import { FileListAdapter } from 'FileList';
import { type ForgetPeriod, ForgetPeriodModal, forgetSinceTime } from 'Forget';
import { Formatter } from 'Formatter';
import { MetaDataGenerator } from 'Generator';
import { BinaryFileManagerSettingTab } from 'Setting';
import {
	DEFAULT_FILENAME_FORMAT,
	isInWatchedFolder,
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
					this.fileListAdapter.add(file.path, created.note.path);
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
				// also forgets a file whose note was deleted, so it can be processed again
				if (this.fileListAdapter.handleDelete(file.path)) {
					await this.fileListAdapter.save();
				}
			})
		);

		this.registerEvent(
			this.app.vault.on(
				'rename',
				async (file: TAbstractFile, oldPath: string) => {
					if (this.fileListAdapter.handleRename(oldPath, file.path)) {
						await this.fileListAdapter.save();
					}
				}
			)
		);

		// Commands
		this.addCommand({
			id: 'binary-file-manager-manual-detection',
			name: 'Create missing notes for files in watch folders',
			callback: async () => {
				await this.createMissingNotes(this.app.vault.getFiles());
			},
		});

		this.addCommand({
			id: 'binary-file-manager-detect-unlinked-binary-files',
			name: 'Create notes for unlinked files in watch folders',
			callback: async () => {
				await this.createNotes(this.metaDataGenerator.findUnlinkedBinaries());
			},
		});

		this.addCommand({
			id: 'forget-processed-files',
			name: 'Forget processed files (all watch folders)',
			callback: () => {
				new ForgetPeriodModal(this.app, async (period) => {
					await this.forgetProcessedFiles(period);
				}).open();
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new BinaryFileManagerSettingTab(this.app, this));
	}

	// onunload() {}

	// Creates notes for the given files that are in an enabled watch folder and
	// do not have a note yet. Returns how many notes were created.
	async createMissingNotes(files: TFile[]): Promise<number> {
		const filesToProcess: TFile[] = [];
		for (const file of files) {
			if (await this.metaDataGenerator.shouldCreateMetaDataFile(file)) {
				filesToProcess.push(file);
			}
		}
		return await this.createNotes(filesToProcess);
	}

	private async createNotes(files: TFile[]): Promise<number> {
		let count = 0;
		await Promise.all(
			files.map(async (file) => {
				const created = await this.metaDataGenerator.create(file);
				if (!created) {
					return;
				}
				new Notice(`Metadata file of ${file.name} is created.`);
				this.fileListAdapter.add(file.path, created.note.path);
				count++;
			})
		);
		await this.fileListAdapter.save();
		if (count === 0) {
			new Notice('No new notes to create.');
		}
		return count;
	}

	// Forgets the files processed in the given period, in one watch folder or in all
	// of them, so their notes can be created again.
	async forgetProcessedFiles(
		period: ForgetPeriod,
		watchFolder?: WatchFolder
	): Promise<number> {
		const count = this.fileListAdapter.forgetSince(
			forgetSinceTime(period),
			watchFolder ? (path) => isInWatchedFolder(path, watchFolder) : undefined
		);
		await this.fileListAdapter.save();
		new Notice(
			`Forgot ${count} processed ${count === 1 ? 'file' : 'files'}. Run "Create missing notes" to create their notes again.`
		);
		return count;
	}

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
