/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextMenuProvider } from 'vs/base/browser/contextmenu';
import { addDisposableListener, EventHelper, EventType, IFocusTracker, reset, trackFocus } from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { EventType as TouchEventType, Gesture } from 'vs/base/browser/touch';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { Action, IAction, IActionRunner } from 'vs/base/common/actions';
import { Codicon, CSSIcon } from 'vs/base/common/codicons';
import { Color } from 'vs/base/common/color';
import { Emitter, Event as BaseEvent } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { mixin } from 'vs/base/common/objects';
import { localize } from 'vs/nls';
import 'vs/css!./button';

export interface IButtonOptions extends IButtonStyles {
	readonly title?: boolean | string;
	readonly supportIcons?: boolean;
	readonly secondary?: boolean;
}

export interface IButtonStyles {
	buttonBackground?: Color;
	buttonHoverBackground?: Color;
	buttonForeground?: Color;
	buttonSeparator?: Color;
	buttonSecondaryBackground?: Color;
	buttonSecondaryHoverBackground?: Color;
	buttonSecondaryForeground?: Color;
	buttonBorder?: Color;
}

const defaultOptions: IButtonStyles = {
	buttonBackground: Color.fromHex('#0E639C'),
	buttonHoverBackground: Color.fromHex('#006BB3'),
	buttonSeparator: Color.white,
	buttonForeground: Color.white
};

export interface IButton extends IDisposable {
	readonly element: HTMLElement;
	readonly onDidClick: BaseEvent<Event | undefined>;
	label: string;
	icon: CSSIcon;
	enabled: boolean;
	style(styles: IButtonStyles): void;
	focus(): void;
	hasFocus(): boolean;
}

export interface IButtonWithDescription extends IButton {
	description: string;
}

export class Button extends Disposable implements IButton {

	protected _element: HTMLElement;
	protected options: IButtonOptions;

	private buttonBackground: Color | undefined;
	private buttonHoverBackground: Color | undefined;
	private buttonForeground: Color | undefined;
	private buttonSecondaryBackground: Color | undefined;
	private buttonSecondaryHoverBackground: Color | undefined;
	private buttonSecondaryForeground: Color | undefined;
	private buttonBorder: Color | undefined;

	private _onDidClick = this._register(new Emitter<Event>());
	get onDidClick(): BaseEvent<Event> { return this._onDidClick.event; }

	private focusTracker: IFocusTracker;

