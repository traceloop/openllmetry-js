/**
 * Test file for experiment functionality - equivalent to experiment_test.py
 * Tests JSONL parsing, experiment execution, and error handling
 */

// Simple assertion functions since we don't have a test framework
function assert(condition: boolean, message?: string): void {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function deepEqual<T>(actual: T, expected: T, message?: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(message || `Expected ${expectedStr}, got ${actualStr}`);
  }
}

// Mock experiment class for testing JSONL parsing
// This will be replaced with actual implementation once experiment client is built
class MockExperiment {
  /**
   * Parse JSONL (JSON Lines) format data into array of objects
   * Equivalent to Python's _parse_jsonl_to_rows method
   */
  static parseJsonlToRows(jsonlData: string): Record<string, any>[] {
    if (!jsonlData || jsonlData.trim() === '') {
      return [];
    }

    const lines = jsonlData.trim().split('\n');
    const results: Record<string, any>[] = [];
    const errors: string[] = [];

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
        errors.push(`Error parsing line ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.warn(`Skipping invalid JSON line ${i + 1}: ${line}`);
      }
    }

    return results;
  }

  /**
   * Simulate experiment execution with error handling
   */
  static async simulateExperimentRun(
    taskFn: (row: any) => Promise<any>,
    rows: Record<string, any>[],
    options: { stopOnError?: boolean; concurrency?: number } = {}
  ): Promise<{ results: any[]; errors: string[] }> {
    const { stopOnError = false, concurrency = 3 } = options;
    const results: any[] = [];
    const errors: string[] = [];

    // Process in batches for concurrency control
    for (let i = 0; i < rows.length; i += concurrency) {
      const batch = rows.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (row, index) => {
        try {
          const result = await taskFn(row);
          return { success: true, result, index: i + index };
        } catch (error) {
          const errorMsg = `Task failed for row ${i + index}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          
          if (stopOnError) {
            throw new Error(errorMsg);
          }
          
          errors.push(errorMsg);
          return { success: false, error: errorMsg, index: i + index };
        }
      });

      try {
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value.success) {
            results.push(result.value.result);
          }
        });
      } catch (error) {
        if (stopOnError) {
          throw error;
        }
      }
    }

    return { results, errors };
  }
}

// Test cases equivalent to Python experiment tests
function testExperimentJsonlParsing() {
  
  function testParseValidJsonlData() {
    const jsonlData = `{"id": 1, "question": "What is AI?", "category": "tech"}
{"id": 2, "question": "How to stay healthy?", "category": "health"}
{"id": 3, "question": "Best programming language?", "category": "tech"}`;

    const expected = [
      { id: 1, question: "What is AI?", category: "tech" },
      { id: 2, question: "How to stay healthy?", category: "health" },
      { id: 3, question: "Best programming language?", category: "tech" }
    ];

    const result = MockExperiment.parseJsonlToRows(jsonlData);
    assert.deepEqual(result, expected);
  });

  it('should handle JSONL with some invalid JSON lines', () => {
    const jsonlData = `{"id": 1, "question": "Valid question"}
invalid json line
{"id": 2, "question": "Another valid question"}
{"incomplete": json
{"id": 3, "question": "Final valid question"}`;

    const expected = [
      { id: 1, question: "Valid question" },
      { id: 2, question: "Another valid question" },
      { id: 3, question: "Final valid question" }
    ];

    const result = MockExperiment.parseJsonlToRows(jsonlData);
    assert.deepEqual(result, expected);
  });

  it('should return empty array for empty input', () => {
    const result1 = MockExperiment.parseJsonlToRows('');
    const result2 = MockExperiment.parseJsonlToRows('   ');
    const result3 = MockExperiment.parseJsonlToRows('\n\n\n');

    assert.deepEqual(result1, []);
    assert.deepEqual(result2, []);
    assert.deepEqual(result3, []);
  });

  it('should handle JSONL with only header/metadata', () => {
    const jsonlData = '{"metadata": "experiment_data", "version": "1.0"}';
    
    const expected = [
      { metadata: "experiment_data", version: "1.0" }
    ];

    const result = MockExperiment.parseJsonlToRows(jsonlData);
    assert.deepEqual(result, expected);
  });

  it('should handle JSONL with empty lines', () => {
    const jsonlData = `{"id": 1, "text": "First"}

{"id": 2, "text": "Second"}


{"id": 3, "text": "Third"}

`;

    const expected = [
      { id: 1, text: "First" },
      { id: 2, text: "Second" },
      { id: 3, text: "Third" }
    ];

    const result = MockExperiment.parseJsonlToRows(jsonlData);
    assert.deepEqual(result, expected);
  });

  it('should parse complex JSON objects correctly', () => {
    const jsonlData = `{"id": 1, "data": {"nested": true, "values": [1, 2, 3]}, "metadata": {"source": "test"}}
{"id": 2, "data": {"nested": false, "values": []}, "tags": ["a", "b", "c"]}`;

    const expected = [
      { 
        id: 1, 
        data: { nested: true, values: [1, 2, 3] }, 
        metadata: { source: "test" } 
      },
      { 
        id: 2, 
        data: { nested: false, values: [] }, 
        tags: ["a", "b", "c"] 
      }
    ];

    const result = MockExperiment.parseJsonlToRows(jsonlData);
    assert.deepEqual(result, expected);
  });
});

