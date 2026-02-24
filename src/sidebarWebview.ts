// Sidebar webview script for VS Code native sidebar
// This renders the variable list in the VS Code sidebar panel

interface VSCodeApi {
    postMessage(data: any): void;
}

declare function acquireVsCodeApi(): VSCodeApi;
const vscode = acquireVsCodeApi();

// State
let variableConfig: Record<string, { color: string; visablename: string }> = {};
let variableMap: Map<string, number[]> = new Map();

// Track the currently focused element to prevent re-render while editing
let focusedElementKey: string | null = null;

// Settings state
let settingsBaudRate: number = 115200;
let settingsAutoVariableUpdate: boolean = true;
let settingsDefaultScreen: 'plot' | 'raw' = 'plot';
let settingsDefaultSidebarVisible: boolean = true;

// Get the root element
const root = document.getElementById("sidebar-root");

// Request current settings from extension on load
vscode.postMessage({ type: 'request-settings' });

// Convert any color format (rgb, rgba, hex, named) to hex for color input
function toHexColor(color: string): string {
    if (!color) return '#ffffff';
    
    // Already hex format
    if (color.startsWith('#')) {
        // Ensure it's 7 characters (#rrggbb)
        if (color.length === 4) {
            // Convert #rgb to #rrggbb
            return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
        }
        return color.slice(0, 7); // Strip alpha if present
    }
    
    // RGB/RGBA format
    const rgbMatch = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
        const r = parseInt(rgbMatch[1], 10);
        const g = parseInt(rgbMatch[2], 10);
        const b = parseInt(rgbMatch[3], 10);
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }
    
    // Named color - create a temporary element to compute the color
    try {
        const tempDiv = document.createElement('div');
        tempDiv.style.color = color;
        document.body.appendChild(tempDiv);
        const computed = getComputedStyle(tempDiv).color;
        document.body.removeChild(tempDiv);
        
        const match = computed.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (match) {
            const r = parseInt(match[1], 10);
            const g = parseInt(match[2], 10);
            const b = parseInt(match[3], 10);
            return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        }
    } catch (e) {
        // Fallback
    }
    
    return '#ffffff';
}