	constructor(container: HTMLElement, options?: IButtonOptions) {
		super();

		this.options = options || Object.create(null);
		mixin(this.options, defaultOptions, false);

		this.buttonForeground = this.options.buttonForeground;
		this.buttonBackground = this.options.buttonBackground;
		this.buttonHoverBackground = this.options.buttonHoverBackground;

		this.buttonSecondaryForeground = this.options.buttonSecondaryForeground;
		this.buttonSecondaryBackground = this.options.buttonSecondaryBackground;
		this.buttonSecondaryHoverBackground = this.options.buttonSecondaryHoverBackground;

		this.buttonBorder = this.options.buttonBorder;

		this._element = document.createElement('a');
		this._element.classList.add('monaco-button');
		this._element.tabIndex = 0;
		this._element.setAttribute('role', 'button');

		container.appendChild(this._element);

		this._register(Gesture.addTarget(this._element));

		[EventType.CLICK, TouchEventType.Tap].forEach(eventType => {
			this._register(addDisposableListener(this._element, eventType, e => {
				if (!this.enabled) {
					EventHelper.stop(e);
					return;
				}

				this._onDidClick.fire(e);
			}));
		});

		this._register(addDisposableListener(this._element, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			let eventHandled = false;
			if (this.enabled && (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space))) {
				this._onDidClick.fire(e);
				eventHandled = true;
			} else if (event.equals(KeyCode.Escape)) {
				this._element.blur();
				eventHandled = true;
			}

			if (eventHandled) {
				EventHelper.stop(event, true);
			}
		}));

		this._register(addDisposableListener(this._element, EventType.MOUSE_OVER, e => {
			if (!this._element.classList.contains('disabled')) {
				this.setHoverBackground();
			}
		}));

		this._register(addDisposableListener(this._element, EventType.MOUSE_OUT, e => {
			this.applyStyles(); // restore standard styles
		}));

		// Also set hover background when button is focused for feedback
		this.focusTracker = this._register(trackFocus(this._element));
		this._register(this.focusTracker.onDidFocus(() => { if (this.enabled) { this.setHoverBackground(); } }));
		this._register(this.focusTracker.onDidBlur(() => { if (this.enabled) { this.applyStyles(); } }));

		this.applyStyles();
	}

	private setHoverBackground(): void {
		let hoverBackground;
		if (this.options.secondary) {
			hoverBackground = this.buttonSecondaryHoverBackground ? this.buttonSecondaryHoverBackground.toString() : null;
		} else {
			hoverBackground = this.buttonHoverBackground ? this.buttonHoverBackground.toString() : null;
		}
		if (hoverBackground) {
			this._element.style.backgroundColor = hoverBackground;
		}
	}

	style(styles: IButtonStyles): void {
		this.buttonForeground = styles.buttonForeground;
		this.buttonBackground = styles.buttonBackground;
		this.buttonHoverBackground = styles.buttonHoverBackground;
		this.buttonSecondaryForeground = styles.buttonSecondaryForeground;
		this.buttonSecondaryBackground = styles.buttonSecondaryBackground;
		this.buttonSecondaryHoverBackground = styles.buttonSecondaryHoverBackground;
		this.buttonBorder = styles.buttonBorder;

		this.applyStyles();
	}

	private applyStyles(): void {
		if (this._element) {
			let background, foreground;
			if (this.options.secondary) {
				foreground = this.buttonSecondaryForeground ? this.buttonSecondaryForeground.toString() : '';
				background = this.buttonSecondaryBackground ? this.buttonSecondaryBackground.toString() : '';
			} else {
				foreground = this.buttonForeground ? this.buttonForeground.toString() : '';
				background = this.buttonBackground ? this.buttonBackground.toString() : '';
			}

			const border = this.buttonBorder ? this.buttonBorder.toString() : '';

			this._element.style.color = foreground;
			this._element.style.backgroundColor = background;

			this._element.style.borderWidth = border ? '1px' : '';
			this._element.style.borderStyle = border ? 'solid' : '';
			this._element.style.borderColor = border;
		}
	}

	get element(): HTMLElement {
		return this._element;
	}

	set label(value: string) {
		this._element.classList.add('monaco-text-button');
		if (this.options.supportIcons) {
			reset(this._element, ...renderLabelWithIcons(value));
		} else {
			this._element.textContent = value;
		}
		if (typeof this.options.title === 'string') {
			this._element.title = this.options.title;
		} else if (this.options.title) {
			this._element.title = value;
		}
	}

	set icon(icon: CSSIcon) {
		this._element.classList.add(...CSSIcon.asClassNameArray(icon));
	}

	set enabled(value: boolean) {
		if (value) {
			this._element.classList.remove('disabled');
			this._element.setAttribute('aria-disabled', String(false));
			this._element.tabIndex = 0;
		} else {
			this._element.classList.add('disabled');
			this._element.setAttribute('aria-disabled', String(true));
		}
	}

	get enabled() {
		return !this._element.classList.contains('disabled');
	}

	focus(): void {
		this._element.focus();
	}

	hasFocus(): boolean {
		return this._element === document.activeElement;
	}
}

export interface IButtonWithDropdownOptions extends IButtonOptions {
	readonly contextMenuProvider: IContextMenuProvider;
	readonly actions: IAction[];
	readonly actionRunner?: IActionRunner;
	readonly addPrimaryActionToDropdown?: boolean;
}

export class ButtonWithDropdown extends Disposable implements IButton {

	private readonly button: Button;
	private readonly action: Action;
	private readonly dropdownButton: Button;
	private readonly separatorContainer: HTMLDivElement;
	private readonly separator: HTMLDivElement;

	readonly element: HTMLElement;
	private readonly _onDidClick = this._register(new Emitter<Event | undefined>());
	readonly onDidClick = this._onDidClick.event;

	constructor(container: HTMLElement, options: IButtonWithDropdownOptions) {
		super();

		this.element = document.createElement('div');
		this.element.classList.add('monaco-button-dropdown');
		container.appendChild(this.element);

		this.button = this._register(new Button(this.element, options));
		this._register(this.button.onDidClick(e => this._onDidClick.fire(e)));
		this.action = this._register(new Action('primaryAction', this.button.label, undefined, true, async () => this._onDidClick.fire(undefined)));

		this.separatorContainer = document.createElement('div');
		this.separatorContainer.classList.add('monaco-button-dropdown-separator');

		this.separator = document.createElement('div');
		this.separatorContainer.appendChild(this.separator);
		this.element.appendChild(this.separatorContainer);

		this.dropdownButton = this._register(new Button(this.element, { ...options, title: false, supportIcons: true }));
		this.dropdownButton.element.title = localize("button dropdown more actions", 'More Actions...');
		this.dropdownButton.element.setAttribute('aria-haspopup', 'true');
		this.dropdownButton.element.setAttribute('aria-expanded', 'false');
		this.dropdownButton.element.classList.add('monaco-dropdown-button');
		this.dropdownButton.icon = Codicon.dropDownButton;
		this._register(this.dropdownButton.onDidClick(e => {
			options.contextMenuProvider.showContextMenu({
				getAnchor: () => this.dropdownButton.element,
				getActions: () => options.addPrimaryActionToDropdown === false ? [...options.actions] : [this.action, ...options.actions],
				actionRunner: options.actionRunner,
				onHide: () => this.dropdownButton.element.setAttribute('aria-expanded', 'false')
			});
			this.dropdownButton.element.setAttribute('aria-expanded', 'true');
		}));
	}

