# Contributing to LLMRouter

Thank you for your interest in contributing to LLMRouter! We welcome contributions from everyone.

Below is a guide to help you get started with contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Pull Requests](#pull-requests)
- [Local Development Setup](#local-development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

If you find a bug, please open an issue and include:
- A clear and descriptive title.
- Steps to reproduce the issue.
- Expected behavior versus actual behavior.
- Screenshots if applicable.
- Your environment details (Node.js version, OS, browser).

### Suggesting Enhancements

We are always looking for new ideas! To suggest an enhancement, please open an issue and explain:
- What the feature is and why it would be useful.
- How you envision it working.
- Any alternative solutions you've considered.

### Pull Requests

1. **Fork** the repository and create your branch from `main`.
2. **Install dependencies** and make sure the project builds and runs locally.
3. Make your changes.
4. **Test** your changes to ensure no existing functionality is broken.
5. **Commit** your changes with clear, descriptive commit messages.
6. **Submit a pull request** to the `main` branch.

---

## Local Development Setup

To set up LLMRouter for development:

1. **Clone your fork:**
   ```bash
   git clone https://github.com/your-username/LLMRouter.git
   cd LLMRouter
   ```

2. **Install dependencies:**
   This is a monorepo using npm workspaces. Run the following command in the root directory to install all dependencies:
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Copy the example environment file and configure it:
   ```bash
   cp .env.example .env
   ```
   *Note: In development mode, `ENCRYPTION_KEY` will be automatically generated if left blank.*

4. **Run the development servers:**
   To start both the client (Vite) and the server (Express) concurrently with hot-reloading:
   ```bash
   npm run dev
   ```
   The client will run on `http://localhost:10130` and proxy requests to the backend server on `http://localhost:2210`.

5. **Build the project:**
   To verify that everything compiles correctly before submitting your PR:
   ```bash
   npm run build
   ```

---

## Project Structure

- `client/`: React + Vite front-end dashboard
- `server/`: Express.js backend server with SQLite database integration
- `shared/`: Shared TypeScript interfaces and types
- `start.sh` / `start.bat`: Production start scripts for convenience

---

## Coding Standards

- **TypeScript:** Use TypeScript for all new code. Ensure types are properly defined and imported from `shared/` if they are shared.
- **Linting:** Ensure your code passes lint checks before committing. Run lint or formatting tools if available.
- **API Consistency:** If you are adding a new AI provider, implement the provider base class found in `server/src/providers/base.ts` and add it to `server/src/providers/index.ts`. Keep providers modular and isolated.
- **Database Migrations:** If you need to change the database schema, do not edit existing migration files in `server/src/db/migrations/`. Create a new migration file using:
  ```bash
  npm run db:migration:create -w server -- --name <migration-name>
  ```
  And then apply it.

Thank you again for contributing!
