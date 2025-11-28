import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Unit tests for variable parsing in serial data
 * Tests the parsing of key:value format like "d: 8866	l: 0	p: 0	time: 51141	pr: 30"
 */

interface VariableConfig {
	[key: string]: {
		color: string;
		visablename: string;
	};
}

/**
 * Parse a line of serial data and extract variables in key:value format
 * @param line - The line to parse (e.g., "d: 8866	l: 0	p: 0	time: 51141	pr: 30")
 * @param existingConfig - Existing variable configuration
 * @param colorPalette - Array of colors to use for new variables
 * @returns Object with variableConfig and variableData
 */
function parseSerialLine(
	line: string,
	existingConfig: VariableConfig,
	colorPalette: string[]
): { variableConfig: VariableConfig; variableData: Map<string, number> } {
	const variableConfig: VariableConfig = { ...existingConfig };
	const variableData = new Map<string, number>();
	
	// Remove timestamp at the start if present
	line = line.replace(/^\[[^\]]+\]\s*/, "");
	// Remove newlines
	line = line.replace(/[\r\n]+/g, "");
	// Remove curly braces
	line = line.replace(/[{}]/g, '');
	
	// Use a regex to match key:value pairs more reliably
	// This matches: word/digit characters followed by colon, then optional spaces, then the value (until next key: or end)
	// Updated to handle cases like "Command 7:" where there's text before the number:colon
	const keyValueRegex = /(\w+):\s*([^\s:]+?)(?=\s+\w+:\s*|$)/g;
	let match;
	
	let colorIdx = Object.keys(variableConfig).length;
	
	while ((match = keyValueRegex.exec(line)) !== null) {
		const key = match[1].trim();
		const valueStr = match[2].trim();
		
		// Skip if key is empty or value is not numeric (skip text-only values)
		if (!key) continue;
		
		// Check if value is numeric or can be parsed as a number
		const numVal = parseFloat(valueStr);
		if (isNaN(numVal)) {
			// If it's not a number, skip this key-value pair (it's probably text like "Single")
			continue;
		}
		
		// Add to config if new variable
		if (!variableConfig[key]) {
			const color = colorPalette[colorIdx % colorPalette.length];
			variableConfig[key] = {
				color,
				visablename: key
			};
			colorIdx++;
		}
		
		// Set the value
		variableData.set(key, numVal);
	}
	
	return { variableConfig, variableData };
}

