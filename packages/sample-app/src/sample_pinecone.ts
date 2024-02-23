import * as traceloop from "@traceloop/node-server-sdk";
import { Pinecone } from "@pinecone-database/pinecone";

traceloop.initialize({
  appName: "sample_pinecone",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY || "DOESNOTEXIST",
});

class SamplePinecone {
  async cleanup_index() {
    await pc.deleteIndex("quickstart");
  }
  async initialize_index() {
    await pc.createIndex({
      name: "quickstart",
      dimension: 8,
      metric: "euclidean",
      spec: {
        serverless: {
          cloud: "aws",
          region: "us-west-2",
        },
      },
    });
  }

  @traceloop.workflow({ name: "sample_upsert" })
  async index_upsert() {
    const index = pc.index("quickstart");

    await index.namespace("ns1").upsert([
      {
        id: "vec1",
        values: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
      },
      {
        id: "vec2",
        values: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
      },
      {
        id: "vec3",
        values: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
      },
      {
        id: "vec4",
        values: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
      },
    ]);
  }

  @traceloop.workflow({ name: "sample_query" })
  async index_query() {
    const index = pc.index("quickstart");
    const queryResponse = await index.namespace("ns1").query({
      topK: 3,
      vector: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
      includeValues: true,
    });

    return queryResponse;
  }

  @traceloop.workflow({ name: "sample_delete" })
  async index_delete() {
    const index = pc.index("quickstart");
    await index.deleteOne("vec1");
    await index.deleteMany(["vec2", "vec3"]);
    await index.deleteAll();
  }
}

traceloop.withAssociationProperties(
  { user_id: "12345", chat_id: "789" },
  async () => {
    const samplePinecone = new SamplePinecone();
    await samplePinecone.initialize_index();
    await samplePinecone.index_upsert();
    // wait 30 seconds for pinecone to update to go through otherwise result can have 0 values.
    await new Promise((resolve) => setTimeout(resolve, 30000));
    const result = await samplePinecone.index_query();
    console.log(result);
    await samplePinecone.index_delete();
    await samplePinecone.cleanup_index();
  },
);
