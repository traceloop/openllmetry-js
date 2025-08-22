import { TraceloopClient } from "../traceloop-client";
import type { 
  StreamEvent, 
  SSEClientOptions,
  SSEStreamEvent
} from "../../interfaces/evaluator.interface";
import type { ExecutionResponse } from "../../interfaces/experiment.interface";

// For Node.js environments
let EventSource: any;
try {
  // Try to import eventsource for Node.js
  const EventSourceModule = require('eventsource');
  // The eventsource package exports EventSource as the default export
  EventSource = EventSourceModule.default || EventSourceModule;
  console.log('EventSource loaded successfully:', typeof EventSource, 'constructor:', typeof EventSource === 'function');
} catch (error) {
  console.warn('Failed to load EventSource:', error);
  // EventSource not available (might be in browser or not installed)
  EventSource = null;
}

export class SSEClient {
  constructor(private client: TraceloopClient) {}

  /**
   * Stream events from a Server-Sent Events endpoint
   */
  async *streamEvents(
    url: string, 
    options: SSEClientOptions = {}
  ): AsyncIterable<StreamEvent> {
    const { timeout = 30000, headers = {}, withCredentials = false } = options;

    console.log('streamEvents called with:', { url, EventSourceAvailable: !!EventSource, typeof_EventSource: typeof EventSource });

    // Check if we're in a browser environment
    if (typeof window !== 'undefined' && window.EventSource) {
      console.log('Using browser EventSource');
      yield* this.streamEventsWithEventSource(url, { headers, withCredentials, timeout });
    } else if (EventSource && typeof EventSource === 'function') {
      // Node.js environment with eventsource package
      console.log('Using Node.js EventSource');
      yield* this.streamEventsWithNodeEventSource(url, { headers, timeout });
    } else {
      // Fallback to fetch-based streaming
      console.log('Using fetch-based streaming fallback');
      yield* this.streamEventsWithFetch(url, { headers, timeout });
    }
  }

  /**
   * Wait for execution result with streaming progress updates
   */
  async waitForResult(
    executionId: string, 
    timeout = 30000
  ): Promise<ExecutionResponse> {
    const url = `/v2/evaluators/executions/${executionId}/stream`;
    let lastResult: ExecutionResponse | null = null;

    try {
      for await (const event of this.streamEvents(url, { timeout })) {
        if (event.type === 'result' || event.type === 'complete') {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          
          lastResult = {
            executionId: executionId,
            result: {
              status: data.status || 'completed',
              result: data.result,
              error: data.error,
              progress: data.progress || 100,
              startedAt: data.startedAt,
              completedAt: data.completedAt || new Date().toISOString()
            }
          };

          if (event.type === 'complete' || data.status === 'completed' || data.status === 'failed') {
            break;
          }
        } else if (event.type === 'error') {
          const errorData = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          throw new Error(`Execution failed: ${errorData.error || 'Unknown error'}`);
        }
      }

      if (!lastResult) {
        throw new Error('No result received from execution stream');
      }

      return lastResult;
    } catch (error) {
      throw new Error(`Failed to wait for result: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stream events using browser EventSource API
   */
  private async *streamEventsWithEventSource(
    url: string, 
    options: { headers: Record<string, string>; withCredentials: boolean; timeout: number }
  ): AsyncIterable<StreamEvent> {
    const fullUrl = `${this.client['baseUrl']}${url}`;
    const eventSource = new window.EventSource(fullUrl, {
      withCredentials: options.withCredentials
    });

    const eventQueue: StreamEvent[] = [];
    let finished = false;
    let error: Error | null = null;

    const timeout = setTimeout(() => {
      error = new Error('SSE stream timeout');
      eventSource.close();
    }, options.timeout);

    eventSource.onmessage = (event: MessageEvent) => {
      const parsedEvent = this.parseSSEEvent(event.data);
      if (parsedEvent) {
        eventQueue.push(parsedEvent);
      }
    };

    eventSource.onerror = () => {
      error = new Error('SSE stream error');
      finished = true;
      eventSource.close();
    };

    eventSource.addEventListener('complete', () => {
      finished = true;
      eventSource.close();
    });

    try {
      while (!finished && !error) {
        if (eventQueue.length > 0) {
          yield eventQueue.shift()!;
        } else {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Yield remaining events
      while (eventQueue.length > 0) {
        yield eventQueue.shift()!;
      }

      if (error) {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
      eventSource.close();
    }
  }

  /**
   * Stream events using Node.js eventsource package
   */
  private async *streamEventsWithNodeEventSource(
    url: string, 
    options: { headers: Record<string, string>; timeout: number }
  ): AsyncIterable<StreamEvent> {
    const fullUrl = `${this.client['baseUrl']}${url}`;
    const eventSource = new EventSource(fullUrl, {
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.client['apiKey']}`,
        'X-Traceloop-SDK-Version': this.client['version']
      }
    });

