
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
      <div style="padding: 1.2rem; border: none; border-radius: 8px; background: linear-gradient(135deg, #1e1e1e 0%, #252525 100%); box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.3rem; font-weight: 700; color: #f0f0f0; letter-spacing: 0.02em;">Variables</span>
            <span style="background: #333; color: #aaa; font-size: 0.75rem; padding: 0.15em 0.5em; border-radius: 10px;">${Object.keys(this.variableConfig).length}</span>
          </div>
          <button @click="${this.handleReset.bind(this)}" title="Reset all variables" 
            style="background: linear-gradient(135deg, #2a2a2a 0%, #333 100%); color: #e0e0e0; border: 1px solid #555; border-radius: 5px; padding: 0.35em 0.8em; font-size: 0.9em; font-weight: 500; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"
            @mouseenter="${(e: MouseEvent) => {
              (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, #333 0%, #3a3a3a 100%)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
            }}"
            @mouseleave="${(e: MouseEvent) => {
              (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, #2a2a2a 0%, #333 100%)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            }}">
            Reset Buffer
          </button>
        </div>
        <div style="font-size: 0.82rem; color: #999; margin-bottom: 1rem; padding: 0.6rem 0.8rem; background: rgba(100, 150, 255, 0.08); border-radius: 6px; border-left: 3px solid #4a7fc1;">
          <span style="font-weight: 600;">Tip:</span> Drag variables to any graph to visualize
        </div>
        <ul style="list-style: none; padding: 0; margin: 0;">
          ${Object.entries(this.variableConfig).map(([key, val]) => {
            const currentValue = this.variableMap.get(key)?.slice(-1)[0] ?? "N/A";
            const displayValue = typeof currentValue === 'number' ? currentValue.toFixed(3) : currentValue;
            return html`
              <li 
                draggable="true"
                @dragstart="${(e: DragEvent) => this.handleDragStart(e, key)}"
                style="display: flex; align-items: center; gap: 0.8rem; margin-bottom: 0.6rem; justify-content: space-between; cursor: grab; padding: 0.6rem 0.7rem; border-radius: 6px; transition: all 0.2s; border: 1px solid transparent; background: rgba(255,255,255,0.02);"
                @mouseenter="${(e: MouseEvent) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                  (e.currentTarget as HTMLElement).style.borderColor = '#555';
                  (e.currentTarget as HTMLElement).style.transform = 'translateX(4px)';
                }}"
                @mouseleave="${(e: MouseEvent) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
                  (e.currentTarget as HTMLElement).style.transform = 'translateX(0)';
                }}"
              >
                <div style="display: flex; align-items: center; gap: 0.6rem; flex: 1; min-width: 0;">
                  <span style="color: #666; font-size: 1.1em; user-select: none; opacity: 0.7;">⋮⋮</span>
                  <div style="display: flex; flex-direction: column; gap: 0.2rem; flex: 1; min-width: 0;">
                    <input type="text" value="${val.visablename || key}" @change="${(e: Event) => this.handleVisiblenameChange(e, key)}" 
                      style="font-weight: 600; font-size: 0.95rem; color: ${val.color}; background: transparent; border: 1px solid transparent; border-radius: 4px; padding: 0.2rem 0.4rem; outline: none; transition: all 0.2s;"
                      @focus="${(e: FocusEvent) => (e.currentTarget as HTMLElement).style.borderColor = '#555'}"
                      @blur="${(e: FocusEvent) => (e.currentTarget as HTMLElement).style.borderColor = 'transparent'}"
                    />
                    <span style="color: #888; font-size: 0.75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      <span style="color: #666;">●</span> ${displayValue}
                    </span>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 0.6rem;">
                  <input type="color" value="${val.color}" @input="${(e: Event) => this.handleColorChange(e, key)}" 
                    style="border: 1px solid #555; background: #1a1a1a; cursor: pointer; width: 32px; height: 32px; padding: 2px; border-radius: 4px; transition: all 0.2s;"
                    @mouseenter="${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.borderColor = '#777'}"
                    @mouseleave="${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.borderColor = '#555'}"
                  />
                </div>
              </li>
            `;
          })}
        </ul>
        <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #333; text-align: center;">
          <div style="color: #666; font-size: 0.75rem; line-height: 1.4;">
            <div style="margin-bottom: 0.3rem;">v2.1.7</div>
            <div style="color: #888;">Made by <a href="https://muino.nl" target="_blank" rel="noopener noreferrer" style="color: #4a7fc1; font-weight: 600; text-decoration: none; transition: color 0.2s;" @mouseenter="${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = '#6a9fd1'}" @mouseleave="${(e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = '#4a7fc1'}">Muino</a></div>
          </div>
        </div>
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
