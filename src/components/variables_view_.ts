import { LitElement, html } from "lit";
import { property, customElement } from "lit/decorators.js";

@customElement("variables-view")
export class VariablesView extends LitElement {
  @property({ type: Object })
  data: Map<string, number[]> = new Map();

  createRenderRoot() {
    return this;
  }

  render() {
    const stats = Array.from(this.data.entries())
      .map(([key, values]) => {
        if (!values.length) return null;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const current = values[values.length - 1];
        return { key, min, max, current };
      })
      .filter((stat): stat is { key: string; min: number; max: number; current: number } => stat !== null);

    return html`
      <div style="margin-bottom: 0.5rem;">
        <table style="width: 100%; border-collapse: collapse; font-size: 1rem;">
          <thead>
            <tr style="background: #232323; color: #aaa;">
              <th style="padding: 0.3em 0.7em; border-bottom: 1px solid #444; text-align: left;">Variable</th>
              <th style="padding: 0.3em 0.7em; border-bottom: 1px solid #444; text-align: right;">Min</th>
              <th style="padding: 0.3em 0.7em; border-bottom: 1px solid #444; text-align: right;">Max</th>
              <th style="padding: 0.3em 0.7em; border-bottom: 1px solid #444; text-align: right;">Current</th>
            </tr>
          </thead>
          <tbody>
            ${stats.map(stat => html`
              <tr>
                <td style="padding: 0.3em 0.7em; font-weight: 600;">${stat.key}</td>
                <td style="padding: 0.3em 0.7em; text-align: right;">${stat.min}</td>
                <td style="padding: 0.3em 0.7em; text-align: right;">${stat.max}</td>
                <td style="padding: 0.3em 0.7em; text-align: right;">${stat.current}</td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    `;
  }
}