function render() {
    if (!root) return;

    // Check if we should do a partial update to preserve focus
    const currentFocusedKey = focusedElementKey;
    const currentFocusedElement = currentFocusedKey ? document.activeElement : null;
    const isColorInputFocused = currentFocusedElement?.classList?.contains('color-input');
    
    // If a color input is actively focused, only update values
    if (isColorInputFocused && currentFocusedKey) {
        updateValues();
        return;
    }

    const entries = Object.entries(variableConfig);
    
    root.innerHTML = `
        <div style="padding: 0.8rem; height: 100%;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="font-size: 1.1rem; font-weight: 600; color: var(--vscode-foreground);">Variables</span>
                    <span style="background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 0.7rem; padding: 0.1em 0.4em; border-radius: 8px;">${entries.length}</span>
                    <span style="background: #6b3a00; color: #ffa040; font-size: 0.65rem; font-weight: 600; padding: 0.1em 0.45em; border-radius: 8px; letter-spacing: 0.03em;">experimental</span>
                </div>
                <button id="reset-btn" title="Reset all variables" 
                    style="background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 4px; padding: 0.3em 0.6em; font-size: 0.8em; cursor: pointer;">
                    Reset
                </button>
            </div>
            <div style="font-size: 0.72rem; color: var(--vscode-descriptionForeground); margin-bottom: 0.75rem; padding: 0.4rem 0.6rem; background: var(--vscode-textBlockQuote-background); border-radius: 4px; border-left: 3px solid var(--vscode-textLink-foreground); line-height: 1.4;">
                Drag variables to the plot. If graph doesn't update, click on it once.
            </div>
            <ul style="list-style: none; padding: 0; margin: 0; overflow-y: auto;">
                ${entries.map(([key, val]) => {
                    const values = variableMap.get(key);
                    const currentValue = values?.slice(-1)[0] ?? "N/A";
                    const displayValue = typeof currentValue === 'number' ? currentValue.toFixed(3) : currentValue;
                    const hexColor = toHexColor(val.color);
                    return `
                        <li 
                            draggable="true"
                            data-variable-key="${key}"
                            class="variable-item"
                            style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem; padding: 0.5rem; border-radius: 4px; cursor: grab; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05); transition: all 0.15s;"
                        >
                            <span style="color: var(--vscode-descriptionForeground); font-size: 1em; user-select: none; opacity: 0.6;">⋮⋮</span>
                            <div style="display: flex; flex-direction: column; gap: 0.15rem; flex: 1; min-width: 0;">
                                <input type="text" value="${val.visablename || key}" data-key="${key}" class="visiblename-input"
                                    style="font-weight: 500; font-size: 0.9rem; color: ${val.color}; background: transparent; border: 1px solid transparent; border-radius: 3px; padding: 0.15rem 0.3rem; outline: none; width: 100%;"
                                />
                                <span style="color: var(--vscode-descriptionForeground); font-size: 0.7rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <span style="opacity: 0.6;">●</span> ${displayValue}
                                </span>
                            </div>
                            <input type="color" value="${hexColor}" data-key="${key}" class="color-input"
                                style="border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); cursor: pointer; width: 28px; height: 28px; padding: 2px; border-radius: 3px;"
                            />
                        </li>
                    `;
                }).join('')}
            </ul>
            ${entries.length === 0 ? `
                <div style="text-align: center; padding: 2rem; color: var(--vscode-descriptionForeground);">
                    <p style="margin: 0; font-size: 0.9rem;">No variables yet</p>
                    <p style="margin: 0.5rem 0 0 0; font-size: 0.8rem;">Connect to a serial port to see data</p>
                </div>
            ` : ''}
            <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 0.75rem 0;" />
            <button id="open-plotter-btn"
                style="width: 100%; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 0.5rem 0; font-size: 0.85rem; font-weight: 600; cursor: pointer; margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: center; gap: 0.4rem;">
                ▶ Open Serial Plotter
            </button>
            <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 0.75rem 0;" />
            <div style="font-size: 0.8rem; font-weight: 600; color: var(--vscode-foreground); margin-bottom: 0.5rem; opacity: 0.7;">Defaults</div>
            <div style="font-size: 0.75rem; color: var(--vscode-descriptionForeground); margin-bottom: 0.6rem; opacity: 0.8;">Applied when Serial Plotter opens</div>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <label style="font-size: 0.8rem; color: var(--vscode-foreground);">Baud Rate</label>
                    <select id="settings-baud" style="background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 3px; padding: 0.2rem 0.3rem; font-size: 0.8rem;">
                        ${[9600,14400,19200,38400,57600,115200,128000,256000,460800,921600].map(b =>
                            `<option value="${b}" ${settingsBaudRate === b ? 'selected' : ''}>${b}</option>`
                        ).join('')}
                    </select>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <label style="font-size: 0.8rem; color: var(--vscode-foreground);">Auto Variable Update</label>
                    <input type="checkbox" id="settings-auto-update" ${settingsAutoVariableUpdate ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;" />
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <label style="font-size: 0.8rem; color: var(--vscode-foreground);">Default Screen</label>
                    <select id="settings-screen" style="background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 3px; padding: 0.2rem 0.3rem; font-size: 0.8rem;">
                        <option value="plot" ${settingsDefaultScreen === 'plot' ? 'selected' : ''}>Graph</option>
                        <option value="raw" ${settingsDefaultScreen === 'raw' ? 'selected' : ''}>Serial Monitor</option>
                    </select>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <label style="font-size: 0.8rem; color: var(--vscode-foreground);">Show Sidebar</label>
                    <input type="checkbox" id="settings-sidebar-visible" ${settingsDefaultSidebarVisible ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;" />
                </div>
            </div>
            <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 0.75rem 0;" />
            <div style="text-align: center; padding: 0.5rem 0 0.25rem 0;">
                <div style="color: var(--vscode-descriptionForeground); font-size: 0.72rem; line-height: 1.6; opacity: 0.7;">
                    <div style="margin-bottom: 0.2rem;">${(window as any).__APP_VERSION__ || 'DEVELOPMENT'}</div>
                    <div>Made by <a href="https://muino.nl" target="_blank" rel="noopener noreferrer"
                        style="color: #4a7fc1; font-weight: 600; text-decoration: none;">Muino</a></div>
                </div>
            </div>
        </div>
    `;

    // Attach event listeners
    attachEventListeners();
}

// Update just the display values without full re-render (preserves input focus)
function updateValues() {
    document.querySelectorAll(".variable-item").forEach((item) => {
        const key = (item as HTMLElement).dataset.variableKey;
        if (key) {
            const values = variableMap.get(key);
            const currentValue = values?.slice(-1)[0] ?? "N/A";
            const displayValue = typeof currentValue === 'number' ? currentValue.toFixed(3) : currentValue;
            
            // Update the value display span (second span in the flex column)
            const valueSpan = item.querySelector("div > span:last-child");
            if (valueSpan) {
                valueSpan.innerHTML = `<span style="opacity: 0.6;">●</span> ${displayValue}`;
            }
        }
    });
}

