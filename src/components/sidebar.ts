
import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";
import { customElement } from "lit/decorators.js";

@customElement("sidebar-view")
export class SidebarView extends LitElement {

  @property({ type: Map })
  variableMap: Map<string, number[]> = new Map();

  // Store variable config (name -> { color, visablename })
  @property({ type: Object })
  variableConfig: Record<string, { color: string; visablename: string }> = {};

  setVariableConfig(config: Record<string, { color: string; visablename: string }>) {
    this.variableConfig = { ...config };
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent('variable-config-changed', {
      detail: this.getVariableConfig(),
      bubbles: true,
      composed: true
    }));
  }

  setVariableMap(variableMap: Map<string, number[]>) {
    this.variableMap = variableMap;
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent('variable-map-changed', {
      detail: Array.from(variableMap.entries()),
      bubbles: true,
      composed: true
    }));
  }

  getVariableConfig(): Record<string, { color: string; visablename: string }> {   
    return { ...this.variableConfig };
  }

  render() {
    return html`
      <div style="padding: 1rem; border: 1px solid #aaa; border-radius: 6px; background: #232323;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
          <span style="font-size: 1.25rem; font-weight: 600; color: #e0e0e0;">Variables</span>
          <button @click="${this.handleReset.bind(this)}" title="Reset variables" style="background: #2a2a2a; color: #e0e0e0; border: 1px solid #888; border-radius: 4px; padding: 0.2em 0.9em; font-size: 1em; cursor: pointer;">Reset</button>
        </div>
        <div style="font-size: 0.85rem; color: #888; margin-bottom: 0.75rem; padding: 0.4rem 0.6rem; background: #1a1a1a; border-radius: 4px; border-left: 3px solid #666;">
          💡 Drag variables to graph to visualize
        </div>
        <ul style="list-style: none; padding: 0; margin: 0;">
          ${Object.entries(this.variableConfig).map(([key, val]) => {
            const currentValue = this.variableMap.get(key)?.slice(-1)[0] ?? "N/A";
            return html`
              <li 
                draggable="true"
                @dragstart="${(e: DragEvent) => this.handleDragStart(e, key)}"
                style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem; justify-content: space-between; cursor: grab; padding: 0.3rem; border-radius: 4px; transition: background 0.2s, border 0.2s; border: 1px dashed transparent;"
                @mouseenter="${(e: MouseEvent) => {
                  (e.currentTarget as HTMLElement).style.background = '#2a2a2a';
                  (e.currentTarget as HTMLElement).style.borderColor = '#666';
                }}"
                @mouseleave="${(e: MouseEvent) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
                }}"
              >
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <span style="color: #888; font-size: 1.2em; user-select: none;">⋮⋮</span>
                  <input type="text" value="${val.visablename || key}" @change="${(e: Event) => this.handleVisiblenameChange(e, key)}" style="width: 50px; font-weight: 600; color: ${val.color}; background: #232323; border: 1px solid #888; border-radius: 4px; padding: 2px 6px;" />
                  <span style="color: #aaa;">Current: ${currentValue}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem; min-width: 40px; justify-content: flex-end;">
                  <input type="color" value="${val.color}" @input="${(e: Event) => this.handleColorChange(e, key)}" style="border: none; background: none; cursor: pointer; width: 32px; height: 28px; padding: 0;">
                  <button @click="${() => this.handleDeleteVariable(key)}" title="Delete variable" style="background: #3a2323; color: #e57373; border: none; border-radius: 4px; padding: 0 8px; font-size: 1.1em; cursor: pointer; height: 28px;">✕</button>
                </div>
              </li>
            `;
          })}
        </ul>
      </div>
    `;
  }

  private handleReset() {
    this.variableConfig = {};
    this.variableMap = new Map();
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent('variable-config-changed', {
      detail: this.getVariableConfig(),
      bubbles: true,
      composed: true
    }));
    this.dispatchEvent(new CustomEvent('variable-map-changed', {
      detail: Array.from(this.variableMap.entries()),
      bubbles: true,
      composed: true
    }));
  }

  private handleDeleteVariable(key: string) {
    // Remove from variableConfig
    const { [key]: _, ...rest } = this.variableConfig;
    this.variableConfig = rest;
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent('variable-config-changed', {
      detail: this.getVariableConfig(),
      bubbles: true,
      composed: true
    }));
  }

  private handleDragStart(e: DragEvent, key: string) {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', key);
      e.dataTransfer.setData('application/x-variable-key', key);
    }
  }
  

  private handleVisiblenameChange(e: Event, key: string) {
    const input = e.target as HTMLInputElement;
    const newVisiblename = input.value.trim();
    if (!newVisiblename) return;
    this.variableConfig[key] = { ...this.variableConfig[key], visablename: newVisiblename };
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent('variable-config-changed', {
      detail: this.getVariableConfig(),
      bubbles: true,
      composed: true
    }));
  }
       

  private handleColorChange(e: Event, key: string) {
    const input = e.target as HTMLInputElement;
    const newColor = input.value;
    this.variableConfig[key] = { ...this.variableConfig[key], color: newColor };
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent('variable-config-changed', {
      detail: this.getVariableConfig(),
      bubbles: true,
      composed: true
    }));
  }
}
