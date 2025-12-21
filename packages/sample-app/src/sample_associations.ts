import * as traceloop from "@traceloop/node-server-sdk";
import OpenAI from "openai";

// Initialize Traceloop
traceloop.initialize({
  appName: "associations_demo",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

const openai = new OpenAI();

/**
 * Sample chatbot that demonstrates the Associations API.
 * This example shows how to track users and sessions
 * across multiple LLM interactions.
 */
class ChatbotWithAssociations {
  constructor(
    private userId: string,
    private sessionId: string,
  ) {}

  /**
   * Process a multi-turn conversation with associations
   */
  @traceloop.workflow({ name: "chatbot_conversation" })
  async handleConversation() {
    console.log("\n=== Starting Chatbot Conversation ===");
    console.log(`User ID: ${this.userId}`);
    console.log(`Session ID: ${this.sessionId}\n`);

    // Set standard associations at the beginning of the conversation
    // These will be automatically attached to all spans within this context
    traceloop.Associations.set([
      [traceloop.AssociationProperty.USER_ID, this.userId],
      [traceloop.AssociationProperty.SESSION_ID, this.sessionId],
    ]);

    // Use withAssociationProperties to add custom properties
    // Custom properties (like chat_subject) will be prefixed with traceloop.association.properties
    return traceloop.withAssociationProperties(
      { chat_subject: "general" },
      async () => {
        // First message
        const greeting = await this.sendMessage(
          "Hello! What's the weather like today?",
        );
        console.log(`Bot: ${greeting}\n`);

        // Second message in the same conversation
        const followup = await this.sendMessage(
          "What should I wear for that weather?",
        );
        console.log(`Bot: ${followup}\n`);

        // Third message
        const final = await this.sendMessage("Thanks for the advice!");
        console.log(`Bot: ${final}\n`);

        return {
          greeting,
          followup,
          final,
        };
      },
    );
  }

  /**
   * Send a single message - this is a task within the workflow
   */
  @traceloop.task({ name: "send_message" })
  private async sendMessage(userMessage: string): Promise<string> {
    console.log(`User: ${userMessage}`);

    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: userMessage }],
      model: "gpt-3.5-turbo",
    });

    return completion.choices[0].message.content || "No response";
  }
}

/**
 * Simulate a customer service scenario with multiple customers
 */
async function customerServiceDemo() {
  return traceloop.withWorkflow(
    { name: "customer_service_scenario" },
    async () => {
      console.log("\n=== Customer Service Scenario ===\n");

      // Customer 1
      traceloop.Associations.set([
        [traceloop.AssociationProperty.CUSTOMER_ID, "cust-001"],
        [traceloop.AssociationProperty.USER_ID, "agent-alice"],
      ]);

      const customer1Response = await openai.chat.completions.create({
        messages: [
          {
            role: "user",
            content: "I need help with my order #12345",
          },
        ],
        model: "gpt-3.5-turbo",
      });

      console.log("Customer 1 (cust-001):");
      console.log(
        `Response: ${customer1Response.choices[0].message.content}\n`,
      );

      // Customer 2 - Update associations for new customer
      traceloop.Associations.set([
        [traceloop.AssociationProperty.CUSTOMER_ID, "cust-002"],
        [traceloop.AssociationProperty.USER_ID, "agent-bob"],
      ]);

      const customer2Response = await openai.chat.completions.create({
        messages: [
          {
            role: "user",
            content: "How do I return an item?",
          },
        ],
        model: "gpt-3.5-turbo",
      });

      console.log("Customer 2 (cust-002):");
      console.log(
        `Response: ${customer2Response.choices[0].message.content}\n`,
      );
    },
  );
}

/**
 * Main execution
 */
async function main() {
  console.log("============================================");
  console.log("Traceloop Associations API Demo");
  console.log("============================================");

  try {
    // Example 1: Multi-turn chatbot conversation with custom properties
    const chatbot = new ChatbotWithAssociations(
      "user-alice-456", // user_id
      "session-xyz-789", // session_id
    );

    await chatbot.handleConversation();

    // Example 2: Customer service with multiple customers
    await customerServiceDemo();

    console.log("\n=== Demo Complete ===");
    console.log(
      "Check your Traceloop dashboard to see the associations attached to traces!",
    );
    console.log(
      "You can filter and search by user_id, session_id, customer_id, or custom properties like chat_subject.",
    );
  } catch (error) {
    console.error("Error running demo:", error);
    process.exit(1);
  }
}

// Run the demo
main();
