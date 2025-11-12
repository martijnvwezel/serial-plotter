/**
 * Parse a data line and extract key-value pairs
 * Handles formats like: {key1: value1, key2: value2, ...}
 */
export interface ParsedVariable {
	name: string;
	value: number;
}

export function parseDataLine(line: string): ParsedVariable[] {
	const results: ParsedVariable[] = [];
	
	// Remove timestamp at the start [HH:MM:SS.mmm]
	line = line.replace(/^\[[^\]]+\]\s*/, "");
	// Remove newlines
	line = line.replace(/[\r\n]+/g, "");
	
	// Skip header lines
	if (line.match(/header\b/i)) {
		return results;
	}
	
	// Skip empty or "Connecting" lines
	if (!line.trim() || line.includes('Connecting')) {
		return results;
	}
	
	// Remove curly braces from the entire line
	line = line.replace(/[{}]/g, '');
	
	// Split by common delimiters, but keep key:value pairs together
	// Match pattern: key: value (with optional whitespace)
	const keyValueRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([+-]?(?:\d+\.?\d*|\d*\.\d+)(?:[eE][+-]?\d+)?)/g;
	let match;
	
	while ((match = keyValueRegex.exec(line)) !== null) {
		const key = match[1].trim();
		const value = parseFloat(match[2]);
		
		if (key && !isNaN(value)) {
			results.push({
				name: key,
				value: value
			});
		}
	}
	
	return results;
}

/**
 * Extract unique variable names from parsed data
 */
export function extractVariableNames(parsedData: ParsedVariable[][]): string[] {
	const nameSet = new Set<string>();
	
	parsedData.forEach(lineData => {
		lineData.forEach(variable => {
			nameSet.add(variable.name);
		});
	});
	
	return Array.from(nameSet);
}