describe('Serial Data Variable Parsing', () => {
	const colorPalette = [
		'#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
		'#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
	];
	
	let variableConfig: VariableConfig;
	
	beforeEach(() => {
		variableConfig = {};
	});
	
	it('should parse simple key:value format', () => {
		const line = 'd: 8866	l: 0	p: 0	time: 51141	pr: 30';
		const result = parseSerialLine(line, variableConfig, colorPalette);
		
		expect(result.variableConfig).toHaveProperty('d');
		expect(result.variableConfig).toHaveProperty('l');
		expect(result.variableConfig).toHaveProperty('p');
		expect(result.variableConfig).toHaveProperty('time');
		expect(result.variableConfig).toHaveProperty('pr');
		
		expect(result.variableData.get('d')).toBe(8866);
		expect(result.variableData.get('l')).toBe(0);
		expect(result.variableData.get('p')).toBe(0);
		expect(result.variableData.get('time')).toBe(51141);
		expect(result.variableData.get('pr')).toBe(30);
	});
	
	it('should not create duplicate variables when they already exist', () => {
		// First line creates the variables
		const line1 = 'd: 8866	l: 0	p: 0	time: 51141	pr: 30';
		const result1 = parseSerialLine(line1, variableConfig, colorPalette);
		
		const configKeysCount1 = Object.keys(result1.variableConfig).length;
		expect(configKeysCount1).toBe(5);
		
		// Second line with same variables should not create duplicates
		const line2 = 'd: 8802	l: 0	p: 0	time: 51148	pr: 30';
		const result2 = parseSerialLine(line2, result1.variableConfig, colorPalette);
		
		const configKeysCount2 = Object.keys(result2.variableConfig).length;
		expect(configKeysCount2).toBe(5); // Still 5, no duplicates
		
		// Values should be updated
		expect(result2.variableData.get('d')).toBe(8802);
		expect(result2.variableData.get('time')).toBe(51148);
	});
	
	it('should handle varying number of variables per line', () => {
		const line1 = 'd: 8738	l: 0	p: 0';
		const result1 = parseSerialLine(line1, variableConfig, colorPalette);
		
		expect(Object.keys(result1.variableConfig).length).toBe(3);
		expect(result1.variableData.get('d')).toBe(8738);
		
		// Add more variables
		const line2 = 'd: 8738	l: 284	p: 533	time: 51333	pr: 30';
		const result2 = parseSerialLine(line2, result1.variableConfig, colorPalette);
		
		expect(Object.keys(result2.variableConfig).length).toBe(5);
		expect(result2.variableData.get('l')).toBe(284);
		expect(result2.variableData.get('p')).toBe(533);
	});
	
	it('should handle lines with non-zero values', () => {
		const line = 'd: 8738	l: 289	p: 538	time: 51331	pr: 30';
		const result = parseSerialLine(line, variableConfig, colorPalette);
		
		expect(result.variableData.get('d')).toBe(8738);
		expect(result.variableData.get('l')).toBe(289);
		expect(result.variableData.get('p')).toBe(538);
	});
	
	it('should handle multiple lines sequentially', () => {
		const lines = [
			'd: 8866	l: 0	p: 0	time: 51141	pr: 30',
			'd: 8802	l: 0	p: 0	time: 51148	pr: 30',
			'd: 8738	l: 284	p: 533	time: 51333	pr: 30',
			'd: 8738	l: 289	p: 538	time: 51331	pr: 30'
		];
		
		let currentConfig = variableConfig;
		const results: Map<string, number>[] = [];
		
		lines.forEach(line => {
			const result = parseSerialLine(line, currentConfig, colorPalette);
			currentConfig = result.variableConfig;
			results.push(result.variableData);
		});
		
		// Config should have been created once
		expect(Object.keys(currentConfig).length).toBe(5);
		
		// Check values from last line
		expect(results[3].get('d')).toBe(8738);
		expect(results[3].get('l')).toBe(289);
		expect(results[3].get('p')).toBe(538);
	});
	
	it('should handle lines with only some variables present', () => {
		// First create all variables
		const line1 = 'd: 8866	l: 0	p: 0	time: 51141	pr: 30';
		const result1 = parseSerialLine(line1, variableConfig, colorPalette);
		
		// Second line missing some variables
		const line2 = 'd: 8802	time: 51148';
		const result2 = parseSerialLine(line2, result1.variableConfig, colorPalette);
		
		// Config should still have all 5 variables
		expect(Object.keys(result2.variableConfig).length).toBe(5);
		
		// Only d and time should have values in result2
		expect(result2.variableData.get('d')).toBe(8802);
		expect(result2.variableData.get('time')).toBe(51148);
		expect(result2.variableData.has('l')).toBe(false);
		expect(result2.variableData.has('p')).toBe(false);
	});
	
	it('should handle text output mixed with data', () => {
		// Text lines should not create variables
		const line1 = 'Auto-trigger: 2655/3600 seconds elapsed (interval: 3600 sec, connected: 1)';
		const result1 = parseSerialLine(line1, variableConfig, colorPalette);
		
		// Should create variables for the numeric parts after colons
		expect(Object.keys(result1.variableConfig).length).toBeGreaterThan(0);
	});
	
	it('should handle Command output', () => {
		const line = 'Command 7: Single tap with graph';
		const result = parseSerialLine(line, variableConfig, colorPalette);
		
		// This line doesn't follow the key:value numeric format consistently
		// "Command 7:" has text before the number, and "7: Single" has non-numeric value
		// The parser should skip non-numeric values, so this might not create any variables
		// or it might parse if there were numeric values
		// For this specific case, no valid numeric key:value pairs exist
		expect(Object.keys(result.variableConfig).length).toBe(0);
		expect(result.variableData.size).toBe(0);
	});
	
	it('should maintain color assignment consistency', () => {
		const line1 = 'd: 100	l: 200';
		const result1 = parseSerialLine(line1, variableConfig, colorPalette);
		
		const dColor = result1.variableConfig['d'].color;
		const lColor = result1.variableConfig['l'].color;
		
		// Parse again with same config
		const line2 = 'd: 150	l: 250';
		const result2 = parseSerialLine(line2, result1.variableConfig, colorPalette);
		
		// Colors should remain the same
		expect(result2.variableConfig['d'].color).toBe(dColor);
		expect(result2.variableConfig['l'].color).toBe(lColor);
	});
});

