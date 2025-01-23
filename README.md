# Server

A TypeScript server built with Bun

## Getting Started

```bash
# Install dependencies
bun install

# Run the server
bun run server.ts

# Run tests
bun test
```

## Architecture

The server follows a service-oriented architecture with clear separation of concerns:

### Directory Structure

```
server/
├── src/
│   ├── services/          # Business logic layer
│   ├── routes/           # API route handlers
│   │   └── subscription/
│   │       └── utils/    # Route-specific utilities
│   ├── utils/           # Shared utilities
│   ├── schema/          # Database schema definitions
│   └── env.ts           # Environment configuration
├── e2e/                # End-to-end tests
└── drizzle/            # Database migrations
```

### Key Components

1. **Services Layer** (`/src/services/`)
   - Contains business logic
   - Handles database operations
   - Examples: `SubscriptionService`, `AuthService`
   - Services are injectable and testable

2. **Routes Layer** (`/src/routes/`)
   - API endpoint definitions
   - Request validation using Zod
   - Routes are grouped by feature

3. **Database Layer**
   - Uses Drizzle ORM
   - Migrations in `/drizzle`
   - Schema definitions in `/src/schema`

## Testing

The project uses Bun's test runner for end-to-end tests. Example from `auth.test.ts`:

```typescript
describe('Auth Operations', () => {
    const api = new APIInterface(API_CONFIG);
    const authApi = new AuthAPI(api);
    
    test('registration works', async () => {
        const response = await authApi.register(testUser);
        expect(response.user).toBeDefined();
    });
});
```

Key testing principles:

- Tests run against a real server instance
- Each test suite handles its own cleanup
- Helpers for common operations (e.g., `ensureLoggedOut`)
- Comprehensive coverage of error cases

## Stripe Integration

### Setting Up Stripe Webhooks

1. **Get Webhook Secret**

   ```bash
   # Install Stripe CLI
   brew install stripe/stripe-cli/stripe

   # Login to Stripe
   stripe login

   # Start webhook forwarding
   stripe listen --forward-to localhost:3000/api/webhook/stripe
   ```

2. **Configure Environment**

   ```env
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   ```

3. **Webhook Events**
   The server handles these Stripe events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `payment_method.attached`
   - `payment_method.detached`

### Local Development with Stripe

1. **Forward Webhooks**

   ```bash
   # Start webhook forwarding
   stripe listen --forward-to localhost:3000/api/webhook/stripe

   # The CLI will display a webhook signing secret
   # Use this secret in your .env file
   ```

2. **Test Webhooks**

   ```bash
   # Trigger test events
   stripe trigger payment_intent.succeeded
   ```

3. **Monitor Webhook Events**

   ```bash
   # View webhook logs
   stripe webhooks logs
   ```

### Webhook Implementation

The webhook handler (`/src/routes/subscription/webhook-routes.ts`):

1. Verifies Stripe signature
2. Routes events to appropriate handlers
3. Updates database accordingly
4. Handles errors gracefully

Example webhook flow:

```typescript
router.post({
    path: '/api/webhook/stripe',
    auth: false,
}, async (req) => {
    // Verify webhook signature
    const event = stripe.webhooks.constructEvent(
        await req.text(),
        req.headers.get('stripe-signature')!,
        webhookSecret
    );

    // Handle the event
    await webhookService.handleWebhook(event);
});
```

## Environment Variables

Required environment variables:

```env
DATABASE_URL=
JWT_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

## Development Workflow

1. **Start the Server**

   ```bash
   bun run server.ts
   ```

2. **Run Tests**

   ```bash
   bun test          # Run all tests
   bun test e2e     # Run e2e tests only
   ```

3. **Database Migrations**

   ```bash
   bun run migrate
   ```

## API Documentation

The server uses a strongly-typed router with built-in validation, and error handling. Here's an example route implementation:

```typescript
// Define validation schemas
const todoRouteValidation = {
    create: {
        body: z.object({
            title: z.string(),
            description: z.string().optional(),
            dueDate: z.string().optional(),
            completed: z.boolean().optional()
        })
    },
    update: {
        params: z.object({
            id: z.string().uuid()
        }),
        body: z.object({
            title: z.string().optional(),
            description: z.string().optional(),
            dueDate: z.string().optional(),
            completed: z.boolean().optional()
        })
    }
} as const;

