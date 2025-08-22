/**
 * Simple experiment functionality tests
 */

// Mock experiment class for testing JSONL parsing
class MockExperiment {
  /**
   * Parse JSONL (JSON Lines) format data into array of objects
   */
  static parseJsonlToRows(jsonlData: string): Record<string, any>[] {
    if (!jsonlData || jsonlData.trim() === '') {
      return [];
    }

    const lines = jsonlData.trim().split('\n');
    const results: Record<string, any>[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (line === '') {
        continue;
      }

      try {
        const parsed = JSON.parse(line);
        
        // Only add non-null objects
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          results.push(parsed);
        }
      } catch (error) {
        // Log parsing errors but continue processing
        console.warn(`Skipping invalid JSON line ${i + 1}: ${line}`);
      }
    }

    return results;
  }
}

// Simple test functions
function runJsonlParsingTests() {
  console.log("🧪 Running JSONL Parsing Tests...");

  // Test 1: Valid JSONL data
  const jsonlData = `{"id": 1, "question": "What is AI?", "category": "tech"}
{"id": 2, "question": "How to stay healthy?", "category": "health"}
{"id": 3, "question": "Best programming language?", "category": "tech"}`;

  const expected = [
    { id: 1, question: "What is AI?", category: "tech" },
    { id: 2, question: "How to stay healthy?", category: "health" },
    { id: 3, question: "Best programming language?", category: "tech" }
  ];

  const result = MockExperiment.parseJsonlToRows(jsonlData);
  
  if (JSON.stringify(result) === JSON.stringify(expected)) {
    console.log("✅ Valid JSONL parsing test passed");
  } else {
    console.error("❌ Valid JSONL parsing test failed");
    console.log("Expected:", expected);
    console.log("Got:", result);
  }

  // Test 2: JSONL with invalid lines
  const invalidJsonlData = `{"id": 1, "question": "Valid question"}
invalid json line
{"id": 2, "question": "Another valid question"}`;

  const expectedFiltered = [
    { id: 1, question: "Valid question" },
    { id: 2, question: "Another valid question" }
  ];

  const resultFiltered = MockExperiment.parseJsonlToRows(invalidJsonlData);
  
  if (JSON.stringify(resultFiltered) === JSON.stringify(expectedFiltered)) {
    console.log("✅ Invalid JSONL filtering test passed");
  } else {
    console.error("❌ Invalid JSONL filtering test failed");
    console.log("Expected:", expectedFiltered);
    console.log("Got:", resultFiltered);
  }

  // Test 3: Empty input
  const emptyResult = MockExperiment.parseJsonlToRows('');
  if (emptyResult.length === 0) {
    console.log("✅ Empty input test passed");
  } else {
    console.error("❌ Empty input test failed");
  }

  console.log("🧪 JSONL Parsing Tests completed\n");
}

// Run tests if this file is executed directly
if (require.main === module) {
  console.log("🚀 Starting Experiment Tests...\n");
  
  try {
    runJsonlParsingTests();
    console.log("🎉 All tests completed!");
  } catch (error) {
    console.error("❌ Test suite failed:", error);
    process.exit(1);
  }
}

export {
  MockExperiment,
  runJsonlParsingTests,
};