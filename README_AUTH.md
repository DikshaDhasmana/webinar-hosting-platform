# Webinar Platform Authentication Implementation

This document describes the authentication system implemented for the webinar platform to ensure only registered and authenticated users can create and join meetings.

## Overview

The authentication system uses JWT (JSON Web Tokens) with bcrypt for password hashing. User data is stored in Redis for scalability and performance.

## Implemented Features

1. **User Registration**
   - Secure password hashing with bcrypt
   - Email uniqueness validation
   - JWT token generation upon successful registration

2. **User Login**
   - Email and password validation
   - Password verification with bcrypt
   - JWT token generation upon successful login

3. **Protected Endpoints**
   - All webinar-related endpoints require authentication
   - WebSocket connections require JWT token in query parameters

4. **User Profile**
   - Endpoint to retrieve authenticated user information

## API Endpoints

### Authentication Endpoints

#### Register a New User
```
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword"
}

Response:
{
  "message": "User registered successfully",
  "userId": "uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "token": "jwt_token"
}
```

#### Login User
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword"
}

Response:
{
  "message": "Login successful",
  "userId": "uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "token": "jwt_token"
}
```

#### Get User Profile
```
GET /api/auth/profile
Authorization: Bearer jwt_token

Response:
{
  "userId": "uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "createdAt": timestamp
}
```

### Webinar Endpoints (All Protected)

#### Create a Webinar
```
POST /api/webinars
Authorization: Bearer jwt_token
Content-Type: application/json

{
  "title": "My Webinar",
  "maxParticipants": 100,
  "settings": {
    "allowParticipantVideo": true,
    "allowParticipantAudio": true
  }
}

Response:
{
  "webinarId": "WEB-ABC123",
  "hostId": "user_uuid",
  "title": "My Webinar",
  "maxParticipants": 100,
  "joinUrl": "https://example.com/join/WEB-ABC123"
}
```

#### Join a Webinar
```
POST /api/webinars/WEB-ABC123/join
Authorization: Bearer jwt_token
Content-Type: application/json

{
  "role": "attendee"
}

Response:
{
  "participantId": "user_uuid",
  "webinarId": "WEB-ABC123",
  "participantName": "John Doe",
  "role": "attendee",
  "webinarTitle": "My Webinar",
  "canSpeak": false
}
```

#### Get Webinar Details
```
GET /api/webinars/WEB-ABC123
Authorization: Bearer jwt_token

Response:
{
  "id": "WEB-ABC123",
  "title": "My Webinar",
  "participantCount": 1,
  "presenterCount": 0,
  "isLive": false,
  "startTime": null,
  "duration": 0
}
```

#### Get Chat Messages
```
GET /api/webinars/WEB-ABC123/messages
Authorization: Bearer jwt_token

Response:
[
  {
    "id": "message_uuid",
    "participantId": "user_uuid",
    "participantName": "John Doe",
    "message": "Hello everyone!",
    "timestamp": 1234567890,
    "role": "attendee"
  }
]
```

## WebSocket Authentication

WebSocket connections require a JWT token in the query parameters:

```
const socket = io('https://example.com', {
  query: {
    token: 'jwt_token'
  }
});
```

## Environment Variables

The following environment variables can be configured:

- `JWT_SECRET` - Secret key for JWT signing (default: 'webinar_platform_secret_key')
- `JWT_EXPIRES_IN` - JWT token expiration time (default: '24h')
- `REDIS_HOST` - Redis server host (default: 'localhost')
- `REDIS_PORT` - Redis server port (default: 6379)

## Security Features

1. **Password Security**
   - Passwords are hashed using bcrypt with 10 salt rounds
   - Plain text passwords are never stored

2. **Token Security**
   - JWT tokens are signed with a secret key
   - Tokens expire after 24 hours by default
   - Tokens are validated on all protected endpoints

3. **Rate Limiting**
   - API endpoints have rate limiting (100 requests per 15 minutes per IP)
   - Chat messages have rate limiting (10 messages per minute per user)

4. **Input Validation**
   - All user inputs are validated
   - Required fields are checked
   - Email format is validated

## Redis Data Structure

User data is stored in Redis with the following keys:

- `user:{userId}` - User profile data (JSON)
- `user:email:{email}` - Email to user ID mapping
- `user:password:{userId}` - Hashed password

## Implementation Details

### Authentication Middleware

The `authenticateToken` middleware verifies JWT tokens and attaches user data to the request object:

```javascript
const authenticateToken = async (req, res, next) => {
  // Extract and verify JWT token
  // Attach user data to req.user
  // Call next() if valid, return error if invalid
};
```

### WebSocket Authentication

WebSocket connections are authenticated during the connection handshake:

```javascript
io.on('connection', async (socket) => {
  // Extract token from socket.handshake.query.token
  // Verify token and attach user data to socket.user
  // Disconnect if invalid
});
```

## Testing the Implementation

A simple frontend demo is available at `public/index.html` that demonstrates:

1. User registration
2. User login
3. Webinar creation
4. Webinar joining
5. User profile retrieval

To test:
1. Start the server with `npm start`
2. Open `http://localhost:3000` in your browser
3. Register a new user
4. Login with the registered user
5. Create and join webinars

## Future Enhancements

Possible future enhancements include:

1. **Refresh Tokens** - For longer user sessions
2. **Role-Based Access Control** - More granular permissions
3. **Email Verification** - Confirm user email addresses
4. **Password Reset** - Allow users to reset forgotten passwords
5. **Two-Factor Authentication** - Additional security layer
