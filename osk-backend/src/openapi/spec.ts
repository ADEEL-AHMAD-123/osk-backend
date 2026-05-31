/**
 * Hand-authored OpenAPI 3.0 spec — kept inline so it lives next to the
 * code it documents. Mount via /api/v1/docs (Swagger UI). The shape
 * mirrors osk-frontend/src/contracts (the single source of truth for
 * client-side typing) so the two stay in lockstep.
 */

const successEnvelope = (dataSchema: Record<string, unknown>): Record<string, unknown> => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', enum: [true] },
    data: dataSchema,
    meta: { type: 'object', additionalProperties: true },
    requestId: { type: 'string' },
  },
  required: ['success', 'data'],
});

const errorEnvelope: Record<string, unknown> = {
  type: 'object',
  properties: {
    success: { type: 'boolean', enum: [false] },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'VALIDATION_ERROR' },
        message: { type: 'string' },
        details: { type: 'array', items: { type: 'object' } },
      },
      required: ['code', 'message'],
    },
    requestId: { type: 'string' },
  },
  required: ['success', 'error'],
};

const sessionUser = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string', format: 'email' },
    role: { type: 'string', enum: ['buyer', 'seller', 'agent', 'admin'] },
    emailVerified: { type: 'boolean' },
    avatarUrl: { type: 'string' },
  },
};

