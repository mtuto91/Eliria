/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reset } from 'vs/base/browser/dom';
import { BaseActionViewItem, IBaseActionViewItemOptions } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { IHoverDelegate } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { setupCustomHover } from 'vs/base/browser/ui/iconLabel/iconLabelHover';
import { IAction, SubmenuAction } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { createActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { HiddenItemStrategy, MenuWorkbenchToolBar, WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId, MenuRegistry, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { WindowTitle } from 'vs/workbench/browser/parts/titlebar/windowTitle';

export class CommandCenterControl {

	private readonly _disposables = new DisposableStore();

	private readonly _onDidChangeVisibility = new Emitter<void>();
	readonly onDidChangeVisibility: Event<void> = this._onDidChangeVisibility.event;

	readonly element: HTMLElement = document.createElement('div');

	constructor(
		windowTitle: WindowTitle,
		hoverDelegate: IHoverDelegate,
		@IInstantiationService instantiationService: IInstantiationService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		this.element.classList.add('command-center');

		const titleToolbar = instantiationService.createInstance(MenuWorkbenchToolBar, this.element, MenuId.CommandCenter, {
			contextMenu: MenuId.TitleBarContext,
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			toolbarOptions: {
				primaryGroup: () => true,
			},
			telemetrySource: 'commandCenter',
			actionViewItemProvider: (action) => {
				if (action instanceof SubmenuItemAction && action.item.submenu === MenuId.CommandCenterCenter) {
					return instantiationService.createInstance(CommandCenterCenterViewItem, action, windowTitle, hoverDelegate, {});
				} else {
					return createActionViewItem(instantiationService, action, { hoverDelegate });
				}
			}
		});

		this._disposables.add(quickInputService.onShow(this._setVisibility.bind(this, false)));
		this._disposables.add(quickInputService.onHide(this._setVisibility.bind(this, true)));
		this._disposables.add(titleToolbar);
	}

	private _setVisibility(show: boolean): void {
		this.element.classList.toggle('hide', !show);
		this._onDidChangeVisibility.fire();
	}

	dispose(): void {
		this._disposables.dispose();
	}
}


class CommandCenterCenterViewItem extends BaseActionViewItem {

	private static readonly _quickOpenCommandId = 'workbench.action.quickOpenWithModes';

	constructor(
		private readonly _submenu: SubmenuItemAction,
		private readonly _windowTitle: WindowTitle,
		private readonly _hoverDelegate: IHoverDelegate,
		options: IBaseActionViewItemOptions,
		@IKeybindingService private _keybindingService: IKeybindingService,
		@IInstantiationService private _instaService: IInstantiationService,
	) {
		super(undefined, _submenu.actions[0], options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('command-center');
		if (this._submenu.actions.length === 1 && this._submenu.actions[0].id === CommandCenterCenterViewItem._quickOpenCommandId) {
			this._renderSingleItem(container);
		} else {
			this._renderMultipleItems(container);
			container.classList.add('multiple');
		}
	}

	private _renderMultipleItems(container: HTMLElement) {

		const groups: (readonly IAction[])[] = [];
		for (const action of this._submenu.actions) {
			if (action instanceof SubmenuAction) {
				groups.push(action.actions);
			} else {
				groups.push([action]);
			}
		}

		for (const group of groups) {

			// nested toolbar
			const toolbar = this._instaService.createInstance(WorkbenchToolBar, container, {
				hiddenItemStrategy: HiddenItemStrategy.NoHide,
				telemetrySource: 'commandCenterCenter',
				actionViewItemProvider: (action, options) => {
					return createActionViewItem(this._instaService, action, {
						...options,
						hoverDelegate: this._hoverDelegate,
					});
				}
			});
			toolbar.setActions(group);
			this._store.add(toolbar);

		}
	}

	private _renderSingleItem(container: HTMLElement) {

		const action = this._submenu.actions[0];

		// icon (search)
		const searchIcon = document.createElement('span');
		searchIcon.className = action.class ?? '';
		searchIcon.classList.add('search-icon');

		// label: just workspace name and optional decorations
		const label = this._getLabel();
		const labelElement = document.createElement('span');
		labelElement.classList.add('search-label');
		labelElement.innerText = label;
		reset(container, searchIcon, labelElement);

		const hover = this._store.add(setupCustomHover(this._hoverDelegate, container, this.getTooltip()));

		// update label & tooltip when window title changes
		this._store.add(this._windowTitle.onDidChange(() => {
			hover.update(this.getTooltip());
			labelElement.innerText = this._getLabel();
		}));
	}

	private _getLabel(): string {
		const { prefix, suffix } = this._windowTitle.getTitleDecorations();
		let label = this._windowTitle.isCustomTitleFormat() ? this._windowTitle.getWindowTitle() : this._windowTitle.workspaceName;
		if (!label) {
			label = localize('label.dfl', "Search");
		}
		if (prefix) {
			label = localize('label1', "{0} {1}", prefix, label);
		}
		if (suffix) {
			label = localize('label2', "{0} {1}", label, suffix);
		}
		return label;
	}

	protected override getTooltip() {

		// tooltip: full windowTitle
		const kb = this._keybindingService.lookupKeybinding(this.action.id)?.getLabel();
		const title = kb
			? localize('title', "Search {0} ({1}) \u2014 {2}", this._windowTitle.workspaceName, kb, this._windowTitle.value)
			: localize('title2', "Search {0} \u2014 {1}", this._windowTitle.workspaceName, this._windowTitle.value);

		return title;
	}
}


MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
	submenu: MenuId.CommandCenterCenter,
	title: localize('title3', "Command Center"),
	icon: Codicon.shield,
	order: 101,
});
