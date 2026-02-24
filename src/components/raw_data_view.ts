import { LitElement, html, css } from "lit";
import { property, query } from "lit/decorators.js";
import { customElement } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

// ANSI color code to CSS color mapping
const ANSI_COLORS: Record<number, string> = {
  30: '#000000', // Black
  31: '#cc0000', // Red
  32: '#00cc00', // Green
  33: '#cccc00', // Yellow
  34: '#0000cc', // Blue
  35: '#cc00cc', // Magenta
  36: '#00cccc', // Cyan
  37: '#cccccc', // White
  90: '#666666', // Bright Black (Gray)
  91: '#ff0000', // Bright Red
  92: '#00ff00', // Bright Green
  93: '#ffff00', // Bright Yellow
  94: '#0000ff', // Bright Blue
  95: '#ff00ff', // Bright Magenta
  96: '#00ffff', // Bright Cyan
  97: '#ffffff', // Bright White
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: '#000000', // Black
  41: '#cc0000', // Red
  42: '#00cc00', // Green
  43: '#cccc00', // Yellow
  44: '#0000cc', // Blue
  45: '#cc00cc', // Magenta
  46: '#00cccc', // Cyan
  47: '#cccccc', // White
  100: '#666666', // Bright Black
  101: '#ff0000', // Bright Red
  102: '#00ff00', // Bright Green
  103: '#ffff00', // Bright Yellow
  104: '#0000ff', // Bright Blue
  105: '#ff00ff', // Bright Magenta
  106: '#00ffff', // Bright Cyan
  107: '#ffffff', // Bright White
};

