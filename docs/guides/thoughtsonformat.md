For TypeScript, you have several excellent options for strict schema compliance with Ollama:

## 1. Native Ollama JavaScript Library + Zod (Recommended)

The **official Ollama JavaScript library** has built-in support for structured outputs using Zod schemas. This is the most straightforward approach: [ollama](https://ollama.com/blog/structured-outputs)

```typescript
import ollama from 'ollama';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const EntitySchema = z.object({
  name: z.string(),
  type: z.string(),
  properties: z.record(z.string()),
  relationships: z.array(z.object({
    target: z.string(),
    type: z.string()
  }))
});

const response = await ollama.chat({
  model: 'granite3.3:8b',
  messages: [{ role: 'user', content: 'Extract entities from: ...' }],
  format: zodToJsonSchema(EntitySchema),
});

const entity = EntitySchema.parse(JSON.parse(response.message.content));
```

This provides type-safe parsing and validation with automatic schema conversion. [deepwiki](https://deepwiki.com/ollama/ollama-js/5.3-structured-outputs)

## 2. Vercel AI SDK with Ollama Provider

The **Vercel AI SDK** (formerly AI SDK) with the `@ai-sdk/ollama` provider offers a more feature-rich solution with automatic structured output detection: [tanstack](https://tanstack.com/ai/latest/docs/guides/structured-outputs)

```typescript
import { ollama } from '@ai-sdk/ollama';
import { generateObject } from 'ai';
import { z } from 'zod';

const { object } = await generateObject({
  model: ollama('granite3.3:8b', { 
    structuredOutputs: true // auto-enabled for generateObject
  }),
  schema: z.object({
    entities: z.array(z.object({
      name: z.string(),
      type: z.string().describe('Entity type like PERSON, ORG, LOCATION'),
      confidence: z.number()
    }))
  }),
  prompt: 'Extract entities from: ...'
});
```

The AI SDK automatically handles provider-specific implementation details and supports streaming with `streamObject`. [npmjs](https://www.npmjs.com/package/ai-sdk-ollama)

## 3. Instructor-JS

**Instructor-JS** provides a TypeScript port of the popular Python Instructor library, offering more advanced features like retries and validation: [github](https://github.com/567-labs/instructor-js)

```typescript
import Instructor from '@instructor-ai/instructor';
import Ollama from 'ollama';
import { z } from 'zod';

const client = Instructor({
  client: new Ollama(),
  mode: "JSON"
});

const extraction = await client.chat.completions.create({
  model: "granite3.3:8b",
  messages: [{ role: "user", content: "..." }],
  response_model: { 
    schema: EntitySchema,
    name: "EntityExtraction"
  }
});
```

Instructor-JS provides better error handling and automatic retries when schema validation fails. [github](https://github.com/567-labs/instructor-js)

## 4. ModelFusion (Legacy Option)

**ModelFusion** is an older TypeScript framework specifically designed for structured generation with Ollama and Zod. While still functional, the newer options above are more actively maintained. [modelfusion](https://modelfusion.dev/blog/generate-structured-information-ollama/)

## Best Practices

- Include field descriptions using `.describe()` in your Zod schemas—this helps the model understand the expected output structure [tanstack](https://tanstack.com/ai/latest/docs/guides/structured-outputs)
- For maximum reliability, mention key field names in your prompt alongside the schema [youtube](https://www.youtube.com/watch?v=ljQ0i-F34a4)
- Use Granite 3.3:8b or Llama 3.2 for best structured output compliance [reddit](https://www.reddit.com/r/ollama/comments/1k6ronv/models_to_extract_entities_from_pdf/)

The **Vercel AI SDK** offers the most polished TypeScript experience with excellent type inference and streaming support, while the **native Ollama library** provides the simplest setup if you just need basic structured extraction. [npmjs](https://www.npmjs.com/package/ai-sdk-ollama)