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
      <div>
        <span>Variables</span>
        <ul>
          ${Object.entries(this.variableConfig).map(
            ([key, val]) => html`<li><span style="color:${val.color}">${key}</span></li>`
          )}
        </ul>
      </div>
    `;
  }
}
