import { validFileName } from 'Util';
import {
	DEFAULT_FILENAME_FORMAT,
	newWatchFolder,
	parseExtensions,
	type WatchFolder,
} from 'WatchFolder';
import type BinaryFileManagerPlugin from 'main';
import { type App, moment, PluginSettingTab, Setting } from 'obsidian';
import { FileSuggest } from 'suggesters/FileSuggester';
import { FolderSuggest } from 'suggesters/FolderSuggester';

export class BinaryFileManagerSettingTab extends PluginSettingTab {
	plugin: BinaryFileManagerPlugin;

	constructor(app: App, plugin: BinaryFileManagerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	override display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Watch folders')
			.setDesc(
				"New files added to an enabled watched folder (or its subfolders) get a metadata note in that entry's note folder, made from its template. When watched folders overlap, the deepest one wins."
			)
			.setHeading();

		this.plugin.settings.watchFolders.forEach((watchFolder, index) => {
			this.displayWatchFolder(containerEl, watchFolder, index);
		});

		new Setting(containerEl).addButton((component) => {
			component
				.setButtonText('Add watch folder')
				.setCta()
				.onClick(async () => {
					this.plugin.settings.watchFolders.push(newWatchFolder());
					await this.plugin.saveSettings();
					this.display();
				});
		});
	}

	private displayWatchFolder(
		containerEl: HTMLElement,
		watchFolder: WatchFolder,
		index: number
	): void {
		const groupEl = containerEl.createDiv({
			cls: 'binary-file-manager-mod-watch-folder',
		});
		groupEl.toggleClass('is-disabled', !watchFolder.enabled);

		new Setting(groupEl)
			.setName('Enabled')
			.setDesc('Turn off to stop watching this folder without removing it.')
			.addToggle((component) => {
				component.setValue(watchFolder.enabled).onChange(async (value) => {
					watchFolder.enabled = value;
					groupEl.toggleClass('is-disabled', !value);
					await this.plugin.saveSettings();
				});
			});

		new Setting(groupEl)
			.setName('Watched folder')
			.setDesc('New files added here are detected. Use / for the whole vault.')
			.addSearch((component) => {
				new FolderSuggest(this.app, component.inputEl);
				component
					.setPlaceholder('Example: Media/Books/Attachments')
					.setValue(watchFolder.inputFolder)
					.onChange(async (value) => {
						watchFolder.inputFolder = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(groupEl)
			.setName('Extensions')
			.setDesc(
				'Comma-separated. Leave empty to watch every file type except notes.'
			)
			.addText((component) => {
				component
					.setPlaceholder('Example: epub, pdf')
					.setValue(watchFolder.extensions.join(', '))
					.onChange(async (value) => {
						watchFolder.extensions = parseExtensions(value);
						await this.plugin.saveSettings();
					});
			});

		new Setting(groupEl)
			.setName('Note folder')
			.setDesc(
				'Metadata notes are created here. Leave empty for the vault root.'
			)
			.addSearch((component) => {
				new FolderSuggest(this.app, component.inputEl);
				component
					.setPlaceholder('Example: Media/Books')
					.setValue(watchFolder.outputFolder)
					.onChange(async (value) => {
						watchFolder.outputFolder = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(groupEl).setName('File name format').then((setting) => {
			setting.addText((component) => {
				component
					.setPlaceholder(DEFAULT_FILENAME_FORMAT)
					.setValue(watchFolder.filenameFormat)
					.onChange(async (input) => {
						const newFormat =
							input.trim().replace(/\.md$/, '') || DEFAULT_FILENAME_FORMAT;
						const sampleFileName = this.sampleFileName(newFormat);
						this.displaySampleFileNameDesc(setting.descEl, sampleFileName);

						// check if file name contains valid letters like "/" or ":"
						if (!validFileName(sampleFileName).valid) {
							return;
						}
						watchFolder.filenameFormat = newFormat;
						await this.plugin.saveSettings();
					});
			});
			this.displaySampleFileNameDesc(
				setting.descEl,
				this.sampleFileName(watchFolder.filenameFormat)
			);
		});

		new Setting(groupEl)
			.setName('Template')
			.setDesc('Leave empty to use the built-in template.')
			.addSearch((component) => {
				new FileSuggest(this.app, component.inputEl);
				component
					.setPlaceholder('Example: Templates/NewBook')
					.setValue(watchFolder.templatePath)
					.onChange(async (value) => {
						watchFolder.templatePath = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(groupEl)
			.setName('Use Templater')
			.setDesc('Run the template through the Templater plugin.')
			.addToggle((component) => {
				component.setValue(watchFolder.useTemplater).onChange(async (value) => {
					watchFolder.useTemplater = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(groupEl)
			.setName('Open note after creating it')
			.setDesc('Opens the new metadata note in a new tab.')
			.addToggle((component) => {
				component.setValue(watchFolder.openNote).onChange(async (value) => {
					watchFolder.openNote = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(groupEl).addButton((component) => {
			component
				.setButtonText('Remove watch folder')
				.setWarning()
				.onClick(async () => {
					this.plugin.settings.watchFolders.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
				});
		});
	}

	private sampleFileName(format: string): string {
		return this.plugin.formatter.format(
			format,
			'folder/sample.png',
			moment.now(),
			'png'
		);
	}

	displaySampleFileNameDesc(descEl: HTMLElement, sampleFileName: string): void {
		descEl.empty();
		descEl.appendChild(
			createFragment((fragment) => {
				fragment.appendText('For more syntax, refer to ');
				fragment.createEl('a', {
					href: 'https://github.com/theshayneb/binary-file-manager-mod#format-syntax',
					text: 'format reference',
				});
				fragment.createEl('br');
				fragment.appendText('Your current syntax looks like this: ');
				fragment.createEl('b', {
					text: sampleFileName,
				});

				const { valid, included } = validFileName(sampleFileName);
				if (!valid && included !== undefined) {
					fragment.createEl('br');
					const msgEl = fragment.createEl('span');
					msgEl.appendText(`${included} must not be included`);
					msgEl.addClass('binary-file-manager-mod-text-error');
				}
			})
		);
	}
}