function parseAnsiToHtml(text: string): string {
  // Escape HTML entities first
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Match ANSI escape sequences: ESC[ followed by params and 'm'
  // ESC can be \x1b, \033, or \e
  const ansiRegex = /\x1b\[([0-9;]*)m/g;
  
  let result = '';
  let lastIndex = 0;
  let openSpans = 0;
  let match;
  
  while ((match = ansiRegex.exec(escaped)) !== null) {
    // Add text before this escape sequence
    result += escaped.slice(lastIndex, match.index);
    lastIndex = match.index + match[0].length;
    
    const codes = match[1].split(';').map(c => parseInt(c, 10) || 0);
    
    // Process codes
    let styles: string[] = [];
    let shouldReset = false;
    
    for (const code of codes) {
      if (code === 0) {
        shouldReset = true;
      } else if (code === 1) {
        styles.push('font-weight:bold');
      } else if (code === 3) {
        styles.push('font-style:italic');
      } else if (code === 4) {
        styles.push('text-decoration:underline');
      } else if (ANSI_COLORS[code]) {
        styles.push(`color:${ANSI_COLORS[code]}`);
      } else if (ANSI_BG_COLORS[code]) {
        styles.push(`background-color:${ANSI_BG_COLORS[code]}`);
      }
    }
    
    // Close previous spans if reset
    if (shouldReset) {
      while (openSpans > 0) {
        result += '</span>';
        openSpans--;
      }
    }
    
    // Open new span if we have styles
    if (styles.length > 0) {
      result += `<span style="${styles.join(';')}">`;
      openSpans++;
    }
  }
  
  // Add remaining text
  result += escaped.slice(lastIndex);
  
  // Close any remaining open spans
  while (openSpans > 0) {
    result += '</span>';
    openSpans--;
  }
  
  return result;
}

@customElement("raw-data-view")
export class RawDataView extends LitElement {
  static styles = css`
    @import url('./raw_data_view.css');
  `;

  private _lineBuffer: string[] = [];
  private _isProcessing = false;

  @property({ type: Boolean })
  autoScrollEnabled = true;

  @property({ type: Boolean })
  hideData = false;
  
  @property({ type: Boolean })
  showTimestamp = true;

  @query('.raw-data-pre')
  private preElement!: HTMLPreElement;

  public addLine(lines: string | string[]) {
    
    
    if (Array.isArray(lines)) {
      this._lineBuffer.push(...lines);
    } else {
      this._lineBuffer.push(lines);
    }
    this.requestUpdate();
    // Ensure scroll is at the bottom after DOM updates, even with high-frequency data
    this.updateComplete.then(() => {
      if (this.autoScrollEnabled && this.preElement) {
        this.preElement.scrollTop = this.preElement.scrollHeight;
      }
    });
  }

  @property({ type: Array })
  get lineBuffer() {
    return this._lineBuffer;
  }

  set lineBuffer(val: string[]) {
    // For large buffers, show loading state briefly
    if (val.length > 5000 && this._lineBuffer.length === 0) {
      this._isProcessing = true;
      this.requestUpdate();
      
      // Process in next frame to show loading indicator
      requestAnimationFrame(() => {
        this._lineBuffer = val;
        this._isProcessing = false;
        this.requestUpdate();
        this.updateComplete.then(() => {
          if (this.autoScrollEnabled && this.preElement) {
            this.preElement.scrollTop = this.preElement.scrollHeight;
          }
        });
      });
    } else {
      this._lineBuffer = val;
      this.requestUpdate();
      this.updateComplete.then(() => {
        if (this.autoScrollEnabled && this.preElement) {
          this.preElement.scrollTop = this.preElement.scrollHeight;
        }
      });
    }
  }

  handlePauseAutoScroll(e: Event) {
    this.autoScrollEnabled = (e.target as HTMLInputElement).checked;
  }

  handleHideShowData(e: Event) {
    this.hideData = (e.target as HTMLInputElement).checked;
  }
  
  handleToggleTimestamp(e: Event) {
    this.showTimestamp = (e.target as HTMLInputElement).checked;
  }

  handleClearRaw() {
    console.log("Clearing raw data");
    
    this._lineBuffer = [];
    this.requestUpdate();
    
    // Dispatch event to notify parent component to clear its buffer too
    this.dispatchEvent(new CustomEvent('clear-buffer', {
      bubbles: true,
      composed: true
    }));
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('_lineBuffer') && this.autoScrollEnabled && this.preElement) {
      this.preElement.scrollTop = this.preElement.scrollHeight;
    }
  }

  render() {
    // Show loading state for large buffers
    if (this._isProcessing) {
      return html`
        <div id="root" class="raw-data-root">
          <div class="raw-data-container">
            <div style="display: flex; align-items: center; justify-content: center; height: 60vh; flex-direction: column; gap: 1rem;">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2">
                <circle cx="12" cy="12" r="10" opacity="0.25"/>
                <path d="M12 2 A10 10 0 0 1 22 12" opacity="1">
                  <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                </path>
              </svg>
              <span style="color: #aaa; font-size: 1.1rem;">Loading serial data...</span>
            </div>
          </div>
        </div>
      `;
    }
    
    // Process lines to optionally remove timestamps (optimized)
    // For performance, limit display to last 10000 lines
    const MAX_DISPLAY_LINES = 10000;
    let linesToDisplay = this._lineBuffer.length > MAX_DISPLAY_LINES 
      ? this._lineBuffer.slice(-MAX_DISPLAY_LINES) 
      : this._lineBuffer;
    
    let displayText: string;
    
    if (linesToDisplay.length === 0) {
      displayText = 'connection...';
    } else if (!this.showTimestamp) {
      // Optimized: process only when needed and use efficient string operations
      displayText = linesToDisplay.map(line => 
        line.replace(/^\[[^\]]+\]\s*/, '')
      ).join("\n");
    } else {
      // Most efficient: just join without processing
      displayText = linesToDisplay.join("\n");
    }
    
    // Add indicator if lines were truncated
    if (this._lineBuffer.length > MAX_DISPLAY_LINES) {
      displayText = `... (showing last ${MAX_DISPLAY_LINES} of ${this._lineBuffer.length} lines)\n${displayText}`;
    }
    
    return html`
      <div id="root" class="raw-data-root">
        <div class="raw-data-container">
          <!-- Header and controls row -->
          <div class="raw-data-controls-row">
            <span class="raw-data-title">Raw</span>
            <label>
              <input id="autoscroll" type="checkbox" @change=${this.handlePauseAutoScroll} .checked=${this.autoScrollEnabled} /> Auto-scroll
            </label>
            <label>
              <input id="hidedata" type="checkbox" @change=${this.handleHideShowData} .checked=${this.hideData} /> Hide data lines
            </label>
            <label>
              <input id="showtimestamp" type="checkbox" @change=${this.handleToggleTimestamp} .checked=${this.showTimestamp} /> Show timestamp
            </label>
            <button id="clearraw" class="button" @click=${this.handleClearRaw}>
              Clear
            </button>
          </div>
          <!-- Raw data view row -->
          <div class="raw-data-view-row" style="height: 60vh; min-height: 200px; max-height: 60vh;">
            <pre class="raw-data-pre" style="height: 100%; max-height: 100%; overflow: auto; background: transparent;">
              <code id="raw">${unsafeHTML('\n' + parseAnsiToHtml(displayText))}</code>
            </pre>
          </div>
        </div>
      </div>
    `;

  }
}