	set label(value: string) {
		this.button.label = value;
		this.action.label = value;
	}

	set icon(icon: CSSIcon) {
		this.button.icon = icon;
	}

	set enabled(enabled: boolean) {
		this.button.enabled = enabled;
		this.dropdownButton.enabled = enabled;

		this.element.classList.toggle('disabled', !enabled);
	}

	get enabled(): boolean {
		return this.button.enabled;
	}

	style(styles: IButtonStyles): void {
		this.button.style(styles);
		this.dropdownButton.style(styles);

		// Separator
		const border = styles.buttonBorder ? styles.buttonBorder.toString() : '';

		this.separatorContainer.style.borderTopWidth = border ? '1px' : '';
		this.separatorContainer.style.borderTopStyle = border ? 'solid' : '';
		this.separatorContainer.style.borderTopColor = border;

		this.separatorContainer.style.borderBottomWidth = border ? '1px' : '';
		this.separatorContainer.style.borderBottomStyle = border ? 'solid' : '';
		this.separatorContainer.style.borderBottomColor = border;

		this.separatorContainer.style.backgroundColor = styles.buttonBackground?.toString() ?? '';
		this.separator.style.backgroundColor = styles.buttonSeparator?.toString() ?? '';
	}

	focus(): void {
		this.button.focus();
	}

	hasFocus(): boolean {
		return this.button.hasFocus() || this.dropdownButton.hasFocus();
	}
}

export class ButtonWithDescription extends Button implements IButtonWithDescription {

	private _labelElement: HTMLElement;
	private _descriptionElement: HTMLElement;

	constructor(container: HTMLElement, options?: IButtonOptions) {
		super(container, options);

		this._element.classList.add('monaco-description-button');

		this._labelElement = document.createElement('div');
		this._labelElement.classList.add('monaco-button-label');
		this._element.appendChild(this._labelElement);

		this._descriptionElement = document.createElement('div');
		this._descriptionElement.classList.add('monaco-button-description');
		this._element.appendChild(this._descriptionElement);
	}

	override set label(value: string) {
		this._element.classList.add('monaco-text-button');
		if (this.options.supportIcons) {
			reset(this._labelElement, ...renderLabelWithIcons(value));
		} else {
			this._labelElement.textContent = value;
		}
		if (typeof this.options.title === 'string') {
			this._element.title = this.options.title;
		} else if (this.options.title) {
			this._element.title = value;
		}
	}

	set description(value: string) {
		if (this.options.supportIcons) {
			reset(this._descriptionElement, ...renderLabelWithIcons(value));
		} else {
			this._descriptionElement.textContent = value;
		}
	}
}

export class ButtonBar extends Disposable {

	private _buttons: IButton[] = [];

	constructor(private readonly container: HTMLElement) {
		super();
	}

	get buttons(): IButton[] {
		return this._buttons;
	}

	addButton(options?: IButtonOptions): IButton {
		const button = this._register(new Button(this.container, options));
		this.pushButton(button);
		return button;
	}

	addButtonWithDescription(options?: IButtonOptions): IButtonWithDescription {
		const button = this._register(new ButtonWithDescription(this.container, options));
		this.pushButton(button);
		return button;
	}

	addButtonWithDropdown(options: IButtonWithDropdownOptions): IButton {
		const button = this._register(new ButtonWithDropdown(this.container, options));
		this.pushButton(button);
		return button;
	}

	private pushButton(button: IButton): void {
		this._buttons.push(button);

		const index = this._buttons.length - 1;
		this._register(addDisposableListener(button.element, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			let eventHandled = true;

			// Next / Previous Button
			let buttonIndexToFocus: number | undefined;
			if (event.equals(KeyCode.LeftArrow)) {
				buttonIndexToFocus = index > 0 ? index - 1 : this._buttons.length - 1;
			} else if (event.equals(KeyCode.RightArrow)) {
				buttonIndexToFocus = index === this._buttons.length - 1 ? 0 : index + 1;
			} else {
				eventHandled = false;
			}

			if (eventHandled && typeof buttonIndexToFocus === 'number') {
				this._buttons[buttonIndexToFocus].focus();
				EventHelper.stop(e, true);
			}

		}));

	}

}
