// MongoDB initialization script
// This runs when the MongoDB container starts for the first time

db = db.getSiblingDB('webinar_db');

// Create collections with validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['username', 'email', 'password', 'role', 'firstName', 'lastName'],
      properties: {
        username: {
          bsonType: 'string',
          minLength: 3,
          maxLength: 30
        },
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
        },
        password: {
          bsonType: 'string',
          minLength: 6
        },
        role: {
          bsonType: 'string',
          enum: ['admin', 'student']
        },
        firstName: {
          bsonType: 'string',
          maxLength: 50
        },
        lastName: {
          bsonType: 'string',
          maxLength: 50
        },
        isActive: {
          bsonType: 'bool'
        }
      }
    }
  }
});

db.createCollection('webinars', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['title', 'description', 'host', 'scheduledDate', 'duration', 'roomId'],
      properties: {
        title: {
          bsonType: 'string',
          maxLength: 200
        },
        description: {
          bsonType: 'string',
          maxLength: 2000
        },
        host: {
          bsonType: 'objectId'
        },
        scheduledDate: {
          bsonType: 'date'
        },
        duration: {
          bsonType: 'number',
          minimum: 15,
          maximum: 480
        },
        status: {
          bsonType: 'string',
          enum: ['scheduled', 'live', 'ended', 'cancelled']
        },
        roomId: {
          bsonType: 'string'
        },
        maxParticipants: {
          bsonType: 'number',
          minimum: 2,
          maximum: 1000
        }
      }
    }
  }
});

// Create indexes for better performance
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ role: 1 });

db.webinars.createIndex({ roomId: 1 }, { unique: true });
db.webinars.createIndex({ host: 1, scheduledDate: -1 });
db.webinars.createIndex({ status: 1, scheduledDate: -1 });
db.webinars.createIndex({ scheduledDate: 1 });
db.webinars.createIndex({ tags: 1 });

// Create default admin user (password: admin123)
db.users.insertOne({
  username: 'admin',
  email: 'admin@webinar.com',
  password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/Lg8/YNVWEjEzBTQ2G', // admin123
  role: 'admin',
  firstName: 'System',
  lastName: 'Administrator',
  isActive: true,
  preferences: {
    notifications: {
      email: true,
      browser: true
    },
    timezone: 'UTC'
  },
  createdAt: new Date(),
  updatedAt: new Date()
});

// Create sample student user (password: student123)
db.users.insertOne({
  username: 'student',
  email: 'student@webinar.com',
  password: '$2a$12$4OqIlMuKWFa3qk3zNF6Ntu1Uf4vGw3V4fBj9IyvP4K5E6G.yOFuCa', // student123
  role: 'student',
  firstName: 'John',
  lastName: 'Doe',
  isActive: true,
  preferences: {
    notifications: {
      email: true,
      browser: true
    },
    timezone: 'UTC'
  },
  createdAt: new Date(),
  updatedAt: new Date()
});

print('Database initialized successfully with sample users:');
print('Admin: admin@webinar.com / admin123');
print('Student: student@webinar.com / student123');