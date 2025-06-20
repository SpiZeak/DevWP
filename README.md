# DevWP

DevWP is a desktop application designed to simplify local WordPress development. It leverages Electron, React, and TypeScript to provide a user-friendly interface for managing WordPress sites within a Docker-powered Nginx and PHP environment.

## Features

*   **Simplified Site Management**: Easily create, configure, and manage local WordPress development sites.
*   **Isolated Environments**: Each site runs in its own Dockerized environment, ensuring no conflicts between projects.
*   **Integrated Nginx & PHP**: Comes pre-configured with Nginx and PHP, managed via Docker Compose.
*   **Email Testing with Mailpit**: Built-in email testing and debugging with Mailpit's web interface for capturing and viewing emails sent from your WordPress sites.
*   **SonarQube Integration**: Includes functionality to create and delete SonarQube projects for code quality analysis of your WordPress themes and plugins. (See [`createSonarQubeProject`](src/main/services/site.ts) and [`deleteSonarQubeProject`](src/main/services/site.ts))
*   **Automatic Placeholder Page**: Generates a default `index.html` for new sites to get you started quickly. (See [`generateIndexHtml`](src/main/services/site.ts))
*   **Cross-Platform**: Built with Electron for compatibility with Windows, macOS, and Linux.

## Tech Stack

*   **Frontend**: React, TypeScript
*   **Backend/Desktop**: Electron, Node.js, TypeScript
*   **Environment**: Docker, Docker Compose (Nginx, PHP, MariaDB, Mailpit, SonarQube)
*   **Package Manager**: Bun

## Prerequisites

Before you begin, ensure you have the following installed:

*   [Bun](https://bun.sh/)
*   [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine)

## Recommended IDE Setup

*   [VSCode](https://code.visualstudio.com/)
    *   [ESLint Extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
    *   [Prettier Extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Getting Started

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd DevWP
```

### 2. Install Dependencies

This project uses Bun for package management.

```bash
bun install
```

### 3. Configure Environment (if necessary)

*   Review Docker configurations in `compose.yml` and `config/`.
*   Ensure SonarQube credentials in `src/main/services/site.ts` (specifically within `createSonarQubeProject` and `deleteSonarQubeProject`) are appropriate for your local SonarQube instance. **Note:** The current implementation uses default credentials which is insecure for non-local or production-like SonarQube setups.

## Development

To run the application in development mode with hot-reloading:

```bash
bun run dev
```

This will start the Electron application. Changes in `src/main` or `src/renderer` will typically trigger a reload.

## Building the Application

You can build the application for different platforms:

```bash
# For Windows
bun run build:win

# For macOS
bun run build:mac

# For Linux
bun run build:linux
```

The built application will be located in the `dist` or a similar output directory specified by `electron-builder.yml`.

## How to Use

1.  **Launch DevWP**: Start the application after installing dependencies (`bun install`) and running in development (`bun run dev`) or by running a built executable.
2.  **Create a New Site**:
    *   Use the application's UI to define a new WordPress site (e.g., provide a domain name).
    *   DevWP will set up the necessary Docker containers (Nginx, PHP, MySQL, Mailpit), configure Nginx, and create a directory for your site files under `www/your-site-domain`.
    *   A placeholder `index.html` will be generated in the site's web root.
3.  **Access Your Site**:
    *   The application should provide you with the local URL (e.g., `https://your-site-domain.test`).
    *   You can then proceed to install WordPress or deploy your existing WordPress files into the `www/your-site-domain` directory.
4.  **Email Testing**:
    *   Access the Mailpit web interface at `http://localhost:8025` to view all emails sent from your WordPress sites.
    *   Configure your WordPress sites to use the SMTP settings: Host: `mailpit`, Port: `1025` (no authentication required).
5.  **SonarQube Integration**:
    *   Utilize the SonarQube integration features to create a project in your SonarQube instance corresponding to your WordPress site for code analysis.

## Project Structure

*   `.github/workflows/`: CI/CD workflows (if any).
*   `.vscode/`: VSCode specific settings.
*   `build/`: Icons and platform-specific build resources.
*   `config/`: Configuration files for services like Nginx and PHP used in Docker.
*   `resources/`: Static assets for the Electron application.
*   `src/`: Application source code.
    *   `main/`: Electron main process code (Node.js environment).
        *   `index.ts`: Main entry point for the Electron application.
        *   `services/`: Business logic, like site creation (`site.ts`).
    *   `preload/`: Scripts that run in a privileged environment before web pages are loaded in Electron.
    *   `renderer/`: Electron renderer process code (Chromium browser environment - React UI).
        *   `index.html`: Main HTML file for the renderer.
*   `www/`: Root directory where individual WordPress site files will be stored (e.g., `www/my-site.test/`).
*   `compose.yml`: Docker Compose configuration for managing services (Nginx, PHP, MariaDB, etc.).
*   `electron.vite.config.ts`: Configuration for Electron Vite.
*   `package.json`: Project metadata and dependencies.

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## License

Distributed under the MIT License. See `LICENSE` file for more information (if a `LICENSE` file is