// Define API error responses
const API_ERRORS = {
    NOT_FOUND: (details?: unknown) =>
        json.error('Resource not found', 404, details),
    UNAUTHORIZED: (details?: unknown) =>
        json.error('Unauthorized access', 401, details),
    INTERNAL_ERROR: (error: unknown) => {
        console.error('Internal server error:', error);
        return json.error('Internal server error', 500);
    }
} as const;

// Route implementation
router.post(
    '/api/todos',
    {
        validation: todoRouteValidation.create,
        auth: true
    },
    async (req, { body }) => {
        try {
            const [todo] = await db.insert(todos)
                .values({
                    title: body.title,
                    description: body.description,
                    dueDate: body.dueDate ? new Date(body.dueDate) : null,
                    completed: body.completed ?? false
                })
                .returning();

            return json(todo, { status: 201 });
        } catch (error) {
            return API_ERRORS.INTERNAL_ERROR(error);
        }
    }
);
```

### Router Features

1. **Type-Safe Validation**

   ```typescript
   const validation = {
       create: {
           body: z.object({ /* schema */ }),
           params: z.object({ /* schema */ }),
           query: z.object({ /* schema */ })
       }
   } as const;
   ```

3. **Error Handling**

   ```typescript
   try {
       // Route logic
   } catch (error) {
       return json.error('Error message', 500, error);
   }
   ```

4. **Response Helpers**

   ```typescript
   // JSON responses with proper typing
   return json(data, { 
       status: 201,
       headers: { /* custom headers */ }
   });
   ```

### Route Configuration

Each route can specify:

1. **Path Parameters**

   ```typescript
   router.get(
       '/api/todos/:id',
       {
           validation: {
               params: z.object({
                   id: z.string().uuid()
               })
           }
       },
       async (req, { params }) => {
           // params.id is typed as string
       }
   );
   ```

2. **Query Parameters**

   ```typescript
   router.get(
       '/api/todos',
       {
           validation: {
               query: z.object({
                   completed: z.boolean().optional(),
                   limit: z.number().optional()
               })
           }
       },
       async (req, { query }) => {
           // query is fully typed
       }
   );
   ```

3. **Request Body**

   ```typescript
   router.post(
       '/api/todos',
       {
           validation: {
               body: z.object({
                   title: z.string(),
                   completed: z.boolean()
               })
           }
       },
       async (req, { body }) => {
           // body is fully typed
       }
   );
   ```

### Error Handling Pattern

The recommended pattern for handling errors:

```typescript
const API_ERRORS = {
    NOT_FOUND: (details?: unknown) =>
        json.error('Resource not found', 404, details),
    UNAUTHORIZED: (details?: unknown) =>
        json.error('Unauthorized access', 401, details),
    INTERNAL_ERROR: (error: unknown) => {
        console.error('Internal server error:', error);
        return json.error('Internal server error', 500);
    }
} as const;

router.get(
    '/api/resource/:id',
    {
        validation: {
            params: z.object({
                id: z.string().uuid()
            })
        },
        auth: true
    },
    async (req, { params }) => {
        try {
            const resource = await db.findResource(params.id);
            
            if (!resource) {
                return API_ERRORS.NOT_FOUND();
            }
            
            if (resource.userId !== req.auth!.userId) {
                return API_ERRORS.UNAUTHORIZED();
            }
            
            return json(resource);
        } catch (error) {
            return API_ERRORS.INTERNAL_ERROR(error);
        }
    }
);
```

## Route Validation

The server uses Zod for runtime validation of request data. Each route can specify validation schemas for different parts of the request:

```typescript
const quizValidation = {
    createQuiz: {
        body: z.object({
            categoryId: z.string(),
            totalQuestions: z.number().min(1).max(50),
        }),
        query: z.object({
            difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
        }),
        params: z.object({
            userId: z.string().uuid(),
        }),
    },
} as const;