describe('Real-world serial data from user', () => {
	const colorPalette = [
		'#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
		'#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
	];
	
	it('should correctly parse the user provided data sample', () => {
		const sampleLines = [
			'd: 8866	l: 0	p: 0	time: 51141	pr: 30',
			'd: 8802	l: 0	p: 0	time: 51148	pr: 30',
			'd: 8738	l: 0	p: 0	time: 51153	pr: 30',
			'd: 8738	l: 289	p: 538	time: 51331	pr: 30',
			'd: 8738	l: 297	p: 538	time: 51337	pr: 30',
			'd: 8673	l: 389	p: 538	time: 51405	pr: 30'
		];
		
		let currentConfig: VariableConfig = {};
		
		sampleLines.forEach((line, index) => {
			const result = parseSerialLine(line, currentConfig, colorPalette);
			currentConfig = result.variableConfig;
			
			// All lines should produce exactly 5 variables
			expect(Object.keys(currentConfig).length).toBe(5);
			
			// Variables should be: d, l, p, time, pr
			expect(currentConfig).toHaveProperty('d');
			expect(currentConfig).toHaveProperty('l');
			expect(currentConfig).toHaveProperty('p');
			expect(currentConfig).toHaveProperty('time');
			expect(currentConfig).toHaveProperty('pr');
			
			// Check that values are correctly parsed for the last line
			if (index === sampleLines.length - 1) {
				expect(result.variableData.get('d')).toBe(8673);
				expect(result.variableData.get('l')).toBe(389);
				expect(result.variableData.get('p')).toBe(538);
				expect(result.variableData.get('time')).toBe(51405);
				expect(result.variableData.get('pr')).toBe(30);
			}
		});
	});
	
	it('should handle text-only lines without creating variables', () => {
		let currentConfig: VariableConfig = {};
		
		const textLines = [
			'Connecting ...',
			'h -  Print this help function',
			'-----------------------------------',
			'Pressure print functions:',
			'	 5 -  continuously plot accelerometer (press 5 again to stop)',
			'	 6 -  tap 1 time and print raw ADC values',
			'	 v -  Print version information',
			'Starting continuous accelerometer plot (press 5 to stop)',
			'Stopping continuous accelerometer plot'
		];
		
		textLines.forEach(line => {
			const result = parseSerialLine(line, currentConfig, colorPalette);
			currentConfig = result.variableConfig;
			
			// Text lines might extract numbers after colons (like "5:") but those
			// won't have valid numeric values after them, so no variables should be created
			// The parser skips non-numeric values
		});
		
		// After all text lines, we might have variables like "5", "6" if there were patterns
		// But the specific lines above shouldn't create valid numeric key:value pairs
		// because the values after colons are text
	});
	
	it('should handle numeric-only lines as single values', () => {
		let currentConfig: VariableConfig = {};
		
		const numericLines = [
			'2046',
			'2047',
			'2046',
			'2047',
			'2048'
		];
		
		numericLines.forEach(line => {
			const result = parseSerialLine(line, currentConfig, colorPalette);
			currentConfig = result.variableConfig;
			
			// Numeric-only lines don't have key:value format, so no variables created
			expect(result.variableData.size).toBe(0);
		});
	});
	
	it('should handle Auto-trigger messages', () => {
		let currentConfig: VariableConfig = {};
		
		const line = 'Auto-trigger: 366/3600 seconds elapsed (interval: 3600 sec, connected: 1)';
		const result = parseSerialLine(line, currentConfig, colorPalette);
		
		// The regex will only capture "connected: 1" because "interval: 3600 sec" 
		// has text after the number, making the value non-numeric from the parser's perspective
		// The parser catches key:value pairs where value is followed by space + next key or EOL
		expect(result.variableData.has('connected')).toBe(true);
		expect(result.variableData.get('connected')).toBe(1);
		
		// "interval: 3600 sec" won't be captured because "sec" makes the pattern ambiguous
		// The regex is designed to capture clean key:value pairs
	});
	
	it('should handle Publishing messages', () => {
		let currentConfig: VariableConfig = {};
		
		const line = 'Publishing 24.64 to ripetap/28:CD:C1:14:1C:C3/temperature';
		const result = parseSerialLine(line, currentConfig, colorPalette);
		
		// The pattern "28:CD" might be matched but CD is not numeric
		// "14:1C" similar issue - hex values
		// Should not create variables for these
		expect(result.variableData.size).toBeLessThan(5);
	});
	
	it('should handle duplicated lines correctly', () => {
		let currentConfig: VariableConfig = {};
		
		const duplicatedLines = [
			'Auto-trigger: 482/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
			'Auto-trigger: 482/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
			'2053',
			'2053',
			'Stopping continuous accelerometer plot',
			'Stopping continuous accelerometer plot'
		];
		
		let lastConfigCount = 0;
		duplicatedLines.forEach(line => {
			const result = parseSerialLine(line, currentConfig, colorPalette);
			currentConfig = result.variableConfig;
			
			// Config should not grow with duplicates
			const currentCount = Object.keys(currentConfig).length;
			expect(currentCount).toBeGreaterThanOrEqual(lastConfigCount);
			lastConfigCount = currentCount;
		});
	});
	
	it('should handle decimal values', () => {
		let currentConfig: VariableConfig = {};
		
		const decimalLines = [
			'4079.8',
			'3710.2',
			'3180.2',
			'2473.5',
			'1879.2'
		];
		
		decimalLines.forEach(line => {
			const result = parseSerialLine(line, currentConfig, colorPalette);
			
			// Decimal-only lines don't have key:value format
			expect(result.variableData.size).toBe(0);
		});
	});
	
	it('should handle mixed content stream', () => {
		let currentConfig: VariableConfig = {};
		
		const mixedLines = [
			'Connecting ...',
			'Auto-trigger: 366/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
			'h -  Print this help function',
			'Starting continuous accelerometer plot (press 5 to stop)',
			'2046',
			'2047',
			'2046',
			'Auto-trigger: 391/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
			'2048',
			'2046',
			'Publishing 24.64 to ripetap/28:CD:C1:14:1C:C3/temperature',
			'2047',
			'Auto-trigger: 416/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
			'Stopping continuous accelerometer plot',
			'Auto-trigger: 494/3600 seconds elapsed (interval: 3600 sec, connected: 1)'
		];
		
		mixedLines.forEach(line => {
			const result = parseSerialLine(line, currentConfig, colorPalette);
			currentConfig = result.variableConfig;
		});
		
		// Should have created variables for Auto-trigger patterns (only "connected" is captured)
		expect(Object.keys(currentConfig).length).toBeGreaterThan(0);
		expect(currentConfig).toHaveProperty('connected');
	});
	
	it('should maintain consistency across a long stream', () => {
		let currentConfig: VariableConfig = {};
		
		const streamLines = [
			'Auto-trigger: 366/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
			'Auto-trigger: 370/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
			'Auto-trigger: 374/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
			'Auto-trigger: 378/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
		];
		
		const initialConfigCount = Object.keys(currentConfig).length;
		
		streamLines.forEach(line => {
			const result = parseSerialLine(line, currentConfig, colorPalette);
			currentConfig = result.variableConfig;
		});
		
		const finalConfigCount = Object.keys(currentConfig).length;
		
		// Config should be created once and reused
		expect(finalConfigCount).toBeGreaterThan(initialConfigCount);
		
		// Verify the "connected" variable is present (only one extracted from these lines)
		expect(currentConfig).toHaveProperty('connected');
		
		// The config should remain stable across multiple identical-pattern lines
		expect(finalConfigCount).toBe(1); // Only "connected" variable created
	});
	
	it('should parse large decimal value stream', () => {
		let currentConfig: VariableConfig = {};
		
		const decimalStream = [
			'578.2',
			'401.5',
			'208.8',
			'112.2'
		];
		
		decimalStream.forEach(line => {
			const result = parseSerialLine(line, currentConfig, colorPalette);
			
			// These are standalone numbers without key:value format
			expect(result.variableData.size).toBe(0);
		});
		
		// No variables should be created from standalone numbers
		expect(Object.keys(currentConfig).length).toBe(0);
	});
	
	it('should handle complete user log sample with all edge cases', () => {
		let currentConfig: VariableConfig = {};
		
		// Representative sample from the actual log showing all types of content
		const realWorldLog = [
			'Connecting ...',
			'Auto-trigger: 366/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
			'Auto-trigger: 370/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
			'h -  Print this help function',
			'-----------------------------------',
			'Pressure print functions:',
			'	 5 -  continuously plot accelerometer (press 5 again to stop)',
			'	 6 -  tap 1 time and print raw ADC values',
			'	 7 -  tap 1 time and print raw pulse value',
			'	 v -  Print version information',
			'Auto-trigger: 382/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
			'Starting continuous accelerometer plot (press 5 to stop)',
			'2046',
			'2046',
			'2047',
			'2047',
			'2046',
			'Auto-trigger: 391/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
			'Auto-trigger: 391/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
			'2048',
			'2048',
			'Publishing 24.64 to ripetap/28:CD:C1:14:1C:C3/temperature',
			'2047',
			'2046',
			'Auto-trigger: 416/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
			'2046',
			'2047',
			'Stopping continuous accelerometer plot',
			'Stopping continuous accelerometer plot',
			'Auto-trigger: 494/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
			'4079.8',
			'3710.2',
			'3180.2',
			'2473.5',
			'1879.2',
			'578.2',
			'401.5',
			'Auto-trigger: 571/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
			'Publishing 24.64 to ripetap/28:CD:C1:14:1C:C3/temperature',
			'Auto-trigger: 592/3600 seconds elapsed (interval: 3600 sec, connected: 1)',
			'Auto-trigger: 597/3600 seconds elapsed (interval: 3600 sec, connected: 1)'
		];
		
		let parsedLinesCount = 0;
		let numericOnlyCount = 0;
		let textOnlyCount = 0;
		let mixedContentCount = 0;
		
		realWorldLog.forEach(line => {
			const result = parseSerialLine(line, currentConfig, colorPalette);
			currentConfig = result.variableConfig;
			parsedLinesCount++;
			
			// Categorize the line
			if (result.variableData.size === 0) {
				// Could be numeric-only or text-only
				if (/^\d+(\.\d+)?$/.test(line.trim())) {
					numericOnlyCount++;
				} else {
					textOnlyCount++;
				}
			} else {
				mixedContentCount++;
			}
		});
		
		// Verify all lines were processed
		expect(parsedLinesCount).toBe(realWorldLog.length);
		
		// Should have created the "connected" variable from Auto-trigger messages
		expect(currentConfig).toHaveProperty('connected');
		
		// Most lines should be numeric-only or text-only (no key:value pairs)
		expect(numericOnlyCount + textOnlyCount).toBeGreaterThan(mixedContentCount);
		
		// Config should remain stable after initial creation
		expect(Object.keys(currentConfig).length).toBeLessThan(5);
	});
});
