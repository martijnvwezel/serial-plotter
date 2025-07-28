import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";
import { customElement } from "lit/decorators.js";

@customElement("sidebar-view")
export class SidebarView extends LitElement {

  @property({ type: Map })
  variableMap: Map<string, number[]> = new Map();

  // Store variable config (name -> { color })
  @property({ type: Object })
  variableConfig: Record<string, { color: string }> = {};

  setVariableConfig(config: Record<string, { color: string }>) {
    this.variableConfig = { ...config };
    // log this variable config
    // console.log("Variable Config:", this.variableConfig);
    this.requestUpdate();
  }

  getVariableConfig(): Record<string, { color: string }> {
    return { ...this.variableConfig };
  }

  render() {
    return html`
      <div style="padding: 1rem; border: 1px solid #aaa; border-radius: 6px; background: #232323;">
        <span style="font-size: 1.25rem; font-weight: 600; color: #e0e0e0;">Variables</span>
        <ul style="list-style: none; padding: 0; margin: 0;">
          ${Object.entries(this.variableConfig).map(([key, val]) => {
            const currentValue = this.variableMap.get(key)?.slice(-1)[0] ?? "N/A";
            return html`
              <li style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
                <span style="color: ${val.color}; font-weight: 600;">${key}</span>
                <span style="color: #aaa;">Current: ${currentValue}</span>
                <input type="color" value="${val.color}" @input="${(e: Event) => this.handleColorChange(e, key)}" style="border: none; background: none; cursor: pointer;">
              </li>
            `;
          })}
        </ul>
      </div>
    `;
  }

  private handleColorChange(e: Event, key: string) {
    const input = e.target as HTMLInputElement;
    const newColor = input.value;
    this.variableConfig[key] = { color: newColor };
    this.requestUpdate();
  }
}