router.post<typeof quizValidation.createQuiz>({
    path: '/api/quiz/:userId',
    validation: quizValidation.createQuiz,
    auth: true,
}, async (req, { body, query, params }) => {
    // Types are automatically inferred:
    // body: { categoryId: string; totalQuestions: number }
    // query: { difficulty?: 'easy' | 'medium' | 'hard' }
    // params: { userId: string }
});
```

### Validation Features

1. **Request Parts**
   - `body`: Request body validation
   - `query`: URL query parameters
   - `params`: URL path parameters
   - `headers`: Custom headers (optional)

2. **Type Inference**

   ```typescript
   type RouteConfig = typeof quizValidation.createQuiz;
   type RequestBody = z.infer<RouteConfig['body']>;
   type QueryParams = z.infer<RouteConfig['query']>;
   ```

3. **Error Handling**

   ```typescript
   // Automatic error responses for invalid data
   {
     "error": "Validation Error",
     "issues": [
       {
         "path": ["body", "totalQuestions"],
         "message": "Number must be less than or equal to 50"
       }
     ]
   }
   ```

## Type Safety and Schema Inference

The server uses Drizzle ORM with TypeScript for full type safety from database to API. Here's how it works:

### Schema Definition and Type Inference

1. **Database Schema** (`schema.ts`):

```typescript
export const questions = pgTable('questions', {
    id: uuid('id').defaultRandom().primaryKey(),
    type: varchar('type', { length: 50 }).notNull(),
    categoryId: uuid('category_id')
        .notNull()
        .references(() => questionCategories.id),
    questionText: text('question_text').notNull(),
    options: text('options').array().notNull(),
    // ... other fields
});

// Infer the type from the schema
type Question = InferSelectModel<typeof questions>;
```

2. **Service Layer** (`quiz-service.ts`):

```typescript
import { questions, questionCategories } from "shared";
import type { InferSelectModel } from "drizzle-orm";

// Inferred types from schema
type Question = InferSelectModel<typeof questions>;
type QuestionCategory = InferSelectModel<typeof questionCategories>;

export class QuizService {
    async createQuestion(data: CreateQuestionInput): Promise<Question> {
        const [question] = await db
            .insert(questions)
            .values(data)
            .returning();

        return question; // Fully typed return value
    }
}
```

### Type Safety Benefits

1. **Automatic Type Updates**
   - Schema changes automatically update all dependent types
   - TypeScript errors catch mismatches immediately

2. **Input/Output Type Safety**

   ```typescript
   // Input types can extend schema types
   type CreateQuestionInput = Pick<Question, 
       'type' | 'categoryId' | 'questionText'
   > & {
       options: string[];
       correctAnswer: string;
   };
   ```

3. **Query Type Safety**

   ```typescript
   // Drizzle provides type-safe query building
   const result = await db
       .select()
       .from(questions)
       .where(eq(questions.categoryId, categoryId));
   // result is typed as Question[]
   ```

### Service Pattern Example

Here's a complete example showing the flow from schema to API:

```typescript
// 1. Schema Definition
const questionCategories = pgTable('question_categories', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 100 }).notNull().unique(),
    description: text('description'),
});

// 2. Type Inference
type QuestionCategory = InferSelectModel<typeof questionCategories>;

// 3. Service Implementation
class QuizService {
    async createCategory(data: {
        name: string;
        description?: string;
    }): Promise<QuestionCategory> {
        const [category] = await db
            .insert(questionCategories)
            .values(data)
            .returning();
        return category;
    }
}

// 4. Route Handler
const validation = {
    createCategory: {
        body: z.object({
            name: z.string().min(1).max(100),
            description: z.string().optional(),
        })
    }
} as const;

router.post<typeof validation.createCategory>({
    path: '/api/categories',
    validation: validation.createCategory,
    auth: true,
}, async (req, { body }) => {
    const category = await quizService.createCategory(body);
    return json(category);
});
```

This pattern ensures:

- Full type safety from database to API
- Runtime validation of all inputs
- Automatic type updates when schema changes
- Clear separation of concerns
- Easy testing and maintenance

## Testing Architecture

The server implements a comprehensive testing strategy with both unit tests and end-to-end (E2E) tests.

### Test Structure

```
server/
├── e2e/
│   ├── config/          # Test configuration
│   ├── scripts/         # Setup and teardown scripts
│   │   ├── setup-test-db.ts
│   │   ├── setup-test-user.ts
│   │   ├── teardown-test-db.ts
│   │   ├── manage-test-server.ts
│   │   └── run-e2e-tests.ts
│   ├── temp/           # Temporary test files
│   ├── tests/          # E2E test suites
│   │   └── auth.test.ts
│   └── utils/          # Test utilities
├── src/
    └── __tests__/      # Unit tests
