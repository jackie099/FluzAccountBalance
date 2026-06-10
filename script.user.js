// ==UserScript==
// @name         Fluz Bank Balance
// @namespace    fluz_balance
// @version      2.2.7
// @description  Show Fluz Bank Balance in table and dropdown with account management and deposit presets
// @author       GammaExpansion
// @match        https://fluz.app/*
// @grant        none
// @icon         https://fluz.099.im/favicon.png
// @downloadURL  https://raw.githubusercontent.com/GammaExpansion/FluzAccountBalance/main/script.user.js
// @updateURL    https://raw.githubusercontent.com/GammaExpansion/FluzAccountBalance/main/script.user.js
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    /**
     * Checks if current URL is the manage-money page.
     */
    function isOnManageMoneyPage() {
        return window.location.pathname.startsWith('/manage-money');
    }

    /**
     * Finds the React props for a given DOM element.
     */
    function findReactProps(element) {
        const propKey = Object.keys(element).find(key => key.startsWith('__reactProps$'));
        if (!propKey) {
            return null;
        }
        return element[propKey];
    }

    /**
     * Parse funding source options into readable dictionary.
     */
    function parseFundingSourceOptions(options) {
        return options.filter(
            (option) => option.type == "BANK_ACCOUNT"
        ).flatMap((option) => ({
            "bank_account_id": option.bank_account_id,
            "bank_institution_auth_id": option.bank_institution_auth_id,
            "institution_name": option.bank_institution_auth.platform_institution_name,
            "name": option.name,
            "final_spend_power": option.spend_power.final_spend_power,
            "available_spend_power": option.spend_power.spend_power.available_spend_power,
            "last_recorded_balance": option.spend_power.spend_power.last_recorded_balance,
            "pending_transactions": option.spend_power.spend_power.pending_transactions,
            "spend_power": option.spend_power.spend_power.spend_power
        }))
    }

    /**
    * Formats a number as USD currency.
    * @param {number} number - The number to format.
    * @returns {string} - The formatted currency string.
    */
    function formatCurrency(number) {
        // A simple polyfill in case Intl is not available
        if (typeof Intl !== 'undefined' && typeof Intl.NumberFormat !== 'undefined') {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
            }).format(number);
        } else {
            // Fallback for older environments
            return '$' + number.toFixed(2);
        }
    }

    /**
    * LocalStorage key for table expansion state.
    */
    const STORAGE_KEY = 'fluz_account_table_expanded';

    /**
    * LocalStorage key for saved deposit presets.
    */
    const PRESETS_STORAGE_KEY = 'fluz_deposit_presets';

    /**
    * Gets saved presets from localStorage.
    * @returns {Array} - Array of preset objects.
    */
    function getPresets() {
        try {
            const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error('Error loading presets:', e);
            return [];
        }
    }

    /**
    * Saves presets to localStorage.
    * @param {Array} presets - Array of preset objects.
    */
    function savePresets(presets) {
        try {
            localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
        } catch (e) {
            console.error('Error saving presets:', e);
        }
    }

    /**
    * Adds a new preset.
    * @param {Object} preset - The preset object to add.
    */
    function addPreset(preset) {
        const presets = getPresets();
        preset.id = Date.now().toString();
        presets.push(preset);
        savePresets(presets);
        return preset;
    }

    /**
    * Deletes a preset by ID.
    * @param {string} presetId - The preset ID to delete.
    */
    function deletePreset(presetId) {
        const presets = getPresets().filter(p => p.id !== presetId);
        savePresets(presets);
    }

    /**
    * Gets the selected option text from a funding source dropdown.
    * @param {Element} wrapper - The funding wrapper element.
    * @returns {string} - The selected option text or empty string.
    */
    function getSelectedOptionText(wrapper) {
        if (!wrapper) return '';

        // Try multiple selectors to find the label text
        const selectors = [
            '._selected-option-container_14f6y_280 .label',
            '._selected-option-container_14f6y_280 ._title_1ucsv_126',
            '._selected-option-container_14f6y_280 [class*="_list-item-title"]',
            '._selected-option-container_14f6y_280 [class*="_title"]',
            '[class*="_selected-option"] .label',
            '[class*="_selected-option"] [class*="_title"]'
        ];

        for (const selector of selectors) {
            const element = wrapper.querySelector(selector);
            if (element && element.textContent.trim()) {
                return element.textContent.trim();
            }
        }

        return '';
    }

    /**
    * Gets the selected category from the gift card category dropdown.
    * @returns {string} - The selected category text or empty string.
    */
    function getSelectedCategory() {
        // Category dropdown is in _category-margin wrapper, not _funding-wrapper
        const categoryWrapper = document.querySelector('[class*="_category-margin"]');
        if (!categoryWrapper) return '';

        // The selected value is in an input with type="button"
        const input = categoryWrapper.querySelector('input[type="button"]');
        if (input && input.value && input.value !== 'Any category') {
            return input.value;
        }

        return '';
    }

    /**
    * Captures the current form state as a preset object.
    * @returns {Object|null} - The preset object or null if form not found.
    */
    function captureCurrentFormState() {
        const depositInput = document.getElementById('deposit-value');
        const quantityInput = document.getElementById('deposit-quantity');

        if (!depositInput) return null;

        // Get all funding wrappers
        const fundingWrappers = document.querySelectorAll('[class*="_funding-wrapper"]');

        // Get destination (Move money to) - first funding wrapper
        const destinationText = getSelectedOptionText(fundingWrappers[0]);

        // Get funding source (Move money from) - second funding wrapper
        const fundingSource = getSelectedOptionText(fundingWrappers[1]);

        // Get gift card category - separate dropdown with _category-margin class
        const giftCardCategory = getSelectedCategory();

        return {
            amount: depositInput.value || '',
            quantity: quantityInput ? quantityInput.value : '1',
            destination: destinationText,
            fundingSource: fundingSource,
            giftCardCategory: giftCardCategory
        };
    }

    /**
    * Sets an input value using native setter to trigger React updates.
    * @param {HTMLInputElement} input - The input element.
    * @param {string} value - The value to set.
    */
    function setInputValue(input, value) {
        if (!input) return;
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /**
    * Applies a preset to the form.
    * Sequences operations with delays since fields appear dynamically:
    * - Quantity appears after selecting prepayment destination
    * - Gift card category appears after selecting funding source
    * @param {Object} preset - The preset to apply.
    */
    function applyPreset(preset) {
        // Step 1: Select destination (Move money to)
        const fundingWrappers = document.querySelectorAll('[class*="_funding-wrapper"]');
        if (fundingWrappers[0] && preset.destination) {
            selectDropdownOption(fundingWrappers[0], preset.destination, false);
        }

        // Step 2: After destination is selected, select funding source
        setTimeout(() => {
            const fundingWrappers2 = document.querySelectorAll('[class*="_funding-wrapper"]');
            if (fundingWrappers2[1] && preset.fundingSource) {
                selectDropdownOption(fundingWrappers2[1], preset.fundingSource, false);
            }

            // Step 3: After funding source is selected, category dropdown appears
            // Fill amount, quantity, and select category
            setTimeout(() => {
                // Fill the deposit amount
                const depositInput = document.getElementById('deposit-value');
                if (depositInput && preset.amount) {
                    setInputValue(depositInput, preset.amount);
                }

                // Fill the quantity (only exists for prepayment mode)
                const quantityInput = document.getElementById('deposit-quantity');
                if (quantityInput && preset.quantity) {
                    setInputValue(quantityInput, preset.quantity);
                }

                // Select gift card category (separate dropdown with _category-margin class)
                if (preset.giftCardCategory) {
                    const categoryWrapper = document.querySelector('[class*="_category-margin"]');
                    if (categoryWrapper) {
                        selectDropdownOption(categoryWrapper, preset.giftCardCategory, false);
                    }
                }
            }, 500);
        }, 400);
    }

    /*
    * Fluz renders its dropdowns with CSS-module class names that are hashed at
    * build time (e.g. "_options_1tb6i_322 _open_1tb6i_230"). The hash suffix
    * changes whenever Fluz rebuilds, which previously broke account selection
    * when the literal ".options"/".option" class names disappeared. To stay
    * resilient we match on the stable, un-hashed prefix via [class*="..."] while
    * still accepting the older literal class names for backward compatibility.
    */
    const OPEN_OPTIONS_SELECTOR = '.options.open, [class*="_options_"][class*="_open_"]';
    const OPTIONS_CONTAINER_SELECTOR = '.options, [class*="_options_"]';
    const OPEN_DROPDOWN_SELECTOR = '.dropdown.open, [class*="_dropdown_"][class*="_open_"]';
    const OPTION_SELECTOR = '.option, [class*="_option_"], [role="menuitem"]';
    const OPTION_LABEL_SELECTORS = [
        '.content .label',
        '[class*="_content_"] [class*="_label_"]',
        '.label',
        '[class*="_label_"]',
        '[class*="_list-item-title"]',
        '[class*="_title"]'
    ];

    /**
    * Finds the open options list for a dropdown wrapper, handling both the flat
    * funding-source structure (options container directly under the wrapper) and
    * the nested category structure (options container inside an open dropdown).
    * @param {Element} wrapper - The dropdown wrapper element.
    * @returns {Element|null} - The open options container, or null if closed.
    */
    function getOpenOptionsContainer(wrapper) {
        const openOptions = wrapper.querySelector(OPEN_OPTIONS_SELECTOR);
        if (openOptions) return openOptions;

        // Category dropdown: the open marker is on the dropdown, options nested inside.
        const openDropdown = wrapper.querySelector(OPEN_DROPDOWN_SELECTOR);
        if (openDropdown) {
            return openDropdown.querySelector(OPTIONS_CONTAINER_SELECTOR) || openDropdown;
        }

        return null;
    }

    /**
    * Gets label text from a dropdown option element.
    * @param {Element} option - The option element.
    * @returns {string} - The label text.
    */
    function getOptionLabelText(option) {
        for (const selector of OPTION_LABEL_SELECTORS) {
            const label = option.querySelector(selector);
            if (label && label.textContent.trim()) {
                return label.textContent.trim();
            }
        }
        return '';
    }

    /**
    * Helper to select an option from a dropdown.
    * Handles both flat funding-source dropdowns and nested category dropdowns
    * via getOpenOptionsContainer (resilient to Fluz's hashed CSS-module classes).
    * @param {Element} wrapper - The dropdown wrapper element.
    * @param {string} searchText - Text to match in the option label.
    * @param {boolean} partialMatch - Whether to use partial matching.
    */
    function selectDropdownOption(wrapper, searchText, partialMatch) {
        const selectMatchingOption = () => {
            const openDropdown = getOpenOptionsContainer(wrapper);
            if (!openDropdown) return false;

            const options = openDropdown.querySelectorAll(OPTION_SELECTOR);

            for (const option of options) {
                const labelText = getOptionLabelText(option);
                if (labelText) {
                    const matches = partialMatch
                        ? labelText.toLowerCase().includes(searchText.toLowerCase())
                        : labelText === searchText;
                    if (matches) {
                        option.click();
                        return true;
                    }
                }
            }
            return false;
        };

        // Check if dropdown is already open
        if (getOpenOptionsContainer(wrapper)) {
            selectMatchingOption();
        } else {
            // Find the trigger element - can be _selection or an input button
            let trigger = wrapper.querySelector('[class*="_selection"]');
            if (!trigger) {
                trigger = wrapper.querySelector('input[type="button"]');
            }
            if (trigger) {
                trigger.click();
                // Give more time for category dropdown animation
                setTimeout(() => {
                    selectMatchingOption();
                }, 200);
            }
        }
    }

    /**
    * Creates the preset bar HTML.
    * @returns {string} - The HTML string for the preset bar.
    */
    function createPresetBarHtml() {
        const presets = getPresets();

        let presetsHtml = '';
        presets.forEach(preset => {
            const displayName = preset.name || `${formatCurrency(parseFloat(preset.amount))}`;
            // Store preset details as data attributes for custom tooltip
            const escapeAttr = (str) => (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

            presetsHtml += `
                <div class="fluz-preset-chip"
                     data-preset-id="${preset.id}"
                     data-amount="${escapeAttr(preset.amount)}"
                     data-quantity="${escapeAttr(preset.quantity)}"
                     data-destination="${escapeAttr(preset.destination)}"
                     data-source="${escapeAttr(preset.fundingSource)}"
                     data-category="${escapeAttr(preset.giftCardCategory)}"
                     style="
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 10px;
                    background: linear-gradient(135deg, #f8f8f8 0%, #fff 100%);
                    border: 1px solid #E7E5E4;
                    border-radius: 20px;
                    font-size: 13px;
                    font-weight: 500;
                    color: #1A0000;
                    cursor: pointer;
                    transition: all 0.2s;
                    white-space: nowrap;
                    flex-shrink: 0;
                ">
                    <span class="fluz-preset-name">${displayName}</span>
                    <span class="fluz-preset-delete" data-preset-id="${preset.id}" style="
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 16px;
                        height: 16px;
                        border-radius: 50%;
                        background: transparent;
                        color: #999;
                        font-size: 12px;
                        line-height: 1;
                        transition: all 0.15s;
                    ">&times;</span>
                </div>
            `;
        });

        return `
            <div id="fluz-preset-bar" style="
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 16px;
                padding: 12px;
                background: linear-gradient(135deg, #fafafa 0%, #f5f5f4 100%);
                border-radius: 10px;
                border: 1px solid #E7E5E4;
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
            ">
                <div style="
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding-right: 10px;
                    border-right: 1px solid #E7E5E4;
                    flex-shrink: 0;
                ">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#787571" stroke-width="2">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                    </svg>
                    <span style="font-size: 12px; font-weight: 600; color: #787571; text-transform: uppercase; letter-spacing: 0.5px;">Presets</span>
                </div>

                <div id="fluz-presets-container" style="
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex: 1;
                    overflow-x: auto;
                    padding: 2px 0;
                ">
                    ${presetsHtml || '<span style="color: #999; font-size: 13px; font-style: italic;">No saved presets</span>'}
                </div>

                <button id="fluz-save-preset-btn" style="
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 6px 12px;
                    background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
                    color: white;
                    border: none;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    flex-shrink: 0;
                ">
                    <span style="font-size: 14px; line-height: 1;">+</span> Save
                </button>
            </div>
        `;
    }

    /**
    * Shows the save preset dialog.
    */
    function showSavePresetDialog() {
        const currentState = captureCurrentFormState();
        if (!currentState) {
            alert('Unable to capture form state. Please ensure you are on the deposit page.');
            return;
        }

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'fluz-preset-modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fluz-fade-in 0.2s ease;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 24px;
            width: 90%;
            max-width: 400px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
            animation: fluz-slide-up 0.3s ease;
        `;

        const categoryLine = currentState.giftCardCategory
            ? `<div style="font-size: 13px; color: #666; margin-bottom: 4px;">Category: <strong>${currentState.giftCardCategory}</strong></div>`
            : '';
        const previewInfo = `
            <div style="font-size: 13px; color: #666; margin-bottom: 4px;">Amount: <strong>${formatCurrency(parseFloat(currentState.amount) || 0)}</strong></div>
            <div style="font-size: 13px; color: #666; margin-bottom: 4px;">Quantity: <strong>${currentState.quantity || '1'}</strong></div>
            <div style="font-size: 13px; color: #666; margin-bottom: 4px;">Destination: <strong>${currentState.destination || 'Not selected'}</strong></div>
            <div style="font-size: 13px; color: #666; margin-bottom: 4px;">Source: <strong>${currentState.fundingSource || 'Not selected'}</strong></div>
            ${categoryLine}
        `;

        modal.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1A0000;">Save Preset</h3>
                <button id="fluz-modal-close" style="
                    background: none;
                    border: none;
                    font-size: 24px;
                    color: #999;
                    cursor: pointer;
                    padding: 0;
                    line-height: 1;
                ">&times;</button>
            </div>

            <div style="
                background: #f8f8f8;
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 16px;
            ">
                ${previewInfo}
            </div>

            <div style="margin-bottom: 20px;">
                <label style="display: block; font-size: 13px; font-weight: 600; color: #1A0000; margin-bottom: 6px;">Preset Name</label>
                <input type="text" id="fluz-preset-name-input" placeholder="e.g., Daily Deposit, Max Transfer" style="
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid #E7E5E4;
                    border-radius: 8px;
                    font-size: 14px;
                    box-sizing: border-box;
                    transition: border-color 0.2s;
                " />
            </div>

            <div style="display: flex; gap: 10px;">
                <button id="fluz-modal-cancel" style="
                    flex: 1;
                    padding: 10px;
                    background: #f5f5f4;
                    color: #666;
                    border: 1px solid #E7E5E4;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                ">Cancel</button>
                <button id="fluz-modal-save" style="
                    flex: 1;
                    padding: 10px;
                    background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                ">Save Preset</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Add animation styles if not present
        if (!document.getElementById('fluz-modal-styles')) {
            const style = document.createElement('style');
            style.id = 'fluz-modal-styles';
            style.textContent = `
                @keyframes fluz-fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes fluz-slide-up {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `;
            document.head.appendChild(style);
        }

        // Focus the input
        const nameInput = document.getElementById('fluz-preset-name-input');
        setTimeout(() => nameInput.focus(), 100);

        // Event handlers
        const closeModal = () => {
            overlay.style.animation = 'fluz-fade-in 0.2s ease reverse';
            setTimeout(() => overlay.remove(), 150);
        };

        document.getElementById('fluz-modal-close').addEventListener('click', closeModal);
        document.getElementById('fluz-modal-cancel').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        document.getElementById('fluz-modal-save').addEventListener('click', () => {
            const name = nameInput.value.trim();
            const preset = {
                ...currentState,
                name: name || `${formatCurrency(parseFloat(currentState.amount))} x${currentState.quantity}`
            };

            addPreset(preset);
            closeModal();
            rerenderPresetBar();
        });

        // Allow Enter to save
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('fluz-modal-save').click();
            }
        });
    }

    /**
    * Re-renders the preset bar with updated presets.
    */
    function rerenderPresetBar() {
        const existingBar = document.getElementById('fluz-preset-bar');
        if (existingBar) {
            const parent = existingBar.parentElement;
            const newBar = document.createElement('div');
            newBar.innerHTML = createPresetBarHtml();
            parent.replaceChild(newBar.firstElementChild, existingBar);
            attachPresetBarHandlers();
        }
    }

    /**
    * Shows a custom tooltip for preset chips.
    * @param {Element} chip - The chip element.
    * @param {MouseEvent} e - The mouse event.
    */
    function showPresetTooltip(chip, e) {
        // Remove any existing tooltip
        hidePresetTooltip();

        const amount = chip.getAttribute('data-amount') || '0';
        const quantity = chip.getAttribute('data-quantity') || '1';
        const destination = chip.getAttribute('data-destination') || 'Not set';
        const source = chip.getAttribute('data-source') || 'Not set';
        const category = chip.getAttribute('data-category');

        const tooltip = document.createElement('div');
        tooltip.id = 'fluz-preset-tooltip';
        tooltip.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.2);">Preset Details</div>
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; font-size: 12px;">
                <span style="color: rgba(255,255,255,0.7);">Amount:</span><span>${formatCurrency(parseFloat(amount))}</span>
                <span style="color: rgba(255,255,255,0.7);">Quantity:</span><span>${quantity}</span>
                <span style="color: rgba(255,255,255,0.7);">To:</span><span>${destination}</span>
                <span style="color: rgba(255,255,255,0.7);">From:</span><span>${source}</span>
                ${category ? `<span style="color: rgba(255,255,255,0.7);">Category:</span><span>${category}</span>` : ''}
            </div>
        `;
        tooltip.style.cssText = `
            position: fixed;
            background: rgba(30, 30, 30, 0.95);
            color: white;
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 13px;
            z-index: 10001;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 280px;
            backdrop-filter: blur(4px);
        `;

        document.body.appendChild(tooltip);

        // Position tooltip above the chip
        const chipRect = chip.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        let left = chipRect.left + (chipRect.width / 2) - (tooltipRect.width / 2);
        let top = chipRect.top - tooltipRect.height - 8;

        // Keep within viewport
        if (left < 10) left = 10;
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }
        if (top < 10) {
            top = chipRect.bottom + 8; // Show below if no room above
        }

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    }

    /**
    * Hides the preset tooltip.
    */
    function hidePresetTooltip() {
        const existing = document.getElementById('fluz-preset-tooltip');
        if (existing) existing.remove();
    }

    /**
    * Attaches event handlers to the preset bar elements.
    */
    function attachPresetBarHandlers() {
        // Save button
        const saveBtn = document.getElementById('fluz-save-preset-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', showSavePresetDialog);
            saveBtn.addEventListener('mouseenter', () => {
                saveBtn.style.transform = 'scale(1.05)';
                saveBtn.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
            });
            saveBtn.addEventListener('mouseleave', () => {
                saveBtn.style.transform = 'scale(1)';
                saveBtn.style.boxShadow = 'none';
            });
        }

        // Preset chips
        const chips = document.querySelectorAll('.fluz-preset-chip');
        chips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                // Don't trigger if clicking delete button
                if (e.target.classList.contains('fluz-preset-delete')) return;

                const presetId = chip.getAttribute('data-preset-id');
                const presets = getPresets();
                const preset = presets.find(p => p.id === presetId);
                if (preset) {
                    applyPreset(preset);
                    // Visual feedback - keep green while preset is being applied (~1200ms total)
                    chip.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
                    chip.style.color = 'white';
                    setTimeout(() => {
                        chip.style.background = 'linear-gradient(135deg, #f8f8f8 0%, #fff 100%)';
                        chip.style.color = '#1A0000';
                    }, 1200);
                }
            });

            chip.addEventListener('mouseenter', (e) => {
                chip.style.borderColor = '#3B82F6';
                chip.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.2)';
                showPresetTooltip(chip, e);
            });

            chip.addEventListener('mouseleave', () => {
                chip.style.borderColor = '#E7E5E4';
                chip.style.boxShadow = 'none';
                hidePresetTooltip();
            });
        });

        // Delete buttons
        const deleteButtons = document.querySelectorAll('.fluz-preset-delete');
        deleteButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const presetId = btn.getAttribute('data-preset-id');
                if (confirm('Delete this preset?')) {
                    deletePreset(presetId);
                    rerenderPresetBar();
                }
            });

            btn.addEventListener('mouseenter', () => {
                btn.style.background = '#FEE2E2';
                btn.style.color = '#EF4444';
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'transparent';
                btn.style.color = '#999';
            });
        });
    }

    /**
    * Gets the saved expansion state from localStorage.
    * @returns {boolean} - True if expanded, false if collapsed. Defaults to true.
    */
    function getExpansionState() {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved === null ? true : saved === 'true';
    }

    /**
    * Saves the expansion state to localStorage.
    * @param {boolean} isExpanded - Whether the table is expanded.
    */
    function setExpansionState(isExpanded) {
        localStorage.setItem(STORAGE_KEY, isExpanded.toString());
    }

    /**
    * Opens the Add Bank Account modal by dispatching a custom event.
    */
    function openAddBankAccount() {
        window.dispatchEvent(new CustomEvent('AddBankAccount', {
            detail: { open: true, eventName: 'AddBankAccount' }
        }));
    }

    /**
    * Selects an account from the summary to auto-fill deposit amount and select in dropdown.
    * @param {string} accountName - The account name to select.
    * @param {number} finalSpendPower - The final spend power amount to fill.
    */
    function selectAccountForDeposit(accountName, finalSpendPower) {
        // Step 1: Fill the deposit amount input
        const depositInput = document.getElementById('deposit-value');
        if (depositInput) {
            // Format to 2 decimal places without currency symbol
            const amountStr = finalSpendPower.toFixed(2);

            // Use native setter to properly trigger React's onChange
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeInputValueSetter.call(depositInput, amountStr);

            // Dispatch input event to trigger React state update
            depositInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Step 2: Find the funding source dropdown and select the matching option
        const fundingWrapper = document.querySelectorAll('[class*="_funding-wrapper"]')[1];
        if (!fundingWrapper) return;

        // Helper function to find and click matching option
        const selectMatchingOption = () => {
            const openDropdown = getOpenOptionsContainer(fundingWrapper);
            if (!openDropdown) return false;

            const options = openDropdown.querySelectorAll(OPTION_SELECTOR);
            for (const option of options) {
                if (getOptionLabelText(option) === accountName) {
                    option.click();
                    return true;
                }
            }
            return false;
        };

        // Check if dropdown is already open
        if (getOpenOptionsContainer(fundingWrapper)) {
            // Dropdown already open, select directly
            selectMatchingOption();
        } else {
            // Find the selection area that toggles the dropdown (the clickable trigger)
            const selectionArea = fundingWrapper.querySelector('[class*="_selection"]');
            if (selectionArea) {
                selectionArea.click();

                // Wait for dropdown to open, then select the option
                setTimeout(() => {
                    selectMatchingOption();
                }, 150);
            }
        }
    }

    /**
    * Toggles the expansion state of the account table.
    */
    function toggleAccountTable() {
        const content = document.getElementById('fluz-account-content');
        const icon = document.getElementById('fluz-expand-icon');

        if (!content || !icon) return;

        const isCurrentlyExpanded = content.style.display !== 'none';
        const newState = !isCurrentlyExpanded;

        content.style.display = newState ? 'flex' : 'none';
        icon.textContent = newState ? '▼' : '▶';

        setExpansionState(newState);
    }

    /**
    * Removes/disconnects a bank account from Fluz.
    * @param {string} bankInstitutionAuthId - The bank institution auth ID.
    * @param {string} bankAccountId - The bank account ID.
    * @param {string} accountName - The account name for confirmation dialog.
    */
    async function removeAccount(bankInstitutionAuthId, bankAccountId, accountName) {
        const confirmed = confirm(`Are you sure you want to disconnect "${accountName.trim()}"?\n\nThis will remove the account from Fluz.`);
        if (!confirmed) return;

        const button = document.querySelector(`[data-account-id="${bankAccountId}"]`);
        if (button) {
            button.disabled = true;
            button.textContent = '...';
        }

        try {
            const response = await fetch(
                `https://fluz.app/payment-methods/connected-accounts/removePlaidInstitution/${bankInstitutionAuthId}/${bankAccountId}.data`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ bankInstitutionId: bankAccountId }),
                    credentials: 'include'
                }
            );

            if (response.ok || response.status === 202) {
                // Remove the card from UI
                const card = document.getElementById(`fluz-account-card-${bankAccountId}`);
                if (card) {
                    card.style.transition = 'opacity 0.3s, transform 0.3s';
                    card.style.opacity = '0';
                    card.style.transform = 'translateX(-20px)';
                    setTimeout(() => card.remove(), 300);
                }

                // Reload the page after a short delay to refresh data
                setTimeout(() => {
                    window.location.reload();
                }, 500);
            } else {
                throw new Error(`Failed to remove account: ${response.status}`);
            }
        } catch (error) {
            console.error('Error removing account:', error);
            alert('Failed to disconnect account. Please try again or use the Fluz app.');
            if (button) {
                button.disabled = false;
                button.textContent = 'X';
            }
        }
    }

    /**
    * Adds balance information to dropdown menu options.
    * @param {Array} accountData - The array of account objects with balance info.
    */
    function enhanceDropdownWithBalances(accountData) {
        // Find all dropdown options
        const dropdownOptions = document.querySelectorAll('.options .option');

        dropdownOptions.forEach((option) => {
            // Check if this is a bank account option (NO FEE badge)
            const badge = option.querySelector('.fluz-badges .title');
            const isBankAccount = badge && badge.textContent.trim() === 'NO FEE';

            if (!isBankAccount) return;

            // Get the label text
            const label = option.querySelector('.content .label');
            if (!label) return;

            const labelText = label.textContent.trim();

            // Find matching account by comparing the full account name
            // The dropdown label matches the account.name field exactly
            const matchingAccount = accountData.find(account => {
                return account.name.trim() === labelText;
            });

            if (!matchingAccount) return;

            // Check if subline already exists (don't duplicate)
            const existingSubline = option.querySelector('.content .subline');
            if (existingSubline && existingSubline.classList.contains('fluz-balance-info')) return;

            // Create and add the subline with balance info
            const subline = document.createElement('p');
            subline.className = 'subline fluz-balance-info';
            subline.style.cssText = 'margin: 4px 0 0 0; font-size: 0.85em; color: #666;';
            subline.textContent = `Balance: ${formatCurrency(matchingAccount.last_recorded_balance)} | Pending: ${formatCurrency(matchingAccount.pending_transactions)} | Available: ${formatCurrency(matchingAccount.available_spend_power)}`;

            const content = option.querySelector('.content');
            if (content) {
                content.appendChild(subline);
            }
        });
    }

    /**
    * Takes the account data and returns card-based HTML for narrow layouts.
    * @param {Array} data - The array of account objects.
    * @param {boolean} isExpanded - Whether the table should be expanded initially.
    * @returns {string} - The HTML string.
    */
    function createAccountTableHtml(data, isExpanded) {
        const arrowIcon = isExpanded ? '▼' : '▶';
        const contentDisplay = isExpanded ? 'flex' : 'none';

        let htmlString = `
            <div id="fluz-account-header" style="display: flex; align-items: center; justify-content: space-between; margin: 16px 0 10px 0; cursor: pointer; user-select: none; padding: 8px; border-radius: 6px; transition: background-color 0.2s;">
                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Account Summary</h3>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <button id="fluz-add-account-btn" style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; border: none; border-radius: 4px; padding: 4px 10px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 4px;">
                        <span style="font-size: 14px; line-height: 1;">+</span> Add
                    </button>
                    <span id="fluz-expand-icon" style="font-size: 14px; color: #666; transition: transform 0.2s;">${arrowIcon}</span>
                </div>
            </div>
        `;
        htmlString += `<div id="fluz-account-content" style="display: ${contentDisplay}; flex-direction: column; gap: 8px;">`;

        // Create a card for each account (hide zero-balance accounts)
        data.filter(account => parseFloat(account.final_spend_power) !== 0).forEach(account => {
            htmlString += `
                <div id="fluz-account-card-${account.bank_account_id}"
                     class="fluz-account-card"
                     data-account-name="${account.name.trim().replace(/"/g, '&quot;')}"
                     data-final-spend-power="${account.final_spend_power}"
                     style="background: white; border-radius: 6px; padding: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.08); border: 1px solid #E7E5E4; position: relative; cursor: pointer; transition: all 0.2s;">
                    <button
                        class="fluz-remove-btn"
                        data-account-id="${account.bank_account_id}"
                        data-auth-id="${account.bank_institution_auth_id}"
                        data-account-name="${account.name.replace(/"/g, '&quot;')}"
                        style="position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; border-radius: 50%; border: 1px solid #E7E5E4; background: #fff; color: #787571; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; line-height: 1; transition: all 0.2s;"
                        title="Disconnect account"
                    >X</button>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; padding-right: 24px;">
                        <div style="font-weight: 600; font-size: 14px; color: #1A0000; line-height: 1.3;">${account.institution_name}</div>
                        <div style="font-weight: 600; font-size: 14px; color: #1A0000; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${account.name.trim()}</div>
                    </div>
                    <div style="display: flex; justify-content: space-between; gap: 10px; font-size: 13px;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="color: #787571; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 3px;">Bal</div>
                            <div style="font-weight: 600; color: #1A0000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${formatCurrency(account.last_recorded_balance)}</div>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="color: #787571; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 3px;">Pend</div>
                            <div style="font-weight: 600; color: #1A0000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${formatCurrency(account.pending_transactions)}</div>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="color: #787571; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 3px;">Avail</div>
                            <div style="font-weight: 600; color: #10B981; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${formatCurrency(account.available_spend_power)}</div>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="color: #787571; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 3px;">Final</div>
                            <div style="font-weight: 600; color: #10B981; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${formatCurrency(account.final_spend_power)}</div>
                        </div>
                    </div>
                </div>
            `;
        });

        htmlString += '</div>';
        return htmlString;
    }

    // Main script logic
    let fundingSourceOptions = null;
    let lastUrl = window.location.href;

    const checkInterval = setInterval(() => {
        // Detect URL changes (SPA navigation)
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            // Reset state when navigating
            fundingSourceOptions = null;
            // Remove both containers
            const existingPreset = document.querySelector('._fluz_preset_container');
            const existingAccount = document.querySelector('._fluz_account_summary');
            if (existingPreset) existingPreset.remove();
            if (existingAccount) existingAccount.remove();
        }

        // Only run on manage-money page
        if (!isOnManageMoneyPage()) {
            return;
        }

        // Safely check for required DOM elements
        const fundingWrapper = document.querySelectorAll('[class*="_funding-wrapper"]')[1];
        const depositStepsElement = document.querySelector('[class*="_prepayment-title"]');

        if (!fundingWrapper || !depositStepsElement) {
            return; // Elements not ready yet
        }

        const depositSteps = depositStepsElement.parentElement;
        if (!depositSteps) {
            return; // Parent element not available
        }

        const reactProps = findReactProps(fundingWrapper);
        if (!reactProps || !reactProps.children || !reactProps.children.props) {
            return; // React props not ready yet
        }

        const props = reactProps.children.props;
        let fundingPropsAvailable = !!props;
        let fluzBalanceSheetRendered = !!document.querySelector('._fluz_preset_container');

        // Render table once
        if (fundingPropsAvailable && !fluzBalanceSheetRendered) {
            try {
                // Get funding source from React Props.
                fundingSourceOptions = parseFundingSourceOptions(props.options);

                // Get saved expansion state
                const isExpanded = getExpansionState();

                // Create preset bar container (goes at top)
                let presetContainer = document.createElement('div');
                presetContainer.className = '_fluz_balance_sheet _fluz_preset_container';
                presetContainer.innerHTML = createPresetBarHtml();

                // Create account summary container (goes at bottom)
                let accountContainer = document.createElement('div');
                accountContainer.className = '_fluz_account_summary';
                accountContainer.innerHTML = createAccountTableHtml(fundingSourceOptions, isExpanded);

                // Insert preset bar at the beginning (top)
                depositSteps.insertBefore(presetContainer, depositSteps.firstChild);

                // Insert account summary at the end (bottom)
                depositSteps.appendChild(accountContainer);

                // Attach preset bar handlers
                attachPresetBarHandlers();

                // Attach click handler to header
                const header = document.getElementById('fluz-account-header');
                if (header) {
                    header.addEventListener('click', toggleAccountTable);
                    // Add hover effect
                    header.addEventListener('mouseenter', () => {
                        header.style.backgroundColor = 'rgba(0, 0, 0, 0.03)';
                    });
                    header.addEventListener('mouseleave', () => {
                        header.style.backgroundColor = 'transparent';
                    });
                }

                // Attach click handler to Add Account button
                const addBtn = document.getElementById('fluz-add-account-btn');
                if (addBtn) {
                    addBtn.addEventListener('click', (e) => {
                        e.stopPropagation(); // Don't trigger header collapse
                        openAddBankAccount();
                    });
                    // Add hover effect
                    addBtn.addEventListener('mouseenter', () => {
                        addBtn.style.transform = 'scale(1.05)';
                        addBtn.style.boxShadow = '0 2px 4px rgba(16, 185, 129, 0.3)';
                    });
                    addBtn.addEventListener('mouseleave', () => {
                        addBtn.style.transform = 'scale(1)';
                        addBtn.style.boxShadow = 'none';
                    });
                }

                // Attach click handlers to remove buttons
                const removeButtons = document.querySelectorAll('.fluz-remove-btn');
                removeButtons.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const accountId = btn.getAttribute('data-account-id');
                        const authId = btn.getAttribute('data-auth-id');
                        const accountName = btn.getAttribute('data-account-name');
                        removeAccount(authId, accountId, accountName);
                    });
                    // Add hover effect
                    btn.addEventListener('mouseenter', () => {
                        btn.style.backgroundColor = '#FEE2E2';
                        btn.style.borderColor = '#EF4444';
                        btn.style.color = '#EF4444';
                    });
                    btn.addEventListener('mouseleave', () => {
                        btn.style.backgroundColor = '#fff';
                        btn.style.borderColor = '#E7E5E4';
                        btn.style.color = '#787571';
                    });
                });

                // Attach click handlers to account cards for auto-fill
                const accountCards = document.querySelectorAll('.fluz-account-card');
                accountCards.forEach(card => {
                    card.addEventListener('click', (e) => {
                        // Don't trigger if clicking the remove button
                        if (e.target.closest('.fluz-remove-btn')) return;

                        const accountName = card.getAttribute('data-account-name');
                        const finalSpendPower = parseFloat(card.getAttribute('data-final-spend-power'));
                        selectAccountForDeposit(accountName, finalSpendPower);
                    });
                    // Add hover effect
                    card.addEventListener('mouseenter', () => {
                        card.style.borderColor = '#10B981';
                        card.style.boxShadow = '0 2px 4px rgba(16, 185, 129, 0.2)';
                    });
                    card.addEventListener('mouseleave', () => {
                        card.style.borderColor = '#E7E5E4';
                        card.style.boxShadow = '0 1px 2px rgba(0,0,0,0.08)';
                    });
                });

            } catch (error) {
                console.error('Userscript error:', error);
            }
        }

        // Enhance dropdown with balance info whenever it's visible and has bank accounts
        if (fundingSourceOptions) {
            try {
                // Look for ALL open dropdowns and check each one
                const allOpenDropdowns = document.querySelectorAll('.options.open');

                allOpenDropdowns.forEach((dropdownOptions) => {
                    // Only process dropdowns that have fluz-badges (funding source dropdowns)
                    const allBadges = dropdownOptions.querySelectorAll('.fluz-badges');

                    if (allBadges.length === 0) {
                        return; // Not a funding source dropdown
                    }

                    // Check if any bank account options exist and haven't been enhanced yet
                    const unenhancedBankAccounts = dropdownOptions.querySelectorAll('.option .fluz-badges .title');

                    const hasUnenhanced = Array.from(unenhancedBankAccounts).some(badge => {
                        const isNoFee = badge.textContent.trim() === 'NO FEE';
                        const hasBalanceInfo = badge.closest('.option').querySelector('.fluz-balance-info');
                        return isNoFee && !hasBalanceInfo;
                    });

                    if (hasUnenhanced) {
                        enhanceDropdownWithBalances(fundingSourceOptions);
                    }
                });
            } catch (error) {
                console.error('Userscript dropdown enhancement error:', error);
            }
        }
    }, 1000); // Check every 1s
})();
