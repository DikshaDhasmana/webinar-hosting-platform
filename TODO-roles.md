# User Roles Implementation Plan

## Backend Changes
- [ ] Add role field to userSchema in server.js
- [ ] Update registration endpoint to accept and set default role ('student')
- [ ] Update login to include role in JWT token
- [ ] Update authentication middleware to include role in req.user
- [ ] Update createDefaultAdminUser to set 'admin' role

## Frontend Changes
- [ ] Update User interface in AuthContext to include role
- [ ] Update AuthContext to handle role from JWT
- [ ] Update admin layout to check for 'admin' role
- [ ] Update student layout to check for 'student' role
- [ ] Add role-based routing logic in main page

## Testing
- [ ] Test role-based authentication
- [ ] Verify admin/student portal access restrictions
- [ ] Test default admin user creation
