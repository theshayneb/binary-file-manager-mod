import { validFileName } from 'Util';
import { newWatchFolder, parseExtensions } from 'WatchFolder';
import type BinaryFileManagerPlugin from 'main';
import {
	type App,
	ButtonComponent,
	Modal,
	moment,
	Notice,
	PluginSettingTab,
	Setting,
} from 'obsidian';
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
			.setName('Enable auto detection')
			.setDesc('Detects new binary files and create metadata automatically.')
			.addToggle((component) => {
				component
					.setValue(this.plugin.settings.autoDetection)
					.onChange(async (value: boolean) => {
						this.plugin.settings.autoDetection = value;
						await this.plugin.saveSettings();
					});
			});

		this.displayWatchFolders(containerEl);

		new Setting(containerEl).setName('Defaults').setHeading();

		new Setting(containerEl)
			.setName('Handle files outside watch folders')
			.setDesc(
				'Also create metadata for binary files that no watch folder handles, using the new file location and template below.'
			)
			.addToggle((component) => {
				component
					.setValue(this.plugin.settings.handleFilesOutsideWatchFolders)
					.onChange(async (value: boolean) => {
						this.plugin.settings.handleFilesOutsideWatchFolders = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('New file location')
			.setDesc('New metadata file will be placed here')
			.addSearch((component) => {
				new FolderSuggest(this.app, component.inputEl);
				component
					.setPlaceholder('Example: folder1/folder2')
					.setValue(this.plugin.settings.folder)
					.onChange((newFolder) => {
						this.plugin.settings.folder = newFolder;
						this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName('File name format').then((setting) => {
			setting.addText((component) => {
				component
					.setValue(this.plugin.settings.filenameFormat)
					.onChange((input) => {
						const newFormat = input.trim().replace(/\.md$/, '');
						if (newFormat === '') {
							new Notice('File name format must not be blanck');
							return;
						}

						const sampleFileName = this.plugin.formatter.format(
							newFormat,
							'folder/sample.png',
							moment.now()
						);

						this.displaySampleFileNameDesc(setting.descEl, sampleFileName);

						// check if file name contains valid letters like "/" or ":"
						const { valid } = validFileName(sampleFileName);
						if (!valid) {
							return;
						}

						this.plugin.settings.filenameFormat = newFormat;
						this.plugin.saveSettings();
					});

				const sampleFileName = this.plugin.formatter.format(
					this.plugin.settings.filenameFormat,
					'folder/sample.png',
					moment.now()
				);
				this.displaySampleFileNameDesc(setting.descEl, sampleFileName);
			});
		});

		new Setting(containerEl)
			.setName('Template file location')
			.addSearch((component) => {
				new FileSuggest(this.app, component.inputEl);
				component
					.setPlaceholder('Example: folder1/note')
					.setValue(this.plugin.settings.templatePath)
					.onChange((newTemplateFile) => {
						this.plugin.settings.templatePath = newTemplateFile;
						this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Use Templater')
			.addToggle(async (component) => {
				component
					.setValue(this.plugin.settings.useTemplater)
					.onChange((value) => {
						this.plugin.settings.useTemplater = value;
						this.plugin.saveSettings();
					});
			});

		let extensionToBeAdded: string;
		new Setting(containerEl)
			.setName('Extension to be watched')
			.setDesc(
				'Used outside watch folders, and by watch folders whose extension list is empty.'
			)
			.addText((text) =>
				text.setPlaceholder('Example: pdf').onChange((value) => {
					extensionToBeAdded = value.trim().replace(/^\./, '');
				})
			)
			.addButton((cb) => {
				cb.setButtonText('Add').onClick(async () => {
					if (extensionToBeAdded === 'md') {
						new Notice('extension "md" is prohibited');
						return;
					}
					if (this.plugin.fileExtensionManager.has(extensionToBeAdded)) {
						new Notice(`${extensionToBeAdded} is already registered`);
						return;
					}
					this.plugin.fileExtensionManager.add(extensionToBeAdded);
					this.plugin.settings.extensions.push(extensionToBeAdded);
					await this.plugin.saveSettings();
					this.display();
				});
			});

		this.plugin.settings.extensions.forEach((ext) => {
			new Setting(containerEl).setName(ext).addExtraButton((cb) => {
				cb.setIcon('cross').onClick(async () => {
					this.plugin.fileExtensionManager.delete(ext);
					this.plugin.settings.extensions =
						this.plugin.fileExtensionManager.toArray();
					await this.plugin.saveSettings();
					this.display();
				});
			});
		});

		new Setting(containerEl)
			.setName('Forget all binary files')
			.setDesc(
				'Binary File Manager Mod remembers binary files for which it has created metadata. If it forgets, then it recognizes all binary files as newly created files and tries to create their metadata again.'
			)
			.addButton((component) => {
				component
					.setButtonText('Forget')
					.setWarning()
					.onClick(() => {
						new ForgetAllModal(this.app, this.plugin).open();
					});
			});
	}

	private displayWatchFolders(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Watch folders')
			.setDesc(
				"New binary files in a watched folder (or its subfolders) get a metadata note in that entry's note folder, made from its template. When watched folders overlap, the deepest one wins."
			)
			.setHeading();

		this.plugin.settings.watchFolders.forEach((watchFolder, index) => {
			const groupEl = containerEl.createDiv({
				cls: 'binary-file-manager-mod-watch-folder',
			});

			new Setting(groupEl)
				.setName('Watched folder')
				.setDesc('New binary files added here are detected.')
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
					'Comma-separated. Leave empty to use the default extension list.'
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

			new Setting(groupEl)
				.setName('Template')
				.setDesc('Leave empty to use the default template.')
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

	displaySampleFileNameDesc(descEl: HTMLElement, sampleFileName: string): void {
		descEl.empty();
		descEl.appendChild(
			createFragment((fragment) => {
				fragment.appendText('For more syntax, refer to ');
				fragment.createEl('a', {
					href: 'https://github.com/qawatake/obsidian-binary-file-manager-plugin#format-syntax',
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

class ForgetAllModal extends Modal {
	plugin: BinaryFileManagerPlugin;

	constructor(app: App, plugin: BinaryFileManagerPlugin) {
		super(app);
		this.plugin = plugin;
	}

	override onOpen() {
		const { contentEl, titleEl } = this;
		titleEl.setText('Forget all');
		contentEl
			.createEl('p', {
				text: 'Are you sure? You cannot undo this action.',
			})
			.addClass('mod-warning');

		const buttonContainerEl = contentEl.createEl('div');
		buttonContainerEl.addClass('modal-button-container');

		new ButtonComponent(buttonContainerEl)
			.setButtonText('Forget')
			.setWarning()
			.onClick(async () => {
				this.plugin.fileListAdapter.deleteAll();
				await this.plugin.fileListAdapter.save();
				new Notice('Binary File Manager Mod forgets all!');
				this.close();
			});

		new ButtonComponent(buttonContainerEl)
			.setButtonText('Cancel')
			.onClick(() => {
				this.close();
			});
	}

	override onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
