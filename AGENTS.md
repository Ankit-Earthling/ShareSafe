
# ShareSafe — Project Instructions

## 1. Project Overview
ShareSafe is a secure, temporary and permission-controlled file-sharing application.

Users can upload files and generate sharing links with:
- Configurable expiration.
- Maximum download limits.
- Optional password protection.
- Link revocation.
- Access tracking.

## 2. Technology Stack

### Frontend
- React
- Vite
- JavaScript
- HTML and CSS
- Bootstrap or Tailwind CSS (choose one when needed)

### Backend
- Node.js
- Express.js

### Database
- MongoDB
- Mongoose

### Security
- bcrypt for password hashing.
- JWT for authentication.
- Cryptographically secure random tokens.
- Input validation.
- Rate limiting.
- Secure file handling.

## 3. Architecture

Keep the frontend and backend separate.

Frontend communicates with the backend through REST APIs.

Backend communicates with MongoDB using Mongoose.

Uploaded file contents must not be stored directly in MongoDB.

Use local file storage during development.
Keep storage implementation modular so cloud object storage can be introduced later.

## 4. Folder Organization

frontend/
  src/
    assets/
    components/
    pages/
    context/
    services/
    hooks/

backend/
  config/
  controllers/
  middleware/
  models/
  routes/
  services/
  utils/
  uploads/

docs/

## 5. Coding Conventions

- Use JavaScript unless there is a justified reason otherwise.
- Prefer clear, readable and maintainable code.
- Use async/await for asynchronous operations.
- Separate routes, controllers, services and models.
- Use meaningful variable and function names.
- Avoid unnecessary abstractions.
- Add comments for non-obvious security logic.
- Follow consistent formatting.

## 6. Security Requirements

- Never store plaintext passwords.
- Never expose secrets or credentials.
- Never commit .env files.
- Validate user input.
- Restrict uploaded file types and sizes.
- Prevent path traversal.
- Never trust client-provided file paths.
- Protect private routes with authentication.
- Do not expose internal server errors to clients.
- Use cryptographically secure sharing tokens.
- Hash stored share tokens where appropriate.
- Prevent unauthorized file access.
- Handle download limits atomically.
- Ensure concurrent requests cannot exceed download limits.

## 7. Environment Variables

- Keep credentials in backend/.env.
- Maintain backend/.env.example with placeholder values.
- Never hardcode JWT secrets or database passwords.
- Validate required environment variables at startup.

## 8. Testing Requirements

- Test each feature before moving to the next.
- Include validation and error cases.
- Test unauthorized access.
- Test expiry and download limits.
- Test concurrent download attempts.
- Do not claim tests pass without running them.

## 9. Git Requirements

- Use feature-based branches when appropriate.
- Make small, meaningful commits.
- Never commit secrets, uploaded user files or dependencies.
- Keep changes focused on the requested task.

## 10. Codex Working Rules

- Inspect the existing project before modifying files.
- Explain the intended implementation before major changes.
- Do not generate the entire application in one operation.
- Do not overwrite existing work without checking it.
- Avoid unnecessary dependencies and frameworks.
- Do not modify unrelated files.
- Explain important implementation decisions.
- Report all files created or modified.
- Report commands executed and test results.
- Ask before making major architectural changes.

## 11. Development Workflow

For every feature:

1. Understand requirements.
2. Explain the design.
3. Implement a small part.
4. Review the code.
5. Run the application.
6. Test the feature.
7. Explain the implementation.
8. Commit working changes.

Build ShareSafe incrementally with security and maintainability as priorities.