```

### Test Scripts

The `package.json` includes various test commands:

```json
{
  "scripts": {
    "test": "bun --env-file=.env.test test src/",
    "test:watch": "bun --env-file=.env.test test --watch src/",
    "test:e2e-only": "bun --env-file=.env.test test e2e/tests/",
    "test:all": "bun --env-file=.env.test test src/ && bun --env-file=.env.test test:e2e",
    "test:setup-db": "bun --env-file=.env.test run e2e/scripts/setup-test-db.ts",
    "test:setup-user": "bun --env-file=.env.test run e2e/scripts/setup-test-user.ts",
    "test:teardown-db": "bun --env-file=.env.test run e2e/scripts/teardown-test-db.ts",
    "test:server": "bun --env-file=.env.test run e2e/scripts/manage-test-server.ts",
    "test:e2e": "bun --env-file=.env.test run e2e/scripts/run-e2e-tests.ts"
  }
}
```

### E2E Testing Flow

1. **Setup Phase**

   ```bash
   # 1. Setup test database
   bun test:setup-db
   
   # 2. Create test user
   bun test:setup-user
   
   # 3. Start test server (port 3001)
   bun test:server
   ```

2. **Test Execution**

   ```bash
   # Run E2E tests
   bun test:e2e
   ```

3. **Cleanup Phase**

   ```bash
   # Teardown test database
   bun test:teardown-db
   ```

### E2E Test Example

Here's an example from `auth.test.ts` showing how E2E tests work:

```typescript
describe('Auth Operations', () => {
    const api = new APIInterface(API_CONFIG);
    const authApi = new AuthAPI(api);
    
    const testUser: LoginRegisterInput = {
        email: `test-${Date.now()}@example.com`,
        password: 'TestPassword123!'
    };

    // Helper to ensure clean state
    const ensureLoggedOut = async () => {
        try {
            await authApi.logout();
            api.setTokens('', '');
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            // Ignore logout errors in cleanup
        }
    };

    beforeAll(async () => {
        await ensureLoggedOut();
    });

    test('registration works', async () => {
        const response = await authApi.register(testUser);
        
        expect(response.error).toBeUndefined();
        expect(response.user).toBeDefined();
        expect(response.user?.email).toBe(testUser.email);
        
        await ensureLoggedOut();
    });
});
```

### Test Environment

The E2E tests use:

- Separate test database (specified in `.env.test`)
- Test server running on port 3001
- Clean database state for each test suite
- Real HTTP requests to test the full stack

### Key Testing Features

1. **Database Integration**
   - Tests run against a real PostgreSQL database
   - Automatic schema migration for test database
   - Data cleanup between test suites

2. **Server Management**
   - Automated server startup/shutdown
   - Port management to avoid conflicts
   - Environment isolation

3. **Test Utilities**

   ```typescript
   // e2e/utils/get-auth-test-api.ts
   export const getAuthTescounttApi = () => {
       const api = new APIInterface({
           baseUrl: 'http://localhost:3001',
           // Test-specific configuration
       });
       return new AuthAPI(api);
   };
   ```

4. **Test Lifecycle**

   ```typescript
   // Example test lifecycle
   beforeAll(async () => {
       // Setup test environment
       await setupTestDatabase();
       await startTestServer();
   });

   afterAll(async () => {
       // Cleanup
       await teardownTestDatabase();
       await stopTestServer();
   });
   ```

### Best Practices

1. **Test Isolation**
   - Each test suite manages its own state
   - Cleanup after each test
   - No shared state between tests

2. **Error Handling**
   - Test both success and failure cases
   - Verify error responses
   - Check error message content

3. **Data Verification**
   - Check database state after operations
   - Verify response formats
   - Test data relationships