const property = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    slug: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    type: {
      type: 'string',
      enum: ['home', 'plot', 'commercial', 'rental'],
    },
    listingKind: { type: 'string', enum: ['resale', 'new-project'] },
    status: {
      type: 'string',
      enum: ['draft', 'pending-review', 'published', 'rejected', 'sold'],
    },
    price: { type: 'number' },
    currency: { type: 'string', example: 'USD' },
    bedrooms: { type: 'integer' },
    bathrooms: { type: 'integer' },
    areaSqft: { type: 'number' },
    locality: { type: 'string' },
    city: { type: 'string' },
    thumbnail: { type: 'string', format: 'uri' },
    isFeatured: { type: 'boolean' },
    location: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['Point'] },
        coordinates: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
          description: '[longitude, latitude]',
        },
      },
    },
  },
};

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'OSK API',
    version: '0.1.0',
    description:
      'OSK real-estate platform — buyer, seller, agent and admin endpoints. Every response is wrapped in a `{success, data, meta?, requestId}` envelope.',
  },
  servers: [{ url: '/api/v1', description: 'Versioned API surface' }],
  tags: [
    { name: 'Auth', description: 'Register, login, refresh, password reset' },
    { name: 'Properties', description: 'Public listings + owner workflows' },
    { name: 'Agents', description: 'Public agent directory + per-agent listings' },
    { name: 'Contact', description: 'Inquiry / callback / WhatsApp / email channels' },
    { name: 'Admin', description: 'Moderation, user management, audit log' },
  ],
  components: {
    securitySchemes: {
      bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      SessionUser: sessionUser,
      Property: property,
      Error: errorEnvelope,
    },
  },
  paths: {
    /* ── Auth ─────────────────────────────────────────────────── */
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', minLength: 2 },
                  email: { type: 'string', format: 'email' },
                  password: {
                    type: 'string',
                    minLength: 8,
                    description: 'Must include an uppercase letter and a number',
                  },
                  role: {
                    type: 'string',
                    enum: ['buyer', 'seller', 'agent'],
                    default: 'buyer',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Account created, session issued',
            content: {
              'application/json': {
                schema: successEnvelope({
                  type: 'object',
                  properties: {
                    user: { $ref: '#/components/schemas/SessionUser' },
                    accessToken: { type: 'string' },
                    accessTokenExpiresAt: { type: 'string', format: 'date-time' },
                  },
                }),
              },
            },
          },
          409: { description: 'Email already in use', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in with email + password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Session issued' },
          401: { description: 'Bad credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          403: { description: 'Account suspended', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate the refresh-token cookie and mint a new access token',
        responses: {
          200: { description: 'New access token + rotated cookie' },
          401: { description: 'Session expired or reuse detected' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke the current refresh-token family',
        responses: { 200: { description: 'Logged out' } },
      },
    },
    '/auth/session': {
      get: {
        tags: ['Auth'],
        summary: 'Get the authenticated user',
        security: [{ bearer: [] }],
        responses: {
          200: {
            description: 'Current session',
            content: {
              'application/json': {
                schema: successEnvelope({ $ref: '#/components/schemas/SessionUser' }),
              },
            },
          },
          401: { description: 'Missing or invalid token' },
        },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Issue a reset token (always 200, no user enumeration)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Email queued if account exists' } },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Consume a reset token + set a new password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'password'],
                properties: {
                  token: { type: 'string' },
                  password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Password updated' },
          401: { description: 'Invalid or expired token' },
        },
      },
    },

    /* ── Properties ───────────────────────────────────────────── */
    '/properties': {
      get: {
        tags: ['Properties'],
        summary: 'List published properties',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Full-text query' },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['home', 'plot', 'commercial', 'rental'] } },
          { name: 'listingKind', in: 'query', schema: { type: 'string', enum: ['resale', 'new-project'] } },
          { name: 'city', in: 'query', schema: { type: 'string' } },
          { name: 'minPrice', in: 'query', schema: { type: 'number' } },
          { name: 'maxPrice', in: 'query', schema: { type: 'number' } },
          { name: 'bedrooms', in: 'query', schema: { type: 'integer' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['-createdAt', 'createdAt', 'price', '-price'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 60 } },
        ],
        responses: {
          200: {
            description: 'Paginated property summaries',
            content: {
              'application/json': {
                schema: successEnvelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/Property' },
                }),
              },
            },
          },
        },
      },
      post: {
        tags: ['Properties'],
        summary: 'Create a draft listing',
        security: [{ bearer: [] }],
        responses: {
          201: { description: 'Listing created in draft status' },
          401: { description: 'Not authenticated' },
          403: { description: 'Wrong role (seller/agent/admin only)' },
        },
      },
    },
    '/properties/{slug}': {
      get: {
        tags: ['Properties'],
        summary: 'Get a property by slug',
        parameters: [
          { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Property detail' },
          404: { description: 'Not found' },
        },
      },
    },
    '/properties/{id}/submit': {
      post: {
        tags: ['Properties'],
        summary: 'Submit a draft for moderation',
        security: [{ bearer: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Status moves draft → pending-review' },
          409: { description: 'Listing is in a state that cannot be submitted' },
        },
      },
    },

    /* ── Agents ───────────────────────────────────────────────── */
    '/agents': {
      get: {
        tags: ['Agents'],
        summary: 'Public agent directory',
        responses: { 200: { description: 'Paginated agent profiles' } },
      },
    },
    '/agents/{id}/listings': {
      get: {
        tags: ['Agents'],
        summary: 'Published listings owned by a single agent',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Paginated property summaries' } },
      },
    },

    /* ── Contact ──────────────────────────────────────────────── */
    '/contact/{propertyId}/inquiry': {
      post: {
        tags: ['Contact'],
        summary: 'Send an inquiry to a listing owner (relayed email)',
        parameters: [{ name: 'propertyId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'message'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  phone: { type: 'string' },
                  message: { type: 'string', minLength: 10 },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Inquiry accepted' } },
      },
    },

    /* ── Admin ────────────────────────────────────────────────── */
    '/admin/overview': {
      get: {
        tags: ['Admin'],
        summary: 'Platform-wide metric counts',
        security: [{ bearer: [] }],
        responses: {
          200: { description: 'Counts for users, properties, inquiries, reviews' },
          403: { description: 'Not an admin' },
        },
      },
    },
    '/admin/properties/pending': {
      get: {
        tags: ['Admin'],
        summary: 'Listings awaiting moderation',
        security: [{ bearer: [] }],
        responses: { 200: { description: 'Paginated pending listings' } },
      },
    },
    '/admin/properties/{id}/approve': {
      post: {
        tags: ['Admin'],
        summary: 'Approve a pending listing (writes an audit entry)',
        security: [{ bearer: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Status → published' } },
      },
    },
    '/admin/properties/{id}/reject': {
      post: {
        tags: ['Admin'],
        summary: 'Reject a pending listing (writes an audit entry)',
        security: [{ bearer: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Status → rejected' } },
      },
    },
    '/admin/users/{id}': {
      patch: {
        tags: ['Admin'],
        summary: 'Change user role and/or status (audited)',
        security: [{ bearer: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['buyer', 'seller', 'agent', 'admin'] },
                  status: { type: 'string', enum: ['active', 'blocked'] },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated user' }, 404: { description: 'Not found' } },
      },
    },
    '/admin/audit-logs': {
      get: {
        tags: ['Admin'],
        summary: 'Privileged-action activity feed (TTL 365d)',
        security: [{ bearer: [] }],
        responses: { 200: { description: 'Paginated audit entries, newest first' } },
      },
    },
  },
} as const;
