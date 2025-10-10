const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

function setupSwagger(app) {
  const options = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'SafeRoute API',
        version: '1.0.0',
        description: 'API documentation for SafeRoute backend'
      },
      servers: [ { url: 'http://localhost:5000', description: 'Local server' } ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
        },
        schemas: {
          User: {
              type: 'object',
              required: ['_id','createdAt'],
              properties: {
                _id: { type: 'string', description: 'MongoDB ObjectId' },
                name: { type: 'string' },
                email: { type: 'string', nullable: true, format: 'email' },
                phone: { type: 'string', nullable: true },
                authProvider: { type: 'string', example: 'otp' },
                emergencyContacts: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { name: { type: 'string' }, phone: { type: 'string' } }
                  }
                },
                createdAt: { type: 'string', format: 'date-time' }
              },
              example: {
                _id: '64f1b2c3d4e5f6a7b8c9d012',
                name: 'Jane Doe',
                email: 'jane@example.com',
                phone: '+15551234567',
                authProvider: 'otp',
                emergencyContacts: [{ name: 'John Doe', phone: '+15557654321' }],
                createdAt: '2025-10-09T12:34:56.000Z'
              }
            },
          SafetyScore: {
              type: 'object',
              required: ['areaId','score'],
              properties: {
                _id: { type: 'string' },
                areaId: { type: 'string', description: 'Geohash area id' },
                score: { type: 'number', minimum: 0, maximum: 10 },
                factors: {
                  type: 'object',
                  properties: {
                    lighting: { type: 'number', minimum: 0, maximum: 10 },
                    crowd: { type: 'number', minimum: 0, maximum: 10 },
                    police: { type: 'number', minimum: 0, maximum: 10 },
                    incidents: { type: 'number', minimum: 0, maximum: 10 },
                    accidents: { type: 'number', minimum: 0, maximum: 10 }
                  }
                },
                lastUpdated: { type: 'string', format: 'date-time' }
              },
              example: {
                _id: '64f1b2c3d4e5f6a7b8c9d999',
                areaId: 'dr5regw',
                score: 6.5,
                factors: { lighting: 7, crowd: 6, police: 5, incidents: 4, accidents: 3 },
                lastUpdated: '2025-10-09T12:00:00.000Z'
              }
            },
          Route: {
              type: 'object',
              required: ['polyline','safety_score'],
              properties: {
                summary: { type: 'string' },
                polyline: { type: 'string' },
                distance: { type: 'object', description: 'Google distance object { text, value }' },
                duration: { type: 'object', description: 'Google duration object { text, value }' },
                safety_score: { type: ['number', 'string'], description: 'Average safety score or "N/A"' },
                color: { type: 'string' }
              },
              example: {
                summary: 'I-90 W',
                polyline: 'abcd1234encoded',
                distance: { text: '5.4 km', value: 5400 },
                duration: { text: '12 mins', value: 720 },
                safety_score: 7.2,
                color: 'green'
              }
            },
          Report: {
            type: 'object',
            required: ['type','location'],
            properties: {
              _id: { type: 'string' },
              user: { type: 'string' },
              type: { type: 'string', enum: ['harassment','theft','accident','dark_area','suspicious_activity'] },
              description: { type: 'string' },
              location: {
                type: 'object',
                required: ['lat','lng'],
                properties: { lat: { type: 'number' }, lng: { type: 'number' } }
              },
              severity: { type: 'number', minimum: 1, maximum: 5 },
              createdAt: { type: 'string', format: 'date-time' }
            },
            example: {
              _id: '64f1b2c3d4e5f6a7b8c90001',
              user: '64f1b2c3d4e5f6a7b8c90000',
              type: 'dark_area',
              description: 'Poorly lit alley behind the store',
              location: { lat: 40.7128, lng: -74.0060 },
              severity: 3,
              createdAt: '2025-10-09T11:22:33.000Z'
            }
          },
          SOSLog: {
            type: 'object',
            required: ['user','status','createdAt'],
            properties: {
              _id: { type: 'string' },
              user: { type: 'string' },
              location: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
              contactsNotified: { type: 'array', items: { type: 'string' } },
              status: { type: 'string', enum: ['triggered','sent','resolved'] },
              createdAt: { type: 'string', format: 'date-time' }
            },
            example: {
              _id: '64f1b2c3d4e5f6a7b8c90011',
              user: '64f1b2c3d4e5f6a7b8c90000',
              location: { lat: 40.7128, lng: -74.0060 },
              contactsNotified: ['+15551234567'],
              status: 'triggered',
              createdAt: '2025-10-09T12:34:56.000Z'
            }
          },
          Error: { type: 'object', properties: { error: { type: 'string' } } }
        ,
        AuthResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: { $ref: '#/components/schemas/User' }
          },
          example: {
            token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            user: { _id: '64f1b2c3d4e5f6a7b8c9d012', name: 'Jane Doe', email: 'jane@example.com' }
          }
        }
        }
      }
    },
    apis: ['./routes/*.js']
  };

  const spec = swaggerJsdoc(options);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
}

module.exports = setupSwagger;
