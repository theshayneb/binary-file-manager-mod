## Binary File Manager Mod

A fork of [Binary File Manager](https://github.com/qawatake/obsidian-binary-file-manager-plugin) that adds **watch folders**.
It uses its own plugin id (`binary-file-manager-mod`), settings and file list, so it can be installed side by side with the original plugin.

### Watch folders
In the settings tab, add one entry per folder you want watched. Each entry has:

| Setting | Description |
| -- | -- |
| Enabled | Turn a watch folder off without removing it. |
| Watched folder | New binary files added to this folder (or its subfolders) are detected. Use `/` for the whole vault. |
| Extensions | Comma-separated, like `epub, pdf`. Leave empty to use the default extension list. |
| Note folder | The metadata note is created here (the folder is created if needed). |
| Template | Template for the metadata note. Leave empty to use the default template. |

For example:
- `Media/Books/Attachments`, extensions `epub`, note folder `Media/Books`, template `Templates/NewBook.md`
- `Music/Attachments`, extensions `mp3`, note folder `Media/Music`, template `Templates/NewSong.md`

When watched folders overlap, the deepest one whose extensions match wins.
Binary files outside every watch folder are ignored unless **Handle files outside watch folders** is on; they then use the default new file location and template, as in the original plugin.
Files inside a watch folder that is turned off are always ignored, so with every watch folder off and that setting off, the plugin creates nothing.

---


This plugin detects new binary files in the vault and create markdown files with metadata.

By using metadata files, you can take advantage of the rich functionality provied by Obsidian such as
- full text search, 
- tags and aliases, 
- internal links, and so on.

For example, if you add tags to the metadata of an image file, then you can indirectly access the image file by tag-searching (and following an internal link in the metadata).

[![Image from Gyazo](https://i.gyazo.com/6c46d863e4c31d0815bcf027fdb48f92.gif)](https://gyazo.com/6c46d863e4c31d0815bcf027fdb48f92)

### Quick start
1. Install and enable this plugin.
2. Go to the setting tab of Binary File Manager and enable auto detection.
3. Add a static file like `sample.pdf` to your vault.

Then you will find a meta data file `INFO_sample_PDF.md` in the root directory.
You can customize the new file location and the templates for names and contents of metadata files.

### Format syntax
You can use the following syntax to format the names and contents of metadata files.
#### Date
| Syntax | Description |
| -- | -- |
| `{{CDATE:<FORMAT>}}` | Creation time of the static file.  |
| `{{NOW:<FORMAT>}}` | Current time. |

- Replace `<FORMAT>` by a [Moment.js format](https://momentjs.com/docs/#/displaying/format/).

#### Link
| Syntax | Description |
| -- | -- |
| `{{LINK}}` | Internal link like `[[image.png]]` |
| `{{EMBED}}` | Embedded link like `![[image.png]]` |

#### Path
| Syntax | Description |
| -- | -- |
| `{{PATH}}` | Path of a static file. |
| `{{FULLNAME}}` | Name of a static file. |
| `{{NAME}}` | Name of a static file with extension removed. |
| `{{EXTENSION}}` | Extension of a static file. |

- You can choose between uppercase and lowercase letters by adding suffixes `:UP` and `:LOW`, respectively. For example, `{{NAME:UP}}`.

### Templater plugin support
You can also use [Templater plugin](https://github.com/SilentVoid13/Templater) to format your meta data files.
Just install Templater plugin and set `Use Templater` in the setting tab of Binary File Manager.