function attachEventListeners() {
    // Reset button
    const resetBtn = document.getElementById("reset-btn");
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            vscode.postMessage({ type: "reset-buffer" });
        });
    }

    // Open Serial Plotter button
    const openPlotterBtn = document.getElementById("open-plotter-btn");
    if (openPlotterBtn) {
        openPlotterBtn.addEventListener("click", () => {
            vscode.postMessage({ type: "open-plotter" });
        });
    }

    // Drag start for variable items
    document.querySelectorAll(".variable-item").forEach((item) => {
        item.addEventListener("dragstart", (e: Event) => {
            const dragEvent = e as DragEvent;
            const target = dragEvent.currentTarget as HTMLElement;
            const key = target.dataset.variableKey;
            if (key && dragEvent.dataTransfer) {
                dragEvent.dataTransfer.effectAllowed = "copy";
                dragEvent.dataTransfer.setData("text/plain", key);
                dragEvent.dataTransfer.setData("application/x-variable-key", key);
                // Also notify extension for cross-webview drag support
                vscode.postMessage({ type: "drag-start", variableKey: key });
            }
        });

        // Hover effects
        item.addEventListener("mouseenter", (e) => {
            const target = e.currentTarget as HTMLElement;
            target.style.borderColor = "var(--vscode-focusBorder)";
            target.style.background = "rgba(0,0,0,0.4)";
            target.style.transform = "translateX(2px)";
        });
        item.addEventListener("mouseleave", (e) => {
            const target = e.currentTarget as HTMLElement;
            target.style.borderColor = "rgba(255,255,255,0.05)";
            target.style.background = "rgba(0,0,0,0.25)";
            target.style.transform = "translateX(0)";
        });
    });

    // Color input changes
    document.querySelectorAll(".color-input").forEach((input) => {
        input.addEventListener("input", (e) => {
            const target = e.target as HTMLInputElement;
            const key = target.dataset.key;
            if (key && variableConfig[key]) {
                variableConfig[key] = { ...variableConfig[key], color: target.value };
                // Update the name input color
                const nameInput = document.querySelector(`.visiblename-input[data-key="${key}"]`) as HTMLInputElement;
                if (nameInput) {
                    nameInput.style.color = target.value;
                }
                notifyConfigChanged();
            }
        });

        // Track focus to prevent re-render while color picker is open
        input.addEventListener("focus", (e) => {
            const target = e.target as HTMLInputElement;
            focusedElementKey = target.dataset.key || null;
        });
        input.addEventListener("blur", () => {
            focusedElementKey = null;
        });
    });

    // Settings controls
    const baudSelect = document.getElementById('settings-baud') as HTMLSelectElement;
    if (baudSelect) {
        baudSelect.addEventListener('change', () => {
            settingsBaudRate = parseInt(baudSelect.value, 10);
            saveSettings();
        });
    }
    const autoUpdateCheckbox = document.getElementById('settings-auto-update') as HTMLInputElement;
    if (autoUpdateCheckbox) {
        autoUpdateCheckbox.addEventListener('change', () => {
            settingsAutoVariableUpdate = autoUpdateCheckbox.checked;
            saveSettings();
        });
    }
    const screenSelect = document.getElementById('settings-screen') as HTMLSelectElement;
    if (screenSelect) {
        screenSelect.addEventListener('change', () => {
            settingsDefaultScreen = screenSelect.value as 'plot' | 'raw';
            saveSettings();
        });
    }
    const sidebarVisibleCheckbox = document.getElementById('settings-sidebar-visible') as HTMLInputElement;
    if (sidebarVisibleCheckbox) {
        sidebarVisibleCheckbox.addEventListener('change', () => {
            settingsDefaultSidebarVisible = sidebarVisibleCheckbox.checked;
            saveSettings();
        });
    }

    // Visible name changes
    document.querySelectorAll(".visiblename-input").forEach((input) => {
        input.addEventListener("change", (e) => {
            const target = e.target as HTMLInputElement;
            const key = target.dataset.key;
            const newName = target.value.trim();
            if (key && newName && variableConfig[key]) {
                variableConfig[key] = { ...variableConfig[key], visablename: newName };
                notifyConfigChanged();
            }
        });

        // Focus/blur effects
        input.addEventListener("focus", (e) => {
            const target = e.target as HTMLElement;
            target.style.borderColor = "var(--vscode-focusBorder)";
        });
        input.addEventListener("blur", (e) => {
            const target = e.target as HTMLElement;
            target.style.borderColor = "transparent";
        });
    });
}

function saveSettings() {
    vscode.postMessage({
        type: 'save-settings',
        defaultBaudRate: settingsBaudRate,
        autoVariableUpdateOnStart: settingsAutoVariableUpdate,
        defaultScreen: settingsDefaultScreen,
        defaultSidebarVisible: settingsDefaultSidebarVisible
    });
}

function notifyConfigChanged() {
    vscode.postMessage({
        type: "variable-config-changed",
        variableConfig: { ...variableConfig }
    });
}

// Listen for messages from the extension
window.addEventListener("message", (event) => {
    const message = event.data;
    
    switch (message.type) {
        case "variable-config-update":
            variableConfig = message.variableConfig || {};
            variableMap = new Map(message.variableMap || []);
            render();
            break;
        case "settings-response":
            settingsBaudRate = message.defaultBaudRate ?? 115200;
            settingsAutoVariableUpdate = message.autoVariableUpdateOnStart ?? true;
            settingsDefaultScreen = message.defaultScreen ?? 'plot';
            settingsDefaultSidebarVisible = message.defaultSidebarVisible ?? true;
            render();
            break;
    }
});

// Initial render
render();
