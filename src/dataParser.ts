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
	
	// Advanced Parsing Logic
	// 1. Tokenize by whitespace, commas, semicolons
	const tokens = line.split(/[ \t,;]+/).filter(Boolean);
	
	for (let i = 0; i < tokens.length; i++) {
		let token = tokens[i];
		
		// Case A: key:value (no space)
		if (token.includes(':') && !token.endsWith(':') && !token.startsWith(':')) {
			const idx = token.indexOf(':');
			let key = token.substring(0, idx);
			let valStr = token.substring(idx + 1);
			
			// Clean wrappers
			key = key.replace(/^['"(\[{]+|['")\]}]+$/g, "");
			valStr = valStr.replace(/^['"(\[{]+|['")\]}]+$/g, "");
			
			const val = parseFloat(valStr);
			if (!isNaN(val)) {
				results.push({ name: key, value: val });
			}
			continue;
		}

		// Case B: key: value (colon at end of key)
		if (token.endsWith(':') && token.length > 1) {
			if (i + 1 < tokens.length) {
				let key = token.substring(0, token.length - 1);
				let valStr = tokens[i+1];
				
				// Clean wrappers
				key = key.replace(/^['"(\[{]+|['")\]}]+$/g, "");
				valStr = valStr.replace(/^['"(\[{]+|['")\]}]+$/g, "");
				
				const val = parseFloat(valStr);
				if (!isNaN(val)) {
					results.push({ name: key, value: val });
					i++; // Consume value
					continue;
				}
			}
		}

		// Case C: key : value (colon is separate token)
		if (i + 2 < tokens.length && tokens[i+1] === ':') {
			 let key = token;
			 let valStr = tokens[i+2];
			 
			 // Clean wrappers
			 key = key.replace(/^['"(\[{]+|['")\]}]+$/g, "");
			 valStr = valStr.replace(/^['"(\[{]+|['")\]}]+$/g, "");
			 
			 const val = parseFloat(valStr);
			 if (!isNaN(val)) {
				 results.push({ name: key, value: val });
				 i += 2; // Consume colon and value
				 continue;
			 }
		}

		// Case D: key value (implicit, no colon)
		if (i + 1 < tokens.length) {
			let key = token;
			let valStr = tokens[i+1];
			
			// Clean wrappers
			key = key.replace(/^['"(\[{]+|['")\]}]+$/g, "");
			valStr = valStr.replace(/^['"(\[{]+|['")\]}]+$/g, "");
			
			// Check if key is NOT a number (to avoid "123 456" being parsed as key=123)
			if (isNaN(parseFloat(key))) {
				const val = parseFloat(valStr);
				if (!isNaN(val)) {
					results.push({ name: key, value: val });
					i++; // Consume value
					continue;
				}
			}
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
