import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";
import { customElement } from "lit/decorators.js";

@customElement("plot-screen")
export class PlotScreen extends LitElement {
  @property({ type: Map })
  data: Map<string, number[]> = new Map();

  render() {
    return html`
      <div>
        <canvas></canvas>
      </div>
    `;
  }
}