    const eventQueue: StreamEvent[] = [];
    let finished = false;
    let error: Error | null = null;

    const timeout = setTimeout(() => {
      error = new Error('SSE stream timeout');
      eventSource.close();
    }, options.timeout);

    eventSource.onmessage = (event: any) => {
      const parsedEvent = this.parseSSEEvent(event.data);
      if (parsedEvent) {
        eventQueue.push(parsedEvent);
      }
    };

    eventSource.onerror = () => {
      error = new Error('SSE stream error');
      finished = true;
    };

    eventSource.addEventListener('complete', () => {
      finished = true;
    });

    try {
      while (!finished && !error) {
        if (eventQueue.length > 0) {
          yield eventQueue.shift()!;
        } else {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      while (eventQueue.length > 0) {
        yield eventQueue.shift()!;
      }

      if (error) {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
      eventSource.close();
    }
  }

  /**
   * Stream events using fetch API as fallback
   */
  private async *streamEventsWithFetch(
    url: string, 
    options: { headers: Record<string, string>; timeout: number }
  ): AsyncIterable<StreamEvent> {
    const fullUrl = `${this.client['baseUrl']}${url}`;
    console.log('Fetch SSE - Full URL:', fullUrl);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.log('Fetch SSE - Timeout reached');
      controller.abort();
    }, options.timeout);

    try {
      const response = await fetch(fullUrl, {
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Authorization': `Bearer ${this.client['apiKey']}`,
          'X-Traceloop-SDK-Version': this.client['version'],
          ...options.headers
        },
        signal: controller.signal
      });

      console.log('Fetch SSE - Response status:', response.status, response.statusText);
      console.log('Fetch SSE - Content-Type:', response.headers.get('content-type'));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get stream reader');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let eventCount = 0;

      console.log('Fetch SSE - Starting to read stream...');

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('Fetch SSE - Stream ended, total events:', eventCount);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        console.log('Fetch SSE - Received lines:', lines.length);

        for (const line of lines) {
          if (line.trim() === '') continue;
          
          console.log('Fetch SSE - Processing line:', line.substring(0, 100) + '...');
          
          const event = this.parseSSEEvent(line);
          if (event) {
            console.log('Fetch SSE - Parsed event:', event.type);
            eventCount++;
            yield event;
            
            if (event.type === 'complete') {
              console.log('Fetch SSE - Complete event received');
              return;
            }
          } else {
            console.log('Fetch SSE - Failed to parse line as event');
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Parse Server-Sent Event data format
   */
  private parseSSEEvent(rawData: string): StreamEvent | null {
    try {
      // Handle different SSE formats
      let eventData: any;
      let eventType = 'message';
      
      // Check if it's formatted as "data: {json}"
      if (rawData.startsWith('data: ')) {
        eventData = JSON.parse(rawData.substring(6));
      } else if (rawData.startsWith('{')) {
        // Direct JSON
        eventData = JSON.parse(rawData);
      } else {
        // Try to extract event type and data
        const lines = rawData.split('\n');
        const dataLines: string[] = [];
        
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            dataLines.push(line.substring(6));
          }
        }
        
        if (dataLines.length > 0) {
          const joinedData = dataLines.join('\n');
          eventData = JSON.parse(joinedData);
        } else {
          return null;
        }
      }

      return {
        type: eventData.type || eventType as any,
        data: eventData.data || eventData,
        timestamp: eventData.timestamp || new Date().toISOString(),
        id: eventData.id,
        event: eventType
      };
    } catch (error) {
      console.warn('Failed to parse SSE event:', rawData, error);
      return null;
    }
  }

  /**
   * Create a typed stream for specific event types
   */
  async *createTypedStream<T extends SSEStreamEvent>(
    url: string,
    options: SSEClientOptions = {}
  ): AsyncIterable<T> {
    const eventStream = this.streamEvents(url, options);
    const iterator = eventStream[Symbol.asyncIterator]();
    
    while (true) {
      const { done, value: event } = await iterator.next();
      if (done) break;
      yield event as unknown as T;
    }
  }
}