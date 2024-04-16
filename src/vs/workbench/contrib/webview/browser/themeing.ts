/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DEFAULT_FONT_FAMILY } from 'vs/base/browser/fonts';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { EDITOR_FONT_DEFAULTS, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import * as colorRegistry from 'vs/platform/theme/common/colorRegistry';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { IWorkbenchColorTheme, IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { WebviewStyles } from 'vs/workbench/contrib/webview/browser/webview';

interface WebviewThemeData {
	readonly activeTheme: string;
	readonly themeLabel: string;
	readonly themeId: string;
	readonly styles: Readonly<WebviewStyles>;
}

export class WebviewThemeDataProvider extends Disposable {

	private _cachedWebViewThemeData: WebviewThemeData | undefined = undefined;

	private readonly _onThemeDataChanged = this._register(new Emitter<void>());
	public readonly onThemeDataChanged = this._onThemeDataChanged.event;

	constructor(
		@IWorkbenchThemeService private readonly _themeService: IWorkbenchThemeService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		this._register(this._themeService.onDidColorThemeChange(() => {
			this._reset();
		}));

		const webviewConfigurationKeys = ['editor.fontFamily', 'editor.fontWeight', 'editor.fontSize'];
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (webviewConfigurationKeys.some(key => e.affectsConfiguration(key))) {
				this._reset();
			}
		}));
	}

	public getTheme(): IWorkbenchColorTheme {
		return this._themeService.getColorTheme();
	}

	public getWebviewThemeData(): WebviewThemeData {
		if (!this._cachedWebViewThemeData) {
			const configuration = this._configurationService.getValue<IEditorOptions>('editor');
			const editorFontFamily = configuration.fontFamily || EDITOR_FONT_DEFAULTS.fontFamily;
			const editorFontWeight = configuration.fontWeight || EDITOR_FONT_DEFAULTS.fontWeight;
			const editorFontSize = configuration.fontSize || EDITOR_FONT_DEFAULTS.fontSize;

			const theme = this._themeService.getColorTheme();
			const exportedColors = colorRegistry.getColorRegistry().getColors().reduce((colors, entry) => {
				const color = theme.getColor(entry.id);
				if (color) {
					colors['vscode-' + entry.id.replace('.', '-')] = color.toString();
				}
				return colors;
			}, {} as { [key: string]: string });

			const styles = {
				'vscode-font-family': DEFAULT_FONT_FAMILY,
				'vscode-font-weight': 'normal',
				'vscode-font-size': '13px',
				'vscode-editor-font-family': editorFontFamily,
				'vscode-editor-font-weight': editorFontWeight,
				'vscode-editor-font-size': editorFontSize + 'px',
				...exportedColors
			};

			const activeTheme = ApiThemeClassName.fromTheme(theme);
			this._cachedWebViewThemeData = { styles, activeTheme, themeLabel: theme.label, themeId: theme.settingsId };
		}

		return this._cachedWebViewThemeData;
	}

	private _reset() {
		this._cachedWebViewThemeData = undefined;
		this._onThemeDataChanged.fire();
	}
}

enum ApiThemeClassName {
	light = 'vscode-light',
	dark = 'vscode-dark',
	highContrast = 'vscode-high-contrast',
	highContrastLight = 'vscode-high-contrast-light',
}

namespace ApiThemeClassName {
	export function fromTheme(theme: IWorkbenchColorTheme): ApiThemeClassName {
		switch (theme.type) {
			case ColorScheme.LIGHT: return ApiThemeClassName.light;
			case ColorScheme.DARK: return ApiThemeClassName.dark;
			case ColorScheme.HIGH_CONTRAST_DARK: return ApiThemeClassName.highContrast;
			case ColorScheme.HIGH_CONTRAST_LIGHT: return ApiThemeClassName.highContrastLight;
		}
	}
}