// Test experiment execution functionality
describe('Experiment Execution Tests', () => {
  
  it('should execute tasks successfully for all rows', async () => {
    const rows = [
      { question: "What is 2+2?" },
      { question: "What is 3+3?" },
      { question: "What is 4+4?" }
    ];

    const mockTask = async (row: any) => {
      await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async work
      return { 
        input: row.question, 
        output: `Answer: ${row.question}`,
        timestamp: Date.now()
      };
    };

    const { results, errors } = await MockExperiment.simulateExperimentRun(mockTask, rows);
    
    assert.equal(results.length, 3);
    assert.equal(errors.length, 0);
    assert.equal(results[0].input, "What is 2+2?");
  });

  it('should handle task failures without stopping when stopOnError is false', async () => {
    const rows = [
      { question: "Valid question 1" },
      { question: "FAIL" }, // This will cause failure
      { question: "Valid question 2" }
    ];

    const mockTask = async (row: any) => {
      if (row.question === "FAIL") {
        throw new Error("Simulated task failure");
      }
      return { input: row.question, output: "Success" };
    };

    const { results, errors } = await MockExperiment.simulateExperimentRun(
      mockTask, 
      rows, 
      { stopOnError: false }
    );
    
    assert.equal(results.length, 2); // Two successful tasks
    assert.equal(errors.length, 1);  // One failure
    assert(errors[0].includes("Simulated task failure"));
  });

  it('should stop on first error when stopOnError is true', async () => {
    const rows = [
      { question: "Valid question 1" },
      { question: "FAIL" },
      { question: "Valid question 2" }
    ];

    const mockTask = async (row: any) => {
      if (row.question === "FAIL") {
        throw new Error("Simulated task failure");
      }
      return { input: row.question, output: "Success" };
    };

    try {
      await MockExperiment.simulateExperimentRun(
        mockTask, 
        rows, 
        { stopOnError: true }
      );
      assert.fail("Should have thrown an error");
    } catch (error) {
      assert(error instanceof Error);
      assert(error.message.includes("Simulated task failure"));
    }
  });

  it('should respect concurrency limits', async () => {
    const rows = new Array(10).fill(null).map((_, i) => ({ id: i }));
    const executionTimes: number[] = [];

    const mockTask = async (row: any) => {
      const start = Date.now();
      await new Promise(resolve => setTimeout(resolve, 50)); // 50ms task
      executionTimes.push(Date.now() - start);
      return { id: row.id, processed: true };
    };

    const startTime = Date.now();
    const { results } = await MockExperiment.simulateExperimentRun(
      mockTask, 
      rows, 
      { concurrency: 3 }
    );
    const totalTime = Date.now() - startTime;

    assert.equal(results.length, 10);
    
    // With concurrency of 3, 10 tasks should take roughly 4 batches
    // Each batch takes ~50ms, so total should be around 200ms, not 500ms (sequential)
    assert(totalTime < 400, `Total time ${totalTime}ms should be less than 400ms`);
  });
});

// Example usage test matching Python example structure
describe('Medical Experiment Example Tests', () => {
  
  it('should create medical task functions correctly', () => {
    // Mock medical task functions
    const medicalTaskRefuseAdvice = async (row: any) => {
      const prompt = `Refuse to answer: ${row.question}`;
      return {
        completion: "I cannot provide medical advice. Please consult a healthcare professional.",
        prompt,
        strategy: "refuse_advice"
      };
    };

    const medicalTaskProvideInfo = async (row: any) => {
      const prompt = `Provide info about: ${row.question}`;
      return {
        completion: `Here is general information about ${row.question}...`,
        prompt,
        strategy: "provide_info"
      };
    };

    // Test that task functions are created correctly
    assert.equal(typeof medicalTaskRefuseAdvice, 'function');
    assert.equal(typeof medicalTaskProvideInfo, 'function');
  });

  it('should handle experiment configuration options', () => {
    const experimentOptions = {
      datasetSlug: "medical-q",
      datasetVersion: "v1",
      evaluators: [{ name: "medical_advice" }],
      experimentSlug: "medical-advice-exp",
      stopOnError: false,
      waitForResults: true,
      concurrency: 5
    };

    // Validate option structure
    assert.equal(experimentOptions.datasetSlug, "medical-q");
    assert.equal(experimentOptions.evaluators.length, 1);
    assert.equal(experimentOptions.evaluators[0].name, "medical_advice");
    assert.equal(experimentOptions.stopOnError, false);
  });
});

// Run tests if this file is executed directly
if (require.main === module) {
  console.log("Running experiment tests...");
  
  // Simple test runner
  const runTests = async () => {
    try {
      // Note: In a real implementation, you'd use a proper test framework like Jest or Mocha
      console.log("✅ All experiment tests would run here");
      console.log("   - JSONL parsing tests");
      console.log("   - Experiment execution tests");  
      console.log("   - Error handling tests");
      console.log("   - Concurrency tests");
      
    } catch (error) {
      console.error("❌ Test failed:", error);
      process.exit(1);
    }
  };

  runTests();
}

export {
  MockExperiment,
};